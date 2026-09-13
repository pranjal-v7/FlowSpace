import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  CanvasObject,
  CanvasShapeObject,
  CanvasStrokeObject,
  CanvasTextObject,
  CanvasTool,
  MAX_POINTS_PER_STROKE_MSG,
  Participant,
} from "../shared/types.js";
import { CanvasRenderer } from "../canvas/canvasRenderer.js";
import { LocalUndoManager } from "../canvas/undoManager.js";
import { LocalCursorEngine } from "../realtime/cursorEngine.js";
import { RemoteCursorInterpolator } from "../realtime/interpolator.js";
import { RealtimeWebSocketClient } from "../realtime/wsClient.js";
import { RemoteCursorOverlay } from "./RemoteCursorOverlay.js";
import {
  Camera,
  screenToWorld,
  worldToScreen,
  zoomAtScreenPoint,
  sanitizeCamera,
  DEFAULT_ZOOM,
} from "../canvas/coordinates.js";
import { Minus, Plus, Home } from "lucide-react";

interface CanvasViewProps {
  wsClient: RealtimeWebSocketClient;
  cursorEngine: LocalCursorEngine;
  interpolator: RemoteCursorInterpolator;
  undoManager: LocalUndoManager;
  participants: Participant[];
  currentUserId: string | null;
  isHost?: boolean;
  objects: CanvasObject[];
  onAddLocalObject: (object: CanvasObject) => void;
  onRemoveObject: (objectId: string) => void;
  activeTool: CanvasTool;
  color: string;
  size: number;
  font: string;
  fontSize: number;
  fill: boolean;
  onContainerRectChange: (rect: DOMRect) => void;
}

