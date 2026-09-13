import React from "react";
import { CanvasTool, COLLABORATOR_COLORS, FONTS } from "../shared/types.js";

interface StyleToolbarProps {
  activeTool: CanvasTool;
  color: string;
  onChangeColor: (color: string) => void;
  size: number;
  onChangeSize: (size: number) => void;
  font: string;
  onChangeFont: (font: string) => void;
  fontSize: number;
  onChangeFontSize: (fontSize: number) => void;
  fill: boolean;
  onToggleFill: (fill: boolean) => void;
}

const EXTENDED_PALETTE = [
  "#000000", // Black
  ...COLLABORATOR_COLORS,
  "#94A3B8", // Slate gray
  "#FFFFFF", // White
];

export const StyleToolbar: React.FC<StyleToolbarProps> = ({
  activeTool,
  color,
  onChangeColor,
  size,
  onChangeSize,
  font,
  onChangeFont,
  fontSize,
  onChangeFontSize,
  fill,
  onToggleFill,
}) => {
  if (activeTool === "select" || activeTool === "eraser") {
    return null;
  }

  const isTextTool = activeTool === "text";
  const isShapeWithFill = activeTool === "rectangle" || activeTool === "circle";

  return (
    <div className="style-toolbar glass-panel">
      {/* Color Palette */}
      <div className="color-palette">
        {EXTENDED_PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            className={`color-swatch ${color.toLowerCase() === c.toLowerCase() ? "selected" : ""}`}
            style={{ backgroundColor: c }}
            onClick={() => onChangeColor(c)}
          />
        ))}
      </div>

      {/* Size or Font Size Control */}
      {!isTextTool ? (
        <div className="size-slider-wrapper">
          <span style={{ fontSize: "12px" }}>Size:</span>
          <input
            type="range"
            min="2"
            max="32"
            value={size}
            onChange={(e) => onChangeSize(Number(e.target.value))}
            className="slider-input"
          />
          <span style={{ fontSize: "12px", width: "20px", textAlign: "right" }}>
            {size}px
          </span>
        </div>
      ) : (
        <>
          <div className="size-slider-wrapper">
            <span style={{ fontSize: "12px" }}>Font:</span>
            <select
              value={font}
              onChange={(e) => onChangeFont(e.target.value)}
              className="form-input"
              style={{ padding: "2px 6px", fontSize: "12px", width: "130px" }}
            >
              {FONTS.map((f) => (
                <option key={f} value={f} style={{ background: "#1e293b", color: "#fff" }}>
                  {f.split(",")[0]}
                </option>
              ))}
            </select>
          </div>

          <div className="size-slider-wrapper">
            <span style={{ fontSize: "12px" }}>Size:</span>
            <input
              type="range"
              min="12"
              max="64"
              value={fontSize}
              onChange={(e) => onChangeFontSize(Number(e.target.value))}
              className="slider-input"
            />
            <span style={{ fontSize: "12px", width: "24px", textAlign: "right" }}>
              {fontSize}
            </span>
          </div>
        </>
      )}

      {/* Fill toggle for shapes */}
      {isShapeWithFill && (
        <button
          type="button"
          className="btn-icon"
          style={{
            width: "auto",
            padding: "4px 10px",
            fontSize: "12px",
            background: fill ? "var(--accent-primary)" : "rgba(255,255,255,0.05)",
            color: fill ? "#fff" : "var(--text-secondary)",
          }}
          onClick={() => onToggleFill(!fill)}
        >
          {fill ? "Fill: ON" : "Fill: OFF"}
        </button>
      )}
    </div>
  );
};
