import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  CanvasObject,
  CanvasStrokeObject,
  CanvasTool,
  ClientTelemetry,
  COLLABORATOR_COLORS,
  ConnectionState,
  FONTS,
  MAX_USERS_PER_ROOM,
  Participant,
  ServerMessage,
  ServerReactionMessage,
} from "../../shared/types.js";
import { LocalUndoManager } from "./canvas/undoManager.js";
import { CanvasView } from "./components/CanvasView.js";
import { Header } from "./components/Header.js";
import { JoinScreen } from "./components/JoinScreen.js";
import { LeaveConfirm } from "./components/LeaveConfirm.js";
import { PresenceSidebar } from "./components/PresenceSidebar.js";
import { ReactionPicker } from "./components/ReactionPicker.js";
import { StyleToolbar } from "./components/StyleToolbar.js";
import { TelemetryDrawer } from "./components/TelemetryDrawer.js";
import { ToastMessage, ToastNotification } from "./components/ToastNotification.js";
import { Toolbar } from "./components/Toolbar.js";
import { LocalCursorEngine } from "./realtime/cursorEngine.js";
import { RemoteCursorInterpolator } from "./realtime/interpolator.js";
import { TelemetryManager } from "./realtime/telemetry.js";
import { RealtimeWebSocketClient } from "./realtime/wsClient.js";

const WS_SERVER_URL =
  (import.meta as any).env?.VITE_WS_URL ||
  `ws://${window.location.hostname}:4000`;

