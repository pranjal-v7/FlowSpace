import React from "react";
import { CanvasTool } from "../shared/types.js";
import {
  ArrowUpRight,
  Circle,
  Eraser,
  Highlighter,
  Minus,
  MousePointer,
  Pen,
  Redo2,
  Square,
  Type,
  Undo2,
} from "lucide-react";

interface ToolbarProps {
  activeTool: CanvasTool;
  onSelectTool: (tool: CanvasTool) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  activeTool,
  onSelectTool,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}) => {
  const tools: { id: CanvasTool; label: string; icon: React.ReactNode }[] = [
    { id: "select", label: "Select (V)", icon: <MousePointer size={18} /> },
    { id: "pen", label: "Pen (P)", icon: <Pen size={18} /> },
    { id: "highlighter", label: "Highlighter (H)", icon: <Highlighter size={18} /> },
    { id: "eraser", label: "Eraser (E)", icon: <Eraser size={18} /> },
    { id: "text", label: "Text (T)", icon: <Type size={18} /> },
    { id: "rectangle", label: "Rectangle (R)", icon: <Square size={18} /> },
    { id: "circle", label: "Circle (O)", icon: <Circle size={18} /> },
    { id: "line", label: "Line (L)", icon: <Minus size={18} /> },
    { id: "arrow", label: "Arrow (A)", icon: <ArrowUpRight size={18} /> },
  ];

  return (
    <aside className="floating-toolbar glass-panel">
      {tools.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`tool-button ${activeTool === t.id ? "active" : ""}`}
          onClick={() => onSelectTool(t.id)}
          title={t.label}
        >
          {t.icon}
        </button>
      ))}

      <div className="toolbar-divider" />

      <button
        type="button"
        className="tool-button"
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        style={{ opacity: canUndo ? 1 : 0.4 }}
      >
        <Undo2 size={18} />
      </button>

      <button
        type="button"
        className="tool-button"
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo (Ctrl+Y)"
        style={{ opacity: canRedo ? 1 : 0.4 }}
      >
        <Redo2 size={18} />
      </button>
    </aside>
  );
};
