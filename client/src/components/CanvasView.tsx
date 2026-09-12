import React, { useEffect, useRef, useState } from "react";
import {
  CanvasObject,
  CanvasShapeObject,
  CanvasStrokeObject,
  CanvasTextObject,
  CanvasTool,
  MAX_POINTS_PER_STROKE_MSG,
  Participant,
} from "../../../shared/types.js";
import { CanvasRenderer } from "../canvas/canvasRenderer.js";
import { LocalUndoManager } from "../canvas/undoManager.js";
import { LocalCursorEngine } from "../realtime/cursorEngine.js";
import { RemoteCursorInterpolator } from "../realtime/interpolator.js";
import { RealtimeWebSocketClient } from "../realtime/wsClient.js";
import { RemoteCursorOverlay } from "./RemoteCursorOverlay.js";

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

  // Drawing state
  const isPointerDownRef = useRef(false);
  const currentStrokeRef = useRef<CanvasStrokeObject | null>(null);
  const strokeBatchRef = useRef<[number, number][]>([]);
  const previewShapeRef = useRef<CanvasShapeObject | null>(null);
  const [highlightedObjectId, setHighlightedObjectId] = useState<string | null>(null);

  // Inline text editing state
  const [editingText, setEditingText] = useState<{
    id: string;
    x: number;
    y: number;
    text: string;
  } | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  // Keep latest objects in ref for stable resize handler
  const objectsRef = useRef(objects);
  useEffect(() => {
    objectsRef.current = objects;
  }, [objects]);

  // Initialize CanvasRenderer & Resize observer
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const renderer = new CanvasRenderer(canvasRef.current);
    rendererRef.current = renderer;

    const handleResize = () => {
      if (!containerRef.current || !canvasRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      onContainerRectChange(rect);
      interpolator.setContainerRect(rect);
      renderer.handleResize();
      renderer.render(objectsRef.current);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [interpolator, onContainerRectChange]);

  // Re-render canvas whenever objects or active previews change
  useEffect(() => {
    if (rendererRef.current) {
      const activePreview = currentStrokeRef.current || previewShapeRef.current;
      rendererRef.current.render(objects, activePreview, highlightedObjectId);
    }
  }, [objects, highlightedObjectId]);

  // Handle pointer down
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!containerRef.current || !currentUserId) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const rect = containerRef.current.getBoundingClientRect();
    isPointerDownRef.current = true;

    const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

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
        points: [[normX, normY]],
        createdAt: Date.now(),
      };

      currentStrokeRef.current = strokeObj;
      strokeBatchRef.current = [[normX, normY]];

      // Dispatch initial stroke point
      wsClient.send({
        type: "stroke",
        strokeId,
        color: strokeObj.color,
        size: strokeObj.size,
        opacity: strokeObj.opacity,
        isHighlighter: isHigh,
        points: [[normX, normY]],
      });

      if (rendererRef.current) {
        rendererRef.current.render(objectsRef.current, strokeObj);
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
        startX: normX,
        startY: normY,
        endX: normX,
        endY: normY,
        fill,
        createdAt: Date.now(),
      };
      previewShapeRef.current = shapeObj;
      if (rendererRef.current) {
        rendererRef.current.render(objectsRef.current, shapeObj);
      }
    } else if (activeTool === "text") {
      const textId = `txt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      setEditingText({
        id: textId,
        x: normX,
        y: normY,
        text: "",
      });
      setTimeout(() => textInputRef.current?.focus(), 50);
    } else if (activeTool === "eraser") {
      checkErase(normX, normY, rect);
    }
  };

  // Handle pointer move
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    // 1. High-frequency cursor position broadcast (25-30Hz throttled)
    cursorEngine.handlePointerMove(e.clientX, e.clientY, rect);

    if (!isPointerDownRef.current) {
      if (activeTool === "eraser") {
        const normX = (e.clientX - rect.left) / rect.width;
        const normY = (e.clientY - rect.top) / rect.height;
        const hit = findHitObject(normX, normY, rect);
        setHighlightedObjectId(hit?.objectId || null);
      }
      return;
    }

    const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    if (currentStrokeRef.current) {
      const point: [number, number] = [normX, normY];
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
        rendererRef.current.render(objectsRef.current, currentStrokeRef.current);
      }
    } else if (previewShapeRef.current) {
      previewShapeRef.current.endX = normX;
      previewShapeRef.current.endY = normY;
      if (rendererRef.current) {
        rendererRef.current.render(objectsRef.current, previewShapeRef.current);
      }
    } else if (activeTool === "eraser") {
      checkErase(normX, normY, rect);
    }
  };

  // Handle pointer up
  const handlePointerUp = (e?: React.PointerEvent) => {
    if (e && e.currentTarget && e.pointerId) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
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
        rendererRef.current.render([...objectsRef.current, stroke]);
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
        rendererRef.current.render([...objectsRef.current, shape]);
      }
    }
  };

  // Eraser hit test and deletion
  const checkErase = (x: number, y: number, rect: DOMRect) => {
    const hitObj = findHitObject(x, y, rect);
    if (hitObj && (isHost || hitObj.creatorId === currentUserId)) {
      onRemoveObject(hitObj.objectId);
      undoManager.recordErase(hitObj);
      wsClient.send({
        type: "erase",
        objectId: hitObj.objectId,
      });
    }
  };

  const findHitObject = (x: number, y: number, rect: DOMRect): CanvasObject | null => {
    const px = x * rect.width;
    const py = y * rect.height;

    // Search from newest to oldest
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      if (obj.type === "stroke") {
        for (const pt of obj.points) {
          const ptX = pt[0] * rect.width;
          const ptY = pt[1] * rect.height;
          const dist = Math.hypot(px - ptX, py - ptY);
          if (dist <= Math.max(12, obj.size)) {
            return obj;
          }
        }
      } else if (obj.type === "shape") {
        const x1 = Math.min(obj.startX, obj.endX) * rect.width;
        const y1 = Math.min(obj.startY, obj.endY) * rect.height;
        const x2 = Math.max(obj.startX, obj.endX) * rect.width;
        const y2 = Math.max(obj.startY, obj.endY) * rect.height;
        if (px >= x1 - 10 && px <= x2 + 10 && py >= y1 - 10 && py <= y2 + 10) {
          return obj;
        }
      } else if (obj.type === "text") {
        const tx = obj.x * rect.width;
        const ty = obj.y * rect.height;
        if (px >= tx - 10 && px <= tx + 200 && py >= ty - 10 && py <= ty + 40) {
          return obj;
        }
      }
    }
    return null;
  };

  // Commit text creation
  const commitText = () => {
    if (!editingText || !currentUserId || !editingText.text.trim()) {
      setEditingText(null);
      return;
    }

    const textObj: CanvasTextObject = {
      objectId: editingText.id,
      creatorId: currentUserId,
      type: "text",
      x: editingText.x,
      y: editingText.y,
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

  return (
    <div
      ref={containerRef}
      className="workspace-area"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <canvas ref={canvasRef} className="canvas-viewport" />

      {/* Direct DOM Remote Cursor Overlay */}
      <RemoteCursorOverlay
        participants={participants}
        currentUserId={currentUserId}
        interpolator={interpolator}
      />

      {/* Inline Text Editor Overlay */}
      {editingText && containerRef.current && (
        <textarea
          ref={textInputRef}
          className="inline-text-editor"
          style={{
            left: `${editingText.x * containerRef.current.clientWidth}px`,
            top: `${editingText.y * containerRef.current.clientHeight}px`,
            color,
            fontFamily: font,
            fontSize: `${fontSize}px`,
            minWidth: "140px",
            minHeight: "40px",
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
    </div>
  );
};