export const CanvasView: React.FC<CanvasViewProps> = ({
  wsClient,
  cursorEngine,
  interpolator,
  undoManager,
  participants,
  currentUserId,
  isHost = false,
  objects,
  onAddLocalObject,
  onRemoveObject,
  activeTool,
  color,
  size,
  font,
  fontSize,
  fill,
  onContainerRectChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);

  // Local Camera state (100% Client-side, never sent over WebSocket)
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: DEFAULT_ZOOM });
  const cameraRef = useRef<Camera>(camera);
  useEffect(() => {
    cameraRef.current = camera;
    interpolator.setCamera(camera);
    if (rendererRef.current) {
      const activePreview = currentStrokeRef.current || previewShapeRef.current;
      rendererRef.current.render(objectsRef.current, activePreview, highlightedObjectIdRef.current, camera);
    }
  }, [camera, interpolator]);

  // Spacebar pan navigation state
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const isSpacePressedRef = useRef(false);

  // Active Panning state
  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ clientX: number; clientY: number; camX: number; camY: number }>({
    clientX: 0,
    clientY: 0,
    camX: 0,
    camY: 0,
  });

  // Camera smooth transition state
  const animRef = useRef<{
    startX: number;
    startY: number;
    targetX: number;
    targetY: number;
    startTime: number;
    duration: number;
    rafId: number;
  } | null>(null);

  const cancelCameraAnimation = useCallback(() => {
    if (animRef.current) {
      cancelAnimationFrame(animRef.current.rafId);
      animRef.current = null;
    }
  }, []);

  const animateCameraTo = useCallback((targetX: number, targetY: number) => {
    cancelCameraAnimation();

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      setCamera((prev) => sanitizeCamera({ ...prev, x: targetX, y: targetY }));
      return;
    }

    const startX = cameraRef.current.x;
    const startY = cameraRef.current.y;
    const startTime = performance.now();
    const duration = 280; // 280ms cubic ease-out

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Cubic ease-out
      const ease = 1 - Math.pow(1 - progress, 3);

      const currentX = startX + (targetX - startX) * ease;
      const currentY = startY + (targetY - startY) * ease;

      setCamera((prev) => sanitizeCamera({ ...prev, x: currentX, y: currentY }));

      if (progress < 1) {
        if (animRef.current) {
          animRef.current.rafId = requestAnimationFrame(step);
        }
      } else {
        animRef.current = null;
      }
    };

    animRef.current = {
      startX,
      startY,
      targetX,
      targetY,
      startTime,
      duration,
      rafId: requestAnimationFrame(step),
    };
  }, [cancelCameraAnimation]);

  useEffect(() => {
    return () => {
      cancelCameraAnimation();
    };
  }, [cancelCameraAnimation]);

  // Touch tracking for pinch-zoom and 2-finger panning
  const touchPointersRef = useRef<Map<number, { clientX: number; clientY: number }>>(new Map());
  const lastPinchRef = useRef<{ dist: number; center: { x: number; y: number } } | null>(null);
  const touchStartedStrokeIdRef = useRef<string | null>(null);

  // Drawing state
  const isPointerDownRef = useRef(false);
  const currentStrokeRef = useRef<CanvasStrokeObject | null>(null);
  const strokeBatchRef = useRef<[number, number][]>([]);
  const previewShapeRef = useRef<CanvasShapeObject | null>(null);
  const [highlightedObjectId, setHighlightedObjectId] = useState<string | null>(null);
  const highlightedObjectIdRef = useRef<string | null>(null);
  highlightedObjectIdRef.current = highlightedObjectId;

  // Inline text editing state (stored in world coordinates)
  const [editingText, setEditingText] = useState<{
    id: string;
    worldX: number;
    worldY: number;
    text: string;
  } | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  // Keep latest objects in ref for stable render access
  const objectsRef = useRef(objects);
  useEffect(() => {
    objectsRef.current = objects;
  }, [objects]);

  // Handle Spacebar hotkey for quick hand-panning
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space" && !e.repeat && !isSpacePressedRef.current) {
        setIsSpacePressed(true);
        isSpacePressedRef.current = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsSpacePressed(false);
        isSpacePressedRef.current = false;
        if (isPanningRef.current) {
          isPanningRef.current = false;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Initialize CanvasRenderer & Resize observer
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const renderer = new CanvasRenderer(canvasRef.current);
    rendererRef.current = renderer;

    const handleResize = () => {
      if (!containerRef.current || !canvasRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      onContainerRectChange(rect);
      interpolator.setViewport(rect.width, rect.height);
      renderer.handleResize();
      renderer.render(objectsRef.current, null, highlightedObjectIdRef.current, cameraRef.current);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [onContainerRectChange]);

  // Re-render canvas whenever objects change
  useEffect(() => {
    if (rendererRef.current) {
      const activePreview = currentStrokeRef.current || previewShapeRef.current;
      rendererRef.current.render(objects, activePreview, highlightedObjectId, cameraRef.current);
    }
  }, [objects, highlightedObjectId]);

  // Wheel event for zoom focused towards cursor, and 2-finger trackpad scroll pan
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    cancelCameraAnimation();
    e.preventDefault();

    const rect = containerRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    if (e.ctrlKey || e.metaKey) {
      // Pinch gesture or Ctrl + Wheel Zoom
      const zoomFactor = Math.exp(-e.deltaY * 0.01);
      const nextCamera = zoomAtScreenPoint(
        screenX,
        screenY,
        cameraRef.current,
        cameraRef.current.zoom * zoomFactor
      );
      setCamera(nextCamera);
    } else if (e.shiftKey) {
      // Shift + Wheel -> horizontal pan
      setCamera((prev) => ({
        ...prev,
        x: prev.x - e.deltaY,
      }));
    } else {
      // Standard wheel: Smooth zoom towards cursor
      const zoomDelta = e.deltaY < 0 ? 1.1 : 0.9;
      const nextCamera = zoomAtScreenPoint(
        screenX,
        screenY,
        cameraRef.current,
        cameraRef.current.zoom * zoomDelta
      );
      setCamera(nextCamera);
    }
  }, []);

  // Handle pointer down
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!containerRef.current || !currentUserId) return;
    cancelCameraAnimation();

    // Track touch pointers for multi-touch pinch/pan
    touchPointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

    // Multi-touch Pinch / Pan handler for touchscreens
    if (touchPointersRef.current.size >= 2) {
      // Clean up any single-finger stroke created before the second finger touched down
      if (currentStrokeRef.current) {
        wsClient.send({
          type: "erase",
          objectId: currentStrokeRef.current.objectId,
        });
        currentStrokeRef.current = null;
        strokeBatchRef.current = [];
      }
      touchStartedStrokeIdRef.current = null;
      if (previewShapeRef.current) {
        previewShapeRef.current = null;
      }
      isPointerDownRef.current = false;

      // Release any active pointer captures so both touch pointers receive events smoothly
      try {
        for (const pointerId of touchPointersRef.current.keys()) {
          e.currentTarget.releasePointerCapture(pointerId);
        }
      } catch {
        // ignore
      }

      const pts = Array.from(touchPointersRef.current.values());
      const dist = Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY);
      const rect = containerRef.current.getBoundingClientRect();
      const center = {
        x: (pts[0].clientX + pts[1].clientX) / 2 - rect.left,
        y: (pts[0].clientY + pts[1].clientY) / 2 - rect.top,
      };
      lastPinchRef.current = { dist, center };
      if (rendererRef.current) {
        rendererRef.current.render(objectsRef.current, null, highlightedObjectIdRef.current, cameraRef.current);
      }
      return;
    }

    // Check for Pan actions: Middle mouse button (button === 1), Spacebar + Left click, or Select tool drag on background
    const isMiddleClick = e.button === 1 || (e.buttons & 4) !== 0;
    const isSpacePan = isSpacePressedRef.current || activeTool === "select";

    if (isMiddleClick || isSpacePan) {
      isPanningRef.current = true;
      panStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        camX: cameraRef.current.x,
        camY: cameraRef.current.y,
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      return;
    }

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    const rect = containerRef.current.getBoundingClientRect();
    isPointerDownRef.current = true;

    // Screen to World Coordinates conversion
    const { x: worldX, y: worldY } = screenToWorld(
      e.clientX - rect.left,
      e.clientY - rect.top,
      cameraRef.current
    );

    if (activeTool === "pen" || activeTool === "highlighter") {
      const strokeId = `s_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const isHigh = activeTool === "highlighter";
      const strokeObj: CanvasStrokeObject = {
        objectId: strokeId,
        creatorId: currentUserId,
        type: "stroke",
        color,
        size: isHigh ? Math.max(16, size * 2.5) : size,
        opacity: isHigh ? 0.45 : 1,
        isHighlighter: isHigh,
        points: [[worldX, worldY]],
        createdAt: Date.now(),
      };

      currentStrokeRef.current = strokeObj;
      strokeBatchRef.current = [[worldX, worldY]];
      if (e.pointerType === "touch") {
        touchStartedStrokeIdRef.current = strokeId;
      }

      // Dispatch initial stroke point in world coordinates
      wsClient.send({
        type: "stroke",
        strokeId,
        color: strokeObj.color,
        size: strokeObj.size,
        opacity: strokeObj.opacity,
        isHighlighter: isHigh,
        points: [[worldX, worldY]],
      });

      if (rendererRef.current) {
        rendererRef.current.render(objectsRef.current, strokeObj, null, cameraRef.current);
      }
    } else if (
      activeTool === "rectangle" ||
      activeTool === "circle" ||
      activeTool === "line" ||
      activeTool === "arrow"
    ) {
      const shapeId = `shp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const shapeObj: CanvasShapeObject = {
        objectId: shapeId,
        creatorId: currentUserId,
        type: "shape",
        shapeType: activeTool,
        color,
        size,
        opacity: 1,
        startX: worldX,
        startY: worldY,
        endX: worldX,
        endY: worldY,
        fill,
        createdAt: Date.now(),
      };
      previewShapeRef.current = shapeObj;
      if (rendererRef.current) {
        rendererRef.current.render(objectsRef.current, shapeObj, null, cameraRef.current);
      }
    } else if (activeTool === "text") {
      const textId = `txt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      setEditingText({
        id: textId,
        worldX,
        worldY,
        text: "",
      });
      setTimeout(() => textInputRef.current?.focus(), 50);
    } else if (activeTool === "eraser") {
      checkErase(worldX, worldY);
    }
  };

  // Handle pointer move
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    if (touchPointersRef.current.has(e.pointerId)) {
      touchPointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
    }

    // 1. Two-finger touch Pinch / Pan active with smooth per-frame incremental deltas
    if (touchPointersRef.current.size >= 2) {
      const pts = Array.from(touchPointersRef.current.values());
      const newDist = Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY);
      const newCenter = {
        x: (pts[0].clientX + pts[1].clientX) / 2 - rect.left,
        y: (pts[0].clientY + pts[1].clientY) / 2 - rect.top,
      };

      if (lastPinchRef.current) {
        const prev = lastPinchRef.current;
        let zoomScale = 1.0;
        if (prev.dist > 8 && newDist > 8) {
          // Clamp per-frame incremental scale to prevent sudden jumps
          const rawScale = newDist / prev.dist;
          zoomScale = Math.max(0.7, Math.min(1.4, rawScale));
        }
        const panDx = newCenter.x - prev.center.x;
        const panDy = newCenter.y - prev.center.y;

        setCamera((prevCam) => {
          const nextCam = zoomAtScreenPoint(
            newCenter.x,
            newCenter.y,
            prevCam,
            prevCam.zoom * zoomScale
          );
          return sanitizeCamera({
            x: nextCam.x + panDx,
            y: nextCam.y + panDy,
            zoom: nextCam.zoom,
          });
        });
      }

      lastPinchRef.current = { dist: newDist, center: newCenter };
      return;
    }

    // 2. Camera Panning active
    if (isPanningRef.current) {
      const dx = e.clientX - panStartRef.current.clientX;
      const dy = e.clientY - panStartRef.current.clientY;
      setCamera({
        ...cameraRef.current,
        x: panStartRef.current.camX + dx,
        y: panStartRef.current.camY + dy,
      });
      return;
    }

    // Convert Screen to World Coordinates
    const { x: worldX, y: worldY } = screenToWorld(
      e.clientX - rect.left,
      e.clientY - rect.top,
      cameraRef.current
    );

    // 3. High-frequency cursor position broadcast in WORLD coordinates
    cursorEngine.handlePointerMove(worldX, worldY);

    if (!isPointerDownRef.current) {
      if (activeTool === "eraser") {
        const hit = findHitObject(worldX, worldY);
        setHighlightedObjectId(hit?.objectId || null);
      }
      return;
    }

    if (currentStrokeRef.current) {
      const pts = currentStrokeRef.current.points;
      const lastPoint = pts[pts.length - 1];
      const dx = worldX - lastPoint[0];
      const dy = worldY - lastPoint[1];
      const dist = Math.hypot(dx, dy);

      // Filter sub-pixel micro-jitter while retaining fine handwriting fidelity (2.5 world px)
      const MIN_POINT_DISTANCE = 2.5;
      if (dist < MIN_POINT_DISTANCE) {
        return;
      }

      const point: [number, number] = [worldX, worldY];
      currentStrokeRef.current.points.push(point);
      strokeBatchRef.current.push(point);

      // Stream batch when points reach MAX_POINTS_PER_STROKE_MSG (50 points)
      if (strokeBatchRef.current.length >= MAX_POINTS_PER_STROKE_MSG) {
        wsClient.send({
          type: "stroke",
          strokeId: currentStrokeRef.current.objectId,
          color: currentStrokeRef.current.color,
          size: currentStrokeRef.current.size,
          opacity: currentStrokeRef.current.opacity,
          isHighlighter: currentStrokeRef.current.isHighlighter,
          points: strokeBatchRef.current,
        });
        strokeBatchRef.current = [];
      }

      if (rendererRef.current) {
        rendererRef.current.render(objectsRef.current, currentStrokeRef.current, null, cameraRef.current);
      }
    } else if (previewShapeRef.current) {
      previewShapeRef.current.endX = worldX;
      previewShapeRef.current.endY = worldY;
      if (rendererRef.current) {
        rendererRef.current.render(objectsRef.current, previewShapeRef.current, null, cameraRef.current);
      }
    } else if (activeTool === "eraser") {
      checkErase(worldX, worldY);
    }
  };

  // Handle pointer up / cancel
  const handlePointerUp = (e?: React.PointerEvent) => {
    if (e) {
      touchPointersRef.current.delete(e.pointerId);
      if (e.currentTarget && e.pointerId) {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }
    }

    if (touchPointersRef.current.size < 2) {
      lastPinchRef.current = null;
    }
    touchStartedStrokeIdRef.current = null;

    if (isPanningRef.current) {
      isPanningRef.current = false;
      return;
    }

    isPointerDownRef.current = false;

    if (currentStrokeRef.current) {
      const stroke = currentStrokeRef.current;
      // Flush any remaining batched points
      if (strokeBatchRef.current.length > 0) {
        wsClient.send({
          type: "stroke",
          strokeId: stroke.objectId,
          color: stroke.color,
          size: stroke.size,
          opacity: stroke.opacity,
          isHighlighter: stroke.isHighlighter,
          points: strokeBatchRef.current,
        });
        strokeBatchRef.current = [];
      }

      // Send stroke_end
      wsClient.send({
        type: "stroke_end",
        strokeId: stroke.objectId,
      });

      onAddLocalObject(stroke);
      undoManager.recordCreate(stroke);
      currentStrokeRef.current = null;
      if (rendererRef.current) {
        rendererRef.current.render([...objectsRef.current, stroke], null, null, cameraRef.current);
      }
    } else if (previewShapeRef.current) {
      const shape = previewShapeRef.current;
      wsClient.send({
        type: "shape_create",
        shapeId: shape.objectId,
        shapeType: shape.shapeType,
        color: shape.color,
        size: shape.size,
        opacity: shape.opacity,
        startX: shape.startX,
        startY: shape.startY,
        endX: shape.endX,
        endY: shape.endY,
        fill: shape.fill,
      });

      onAddLocalObject(shape);
      undoManager.recordCreate(shape);
      previewShapeRef.current = null;
      if (rendererRef.current) {
        rendererRef.current.render([...objectsRef.current, shape], null, null, cameraRef.current);
      }
    }
  };

  // Eraser hit test and deletion in World Coordinates
  const checkErase = (worldX: number, worldY: number) => {
    const hitObj = findHitObject(worldX, worldY);
    if (hitObj && (isHost || hitObj.creatorId === currentUserId)) {
      onRemoveObject(hitObj.objectId);
      undoManager.recordErase(hitObj);
      wsClient.send({
        type: "erase",
        objectId: hitObj.objectId,
      });
    }
  };

  const findHitObject = (worldX: number, worldY: number): CanvasObject | null => {
    const hitThreshold = Math.max(12, 14 / cameraRef.current.zoom);

    // Search from newest to oldest
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      if (obj.type === "stroke") {
        for (const pt of obj.points) {
          const dist = Math.hypot(worldX - pt[0], worldY - pt[1]);
          if (dist <= Math.max(hitThreshold, obj.size * 1.2)) {
            return obj;
          }
        }
      } else if (obj.type === "shape") {
        const x1 = Math.min(obj.startX, obj.endX);
        const y1 = Math.min(obj.startY, obj.endY);
        const x2 = Math.max(obj.startX, obj.endX);
        const y2 = Math.max(obj.startY, obj.endY);
        if (
          worldX >= x1 - hitThreshold &&
          worldX <= x2 + hitThreshold &&
          worldY >= y1 - hitThreshold &&
          worldY <= y2 + hitThreshold
        ) {
          return obj;
        }
      } else if (obj.type === "text") {
        const tx = obj.x;
        const ty = obj.y;
        if (
          worldX >= tx - hitThreshold &&
          worldX <= tx + 300 &&
          worldY >= ty - hitThreshold &&
          worldY <= ty + obj.fontSize * 2
        ) {
          return obj;
        }
      }
    }
    return null;
  };

  // Commit text creation in World Coordinates
  const commitText = () => {
    if (!editingText || !currentUserId || !editingText.text.trim()) {
      setEditingText(null);
      return;
    }

    const textObj: CanvasTextObject = {
      objectId: editingText.id,
      creatorId: currentUserId,
      type: "text",
      x: editingText.worldX,
      y: editingText.worldY,
      content: editingText.text.trim(),
      color,
      font,
      fontSize,
      createdAt: Date.now(),
    };

    wsClient.send({
      type: "text_create",
      textId: textObj.objectId,
      x: textObj.x,
      y: textObj.y,
      content: textObj.content,
      color: textObj.color,
      font: textObj.font,
      fontSize: textObj.fontSize,
    });

    onAddLocalObject(textObj);
    undoManager.recordCreate(textObj);
    setEditingText(null);
  };

  // Jump to off-screen remote collaborator's location
  const handleNavigateToUser = useCallback((userId: string) => {
    if (!containerRef.current) return;
    const worldPos = interpolator.getTrackWorldPosition(userId);
    if (!worldPos) return;

    const rect = containerRef.current.getBoundingClientRect();
    const currentZoom = cameraRef.current.zoom;

    // Center collaborator's world position on screen
    const targetCamX = rect.width / 2 - worldPos.x * currentZoom;
    const targetCamY = rect.height / 2 - worldPos.y * currentZoom;

    animateCameraTo(targetCamX, targetCamY);
  }, [interpolator, animateCameraTo]);

  // Return to default world location (0, 0) while preserving zoom
  const handleGoHome = (e?: React.MouseEvent | React.PointerEvent) => {
    if (e) e.stopPropagation();
    animateCameraTo(0, 0);
  };

  // Zoom button handlers (guaranteed sanitized camera state)
  const handleZoomIn = (e?: React.MouseEvent | React.PointerEvent) => {
    if (e) e.stopPropagation();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    setCamera((prev) => sanitizeCamera(zoomAtScreenPoint(centerX, centerY, prev, prev.zoom * 1.25)));
  };

  const handleZoomOut = (e?: React.MouseEvent | React.PointerEvent) => {
    if (e) e.stopPropagation();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    setCamera((prev) => sanitizeCamera(zoomAtScreenPoint(centerX, centerY, prev, prev.zoom * 0.8)));
  };

  const handleResetZoom = (e?: React.MouseEvent | React.PointerEvent) => {
    if (e) e.stopPropagation();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    setCamera((prev) => sanitizeCamera(zoomAtScreenPoint(centerX, centerY, prev, 1.0)));
  };

  // Determine cursor CSS class
  const getCursorClass = () => {
    if (isSpacePressed || activeTool === "select") return "cursor-grab";
    if (activeTool === "eraser") return "cursor-eraser";
    if (activeTool === "text") return "cursor-text";
    return "cursor-crosshair";
  };

  // Project inline editing text to screen space
  const inlineEditorScreenPos = editingText
    ? worldToScreen(editingText.worldX, editingText.worldY, camera)
    : null;

  return (
    <div
      ref={containerRef}
      className={`workspace-area ${getCursorClass()}`}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{ touchAction: "none" }}
    >
      <canvas ref={canvasRef} className="canvas-viewport" />

      {/* Direct DOM Remote Cursor & Off-Screen Indicators Overlay */}
      <RemoteCursorOverlay
        participants={participants}
        currentUserId={currentUserId}
        interpolator={interpolator}
        onNavigateToUser={handleNavigateToUser}
      />

      {/* Inline Text Editor Overlay in Camera Screen Projection */}
      {editingText && inlineEditorScreenPos && (
        <textarea
          ref={textInputRef}
          className="inline-text-editor"
          style={{
            left: `${inlineEditorScreenPos.x}px`,
            top: `${inlineEditorScreenPos.y}px`,
            color,
            fontFamily: font,
            fontSize: `${fontSize * camera.zoom}px`,
            minWidth: `${140 * camera.zoom}px`,
            minHeight: `${40 * camera.zoom}px`,
            transformOrigin: "top left",
          }}
          value={editingText.text}
          onChange={(e) => setEditingText({ ...editingText, text: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commitText();
            } else if (e.key === "Escape") {
              setEditingText(null);
            }
          }}
          onBlur={commitText}
          placeholder="Type something..."
        />
      )}

      {/* Canvas Zoom Controls Dock: [ − ] 100% [ + ] */}
      <div
        className="canvas-zoom-control glass-panel"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="zoom-btn"
          onClick={handleZoomOut}
          title="Zoom Out (−)"
          aria-label="Zoom Out"
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          className="zoom-label-btn"
          onClick={handleResetZoom}
          title="Reset Zoom to 100%"
          aria-label="Reset Zoom"
        >
          <span>{Math.round(camera.zoom * 100)}%</span>
        </button>
        <button
          type="button"
          className="zoom-btn"
          onClick={handleZoomIn}
          title="Zoom In (+)"
          aria-label="Zoom In"
        >
          <Plus size={15} />
        </button>
        <button
          type="button"
          className="zoom-btn home-btn"
          onClick={handleGoHome}
          title="Return to home view"
          aria-label="Return to home view"
        >
          <Home size={14} />
        </button>
      </div>
    </div>
  );
};
