import React, { useRef, useEffect, useState, useCallback } from "react";
import { Sparkles, Trash2, Edit3 } from "lucide-react";

export const DoodleGraffitiOverlay: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [lastPoint, setLastPoint] = useState<{ x: number; y: number } | null>(null);

  // Resize canvas to full window
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
      }
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setIsDrawing(true);
    setLastPoint({ x, y });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !lastPoint) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.beginPath();
    ctx.strokeStyle = "rgba(99, 102, 241, 0.55)";
    ctx.lineWidth = 3.5;
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(x, y);
    ctx.stroke();

    setLastPoint({ x, y });
    if (!hasDrawn) setHasDrawn(true);
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
    setLastPoint(null);
  };

  return (
    <div className="doodle-graffiti-container" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      {/* Interactive scribble scratchpad canvas behind card */}
      <canvas
        ref={canvasRef}
        className="doodle-interactive-canvas"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "auto",
          cursor: "crosshair",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />

      {/* Floating Interactive Canvas Controls Chip (bottom right) */}
      <div
        style={{
          position: "absolute",
          bottom: "1.25rem",
          right: "1.5rem",
          zIndex: 30,
          pointerEvents: "auto",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: "rgba(255, 255, 255, 0.85)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(226, 232, 240, 0.8)",
          borderRadius: "9999px",
          padding: "5px 12px",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)",
          fontSize: "0.78rem",
          color: "var(--text-secondary)",
          userSelect: "none",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "5px", color: "var(--accent-primary)", fontWeight: 600 }}>
          <Edit3 size={13} />
          <span>Draw on background</span>
        </span>
        {hasDrawn && (
          <button
            type="button"
            onClick={clearCanvas}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "2px 8px",
              background: "#fee2e2",
              color: "#dc2626",
              borderRadius: "9999px",
              fontSize: "0.72rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <Trash2 size={11} />
            Clear
          </button>
        )}
      </div>

      {/* 1. TOP-LEFT: Lightbulb Idea Doodle Sticker */}
      <div
        className="doodle-item doodle-lightbulb"
        style={{
          position: "absolute",
          top: "12%",
          left: "8%",
          pointerEvents: "none",
          animation: "floatSlow 6s ease-in-out infinite",
        }}
      >
        <svg width="110" height="110" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Radiating sparkle lines */}
          <path d="M50 12 L50 22" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 1" />
          <path d="M22 32 L30 38" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M78 32 L70 38" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M15 55 L25 55" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M85 55 L75 55" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
          {/* Hand drawn bulb contour */}
          <path
            d="M36 68 C33 60 28 50 30 40 C32 26 44 22 52 22 C62 22 72 28 72 40 C73 49 67 60 64 68 Z"
            fill="rgba(254, 243, 199, 0.7)"
            stroke="#d97706"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          {/* Filament doodle */}
          <path
            d="M44 48 Q50 36 50 48 Q50 36 56 48"
            stroke="#d97706"
            strokeWidth="2.2"
            strokeLinecap="round"
            fill="none"
          />
          {/* Base screw thread */}
          <path d="M38 72 L62 72" stroke="#78350f" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M40 77 L60 77" stroke="#78350f" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M44 82 L56 82" stroke="#78350f" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        <span
          style={{
            display: "inline-block",
            fontSize: "0.75rem",
            fontWeight: 700,
            color: "#b45309",
            background: "rgba(254, 243, 199, 0.9)",
            padding: "2px 8px",
            borderRadius: "6px",
            border: "1px dashed #f59e0b",
            transform: "rotate(-6deg) translate(-10px, -6px)",
          }}
        >
          💡 Spark an idea
        </span>
      </div>

      {/* 2. TOP-RIGHT: Hand-Drawn Wavy Arrow + "Instant Room" note */}
      <div
        className="doodle-item doodle-arrow-note"
        style={{
          position: "absolute",
          top: "16%",
          right: "10%",
          pointerEvents: "none",
          animation: "floatReverse 7s ease-in-out infinite",
        }}
      >
        <div
          style={{
            background: "rgba(255, 255, 255, 0.9)",
            border: "1.5px solid #818cf8",
            padding: "8px 14px",
            borderRadius: "12px",
            boxShadow: "0 8px 20px rgba(99, 102, 241, 0.12)",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "0.82rem",
            fontWeight: 700,
            color: "#4338ca",
            transform: "rotate(4deg)",
          }}
        >
          <Sparkles size={14} color="#6366f1" />
          <span>Instant Room · No Sign-up</span>
        </div>
        {/* Hand drawn curved arrow pointing down toward the card */}
        <svg width="120" height="90" viewBox="0 0 120 90" fill="none" style={{ marginTop: "4px" }}>
          <path
            d="M85 8 C70 30 50 45 25 55 C18 58 12 60 8 68"
            stroke="#6366f1"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="4 3"
          />
          {/* Arrowhead */}
          <path
            d="M18 64 L6 70 L11 82"
            stroke="#6366f1"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* 3. MID-LEFT: Simulated Multiplayer Cursor - Aisha (Drawing) */}
      <div
        className="doodle-item doodle-cursor-aisha"
        style={{
          position: "absolute",
          top: "44%",
          left: "6%",
          pointerEvents: "none",
          animation: "floatSlow 8s ease-in-out infinite",
        }}
      >
        {/* Doodle stroke being drawn */}
        <svg width="140" height="70" viewBox="0 0 140 70" fill="none" style={{ position: "absolute", top: "-25px", left: "-60px" }}>
          <path
            d="M10 50 Q45 15 80 40 T130 30"
            stroke="#8b5cf6"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="6 4"
            fill="none"
            opacity="0.8"
          />
        </svg>

        {/* Cursor SVG */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "2px" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M3 3L10.07 19.97L12.58 12.58L19.97 10.07L3 3Z"
              fill="#8b5cf6"
              stroke="#ffffff"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
          <div
            style={{
              background: "#8b5cf6",
              color: "#ffffff",
              fontSize: "0.72rem",
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: "4px 10px 10px 10px",
              boxShadow: "0 4px 10px rgba(139, 92, 246, 0.3)",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              whiteSpace: "nowrap",
            }}
          >
            <span>✏️ Aisha (Drawing)</span>
          </div>
        </div>
      </div>

      {/* 4. MID-RIGHT: Simulated Multiplayer Cursor - Rohan (Wireframing) */}
      <div
        className="doodle-item doodle-cursor-rohan"
        style={{
          position: "absolute",
          top: "48%",
          right: "7%",
          pointerEvents: "none",
          animation: "floatReverse 9s ease-in-out infinite",
        }}
      >
        {/* Mini Wireframe box doodle */}
        <div
          style={{
            position: "absolute",
            top: "-45px",
            right: "0px",
            width: "80px",
            height: "48px",
            border: "2px dashed #10b981",
            borderRadius: "6px",
            background: "rgba(209, 250, 229, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: "rotate(-3deg)",
          }}
        >
          <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "#059669" }}>wireframe</span>
        </div>

        {/* Cursor SVG */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "2px" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M3 3L10.07 19.97L12.58 12.58L19.97 10.07L3 3Z"
              fill="#10b981"
              stroke="#ffffff"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
          <div
            style={{
              background: "#10b981",
              color: "#ffffff",
              fontSize: "0.72rem",
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: "4px 10px 10px 10px",
              boxShadow: "0 4px 10px rgba(16, 185, 129, 0.3)",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              whiteSpace: "nowrap",
            }}
          >
            <span>📐 Rohan (Wireframing)</span>
          </div>
        </div>
      </div>

      {/* 5. BOTTOM-LEFT: Sticky Note Doodle */}
      <div
        className="doodle-item doodle-sticky"
        style={{
          position: "absolute",
          bottom: "8%",
          left: "9%",
          pointerEvents: "none",
          transform: "rotate(-5deg)",
          animation: "floatSlow 10s ease-in-out infinite",
        }}
      >
        <div
          style={{
            width: "135px",
            padding: "10px 12px",
            background: "linear-gradient(135deg, #fef08a 0%, #fde047 100%)",
            borderRadius: "4px",
            boxShadow: "0 10px 20px rgba(0, 0, 0, 0.08), 0 2px 5px rgba(0,0,0,0.05)",
            border: "1px solid #facc15",
            position: "relative",
          }}
        >
          {/* Pin */}
          <div
            style={{
              position: "absolute",
              top: "-7px",
              left: "50%",
              transform: "translateX(-50%)",
              width: "14px",
              height: "14px",
              background: "#ef4444",
              borderRadius: "50%",
              boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
              border: "1.5px solid #fff",
            }}
          />
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#854d0e", marginTop: "4px" }}>
            📌 Sprint Whiteboard
          </div>
          <div style={{ fontSize: "0.65rem", color: "#a16207", marginTop: "3px", lineHeight: 1.3 }}>
            Draw, wireframe & share room code!
          </div>
        </div>
      </div>

      {/* 6. BOTTOM-RIGHT: Sparkles & Starburst Cluster */}
      <div
        className="doodle-item doodle-sparkles"
        style={{
          position: "absolute",
          bottom: "10%",
          right: "12%",
          pointerEvents: "none",
          animation: "floatReverse 8s ease-in-out infinite",
        }}
      >
        <svg width="70" height="70" viewBox="0 0 60 60" fill="none">
          {/* Main 4-point star */}
          <path
            d="M30 5 Q30 25 50 30 Q30 35 30 55 Q30 35 10 30 Q30 25 30 5 Z"
            fill="rgba(99, 102, 241, 0.25)"
            stroke="#6366f1"
            strokeWidth="1.8"
          />
          {/* Small companion star */}
          <path
            d="M48 42 Q48 48 54 50 Q48 52 48 58 Q48 52 42 50 Q48 48 48 42 Z"
            fill="rgba(245, 158, 11, 0.3)"
            stroke="#f59e0b"
            strokeWidth="1.4"
          />
          <circle cx="15" cy="18" r="2.5" fill="#ec4899" />
          <circle cx="45" cy="15" r="1.5" fill="#3b82f6" />
        </svg>
      </div>
    </div>
  );
};