export const App: React.FC = () => {
  // Core realtime engines (persistent across renders)
  const wsClient = useMemo(() => new RealtimeWebSocketClient(WS_SERVER_URL), []);
  const cursorEngine = useMemo(() => new LocalCursorEngine(wsClient), [wsClient]);
  const interpolator = useMemo(() => new RemoteCursorInterpolator(), []);
  const telemetryManager = useMemo(() => new TelemetryManager(wsClient), [wsClient]);
  const undoManager = useMemo(() => new LocalUndoManager(), []);

  // Application & Connection state
  const [connectionState, setConnectionState] = useState<ConnectionState>("DISCONNECTED");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [hostId, setHostId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string>("design-lab");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [objects, setObjects] = useState<CanvasObject[]>([]);

  const isHost = currentUserId !== null && currentUserId === hostId;

  // Canvas tool & style settings
  const [activeTool, setActiveTool] = useState<CanvasTool>("pen");
  const [color, setColor] = useState<string>(COLLABORATOR_COLORS[0]);
  const [size, setSize] = useState<number>(4);
  const [font, setFont] = useState<string>(FONTS[0]);
  const [fontSize, setFontSize] = useState<number>(24);
  const [fill, setFill] = useState<boolean>(false);

  // Reaction state
  const [activeReactions, setActiveReactions] = useState<ServerReactionMessage[]>([]);
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);

  // Telemetry & dev tools
  const [telemetry, setTelemetry] = useState<ClientTelemetry>({
    rtt: 0,
    fps: 60,
    outgoingRate: 0,
    incomingRate: 0,
    bufferedBytes: 0,
    staleDrops: 0,
    reconnectCount: 0,
  });
  const [isTelemetryOpen, setIsTelemetryOpen] = useState(false);
  const [interpolationDelay, setInterpolationDelay] = useState(60);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const addToast = useCallback((type: "error" | "warning" | "info", text: string) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // Initialize Connection state listeners and message router
  useEffect(() => {
    const unsubState = wsClient.onStateChange((state) => {
      setConnectionState(state);
      if (state === "CONNECTED") {
        addToast("info", "Connected to FlowSpace room");
      } else if (state === "RECONNECTING") {
        addToast("warning", "Connection interrupted. Reconnecting with resume token...");
      } else if (state === "ROOM_FULL") {
        addToast("error", "Room is currently full (8/8 users maximum)");
      } else if (state === "LEFT") {
        setCurrentUserId(null);
        setHostId(null);
        setParticipants([]);
        setObjects([]);
        interpolator.clear();
        undoManager.clear();
      }
    });

    const unsubMsg = wsClient.onMessage((message: ServerMessage) => {
      switch (message.type) {
        case "welcome": {
          setCurrentUserId(message.userId);
          undoManager.setCurrentUserId(message.userId);
          setColor(message.color);
          if (message.hostId) {
            setHostId(message.hostId);
          }
          break;
        }

        case "room_snapshot": {
          setParticipants(message.users);
          setObjects(message.objects);
          interpolator.initializeFromSnapshot(message.cursors);
          if (message.hostId) {
            setHostId(message.hostId);
          }
          break;
        }

        case "presence_join": {
          setParticipants((prev) => {
            const exists = prev.some((p) => p.userId === message.user.userId);
            if (exists) {
              return prev.map((p) => (p.userId === message.user.userId ? message.user : p));
            }
            return [...prev, message.user];
          });
          addToast("info", `${message.user.displayName} joined the room`);
          break;
        }

        case "presence_leave": {
          setParticipants((prev) => prev.filter((p) => p.userId !== message.userId));
          interpolator.removeUser(message.userId);
          break;
        }

        case "cursor": {
          interpolator.handleCursorMessage(message);
          break;
        }

        case "stroke": {
          setObjects((prev) => {
            const existingIndex = prev.findIndex((o) => o.objectId === message.strokeId);
            if (existingIndex >= 0) {
              const updated = [...prev];
              const stroke = { ...(updated[existingIndex] as CanvasStrokeObject) };
              stroke.points = [...stroke.points, ...message.points];
              updated[existingIndex] = stroke;
              return updated;
            } else {
              const newStroke: CanvasStrokeObject = {
                objectId: message.strokeId,
                creatorId: message.creatorId,
                type: "stroke",
                color: message.color,
                size: message.size,
                opacity: message.opacity,
                isHighlighter: !!message.isHighlighter,
                points: message.points,
                createdAt: Date.now(),
              };
              return [...prev, newStroke];
            }
          });
          break;
        }

        case "shape_create": {
          setObjects((prev) => {
            if (prev.some((o) => o.objectId === message.object.objectId)) return prev;
            return [...prev, message.object];
          });
          break;
        }

        case "text_create": {
          setObjects((prev) => {
            if (prev.some((o) => o.objectId === message.object.objectId)) return prev;
            return [...prev, message.object];
          });
          break;
        }

        case "erase": {
          setObjects((prev) => prev.filter((o) => o.objectId !== message.objectId));
          break;
        }

        case "clear_canvas": {
          setObjects([]);
          undoManager.clear();
          addToast("info", "Whiteboard canvas cleared by Room Creator");
          break;
        }

        case "reaction": {
          setActiveReactions((prev) => [...prev, message]);
          setTimeout(() => {
            setActiveReactions((prev) => prev.filter((r) => r.id !== message.id));
          }, 2000);
          break;
        }

        case "error": {
          addToast("error", `${message.code}: ${message.message}`);
          break;
        }

        case "app_pong": {
          telemetryManager.handlePong(message);
          break;
        }
      }
    });

    // Start RAF interpolator & Telemetry manager
    interpolator.start();
    telemetryManager.start();

    const telemetryInterval = setInterval(() => {
      setTelemetry(telemetryManager.getTelemetry());
    }, 500);

    return () => {
      unsubState();
      unsubMsg();
      interpolator.stop();
      telemetryManager.stop();
      clearInterval(telemetryInterval);
    };
  }, [wsClient, interpolator, telemetryManager, undoManager, addToast]);

  // Handle Joining
  const handleJoin = (targetRoomId: string, displayName: string, preferredColor: string, isCreating?: boolean) => {
    setRoomId(targetRoomId);
    cursorEngine.resetSequence();
    wsClient.connect(targetRoomId, displayName, preferredColor, isCreating);
  };

  // Handle Canvas Clear (Room Creator action)
  const handleClearCanvas = () => {
    if (!isHost) return;
    wsClient.clearCanvas();
    setObjects([]);
    undoManager.clear();
    addToast("info", "You cleared the whiteboard canvas");
  };

  // Handle Leaving
  const handleConfirmLeave = () => {
    setShowLeaveConfirm(false);
    cursorEngine.resetSequence();
    wsClient.leaveRoom();
  };

  // Canvas Object Add/Remove handlers for local user
  const handleAddLocalObject = (newObj: CanvasObject) => {
    if (connectionState === "LEAVING" || connectionState === "LEFT") return;
    setObjects((prev) => {
      if (prev.some((o) => o.objectId === newObj.objectId)) return prev;
      return [...prev, newObj];
    });
  };

  const handleRemoveObject = (objectId: string) => {
    if (connectionState === "LEAVING" || connectionState === "LEFT") return;
    setObjects((prev) => prev.filter((o) => o.objectId !== objectId));
  };

  // Reactions
  const handleSendReaction = (emoji: string) => {
    if (connectionState === "LEAVING" || connectionState === "LEFT") return;
    const rx = 0.4 + (Math.random() * 0.2);
    const ry = 0.4 + (Math.random() * 0.2);
    wsClient.send({
      type: "reaction",
      id: `rx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      emoji,
      x: rx,
      y: ry,
    });
  };

  // Undo / Redo
  const handleUndo = () => {
    if (connectionState === "LEAVING" || connectionState === "LEFT") return;
    const action = undoManager.undo();
    if (!action) return;

    if (action.type === "create") {
      // Erase the object
      handleRemoveObject(action.object.objectId);
      wsClient.send({
        type: "erase",
        objectId: action.object.objectId,
      });
    } else if (action.type === "erase") {
      // Restore the object
      handleAddLocalObject(action.object);
      if (action.object.type === "shape") {
        wsClient.send({
          type: "shape_create",
          shapeId: action.object.objectId,
          shapeType: action.object.shapeType,
          color: action.object.color,
          size: action.object.size,
          opacity: action.object.opacity,
          startX: action.object.startX,
          startY: action.object.startY,
          endX: action.object.endX,
          endY: action.object.endY,
          fill: action.object.fill,
        });
      } else if (action.object.type === "text") {
        wsClient.send({
          type: "text_create",
          textId: action.object.objectId,
          x: action.object.x,
          y: action.object.y,
          content: action.object.content,
          color: action.object.color,
          font: action.object.font,
          fontSize: action.object.fontSize,
        });
      }
    }
  };

  const handleRedo = () => {
    if (connectionState === "LEAVING" || connectionState === "LEFT") return;
    const action = undoManager.redo();
    if (!action) return;

    if (action.type === "create") {
      handleAddLocalObject(action.object);
      if (action.object.type === "shape") {
        wsClient.send({
          type: "shape_create",
          shapeId: action.object.objectId,
          shapeType: action.object.shapeType,
          color: action.object.color,
          size: action.object.size,
          opacity: action.object.opacity,
          startX: action.object.startX,
          startY: action.object.startY,
          endX: action.object.endX,
          endY: action.object.endY,
          fill: action.object.fill,
        });
      } else if (action.object.type === "text") {
        wsClient.send({
          type: "text_create",
          textId: action.object.objectId,
          x: action.object.x,
          y: action.object.y,
          content: action.object.content,
          color: action.object.color,
          font: action.object.font,
          fontSize: action.object.fontSize,
        });
      }
    } else if (action.type === "erase") {
      handleRemoveObject(action.object.objectId);
      wsClient.send({
        type: "erase",
        objectId: action.object.objectId,
      });
    }
  };

  // Keyboard Shortcuts (stable ref prevents listener re-registration churn on render)
  const keyActionsRef = useRef({ handleUndo, handleRedo, connectionState });
  useEffect(() => {
    keyActionsRef.current = { handleUndo, handleRedo, connectionState };
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      const { handleUndo: undo, handleRedo: redo, connectionState: state } = keyActionsRef.current;
      if (state === "LEAVING" || state === "LEFT") return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (e.key.toLowerCase() === "v") {
        setActiveTool("select");
      } else if (e.key.toLowerCase() === "p") {
        setActiveTool("pen");
      } else if (e.key.toLowerCase() === "h") {
        setActiveTool("highlighter");
      } else if (e.key.toLowerCase() === "e") {
        setActiveTool("eraser");
      } else if (e.key.toLowerCase() === "t") {
        setActiveTool("text");
      } else if (e.key.toLowerCase() === "r") {
        setActiveTool("rectangle");
      } else if (e.key.toLowerCase() === "o") {
        setActiveTool("circle");
      } else if (e.key.toLowerCase() === "l") {
        setActiveTool("line");
      } else if (e.key.toLowerCase() === "a") {
        setActiveTool("arrow");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);



  const handleUpdateInterpolationDelay = (delay: number) => {
    setInterpolationDelay(delay);
    interpolator.setInterpolationDelay(delay);
  };

  return (
    <div className="app-container">
      {/* Toast Notifications */}
      <ToastNotification toasts={toasts} />

      {/* Leave Confirmation Modal */}
      <LeaveConfirm
        open={showLeaveConfirm}
        onCancel={() => setShowLeaveConfirm(false)}
        onConfirm={handleConfirmLeave}
      />

      {/* Join Screen Modal if not connected */}
      {connectionState === "DISCONNECTED" || connectionState === "LEFT" || connectionState === "ROOM_FULL" ? (
        <JoinScreen
          onJoin={handleJoin}
          isRoomFull={connectionState === "ROOM_FULL"}
        />
      ) : (
        <>
          {/* Main Top Header */}
          <Header
            roomId={roomId}
            userCount={participants.length}
            maxUsers={MAX_USERS_PER_ROOM}
            connectionState={connectionState}
            telemetry={telemetry}
            isHost={isHost}
            onClearCanvas={handleClearCanvas}
            onLeave={() => setShowLeaveConfirm(true)}
            onToggleTelemetry={() => setIsTelemetryOpen((prev) => !prev)}
            isTelemetryOpen={isTelemetryOpen}
          />

          {/* Canvas Viewport */}
          <CanvasView
            wsClient={wsClient}
            cursorEngine={cursorEngine}
            interpolator={interpolator}
            undoManager={undoManager}
            participants={participants}
            currentUserId={currentUserId}
            isHost={isHost}
            objects={objects}
            onAddLocalObject={handleAddLocalObject}
            onRemoveObject={handleRemoveObject}
            activeTool={activeTool}
            color={color}
            size={size}
            font={font}
            fontSize={fontSize}
            fill={fill}
            onContainerRectChange={setCanvasRect}
          />

          {/* Left Floating Tools */}
          <Toolbar
            activeTool={activeTool}
            onSelectTool={setActiveTool}
            canUndo={undoManager.canUndo()}
            canRedo={undoManager.canRedo()}
            onUndo={handleUndo}
            onRedo={handleRedo}
          />

          {/* Bottom Style Settings */}
          <StyleToolbar
            activeTool={activeTool}
            color={color}
            onChangeColor={setColor}
            size={size}
            onChangeSize={setSize}
            font={font}
            onChangeFont={setFont}
            fontSize={fontSize}
            onChangeFontSize={setFontSize}
            fill={fill}
            onToggleFill={setFill}
          />

          {/* Right Participant Slots Panel */}
          <PresenceSidebar
            participants={participants}
            currentUserId={currentUserId}
          />

          {/* Reaction Picker Dock */}
          <ReactionPicker
            onSendReaction={handleSendReaction}
            activeReactions={activeReactions}
            canvasRect={canvasRect}
          />

          {/* Diagnostics Telemetry Drawer */}
          <TelemetryDrawer
            isOpen={isTelemetryOpen}
            onClose={() => setIsTelemetryOpen(false)}
            telemetry={telemetry}
            interpolationDelay={interpolationDelay}
            onChangeInterpolationDelay={handleUpdateInterpolationDelay}
          />
        </>
      )}
    </div>
  );
};
