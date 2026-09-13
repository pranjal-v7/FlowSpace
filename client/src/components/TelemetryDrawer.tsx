import React from "react";
import { ClientTelemetry } from "../shared/types.js";
import { Activity, X } from "lucide-react";

interface TelemetryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  telemetry: ClientTelemetry;
  interpolationDelay: number;
  onChangeInterpolationDelay: (delay: number) => void;
}

export const TelemetryDrawer: React.FC<TelemetryDrawerProps> = ({
  isOpen,
  onClose,
  telemetry,
  interpolationDelay,
  onChangeInterpolationDelay,
}) => {
  if (!isOpen) return null;

  return (
    <div className="telemetry-drawer glass-panel">
      <div className="drawer-header">
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Activity size={16} />
          <span className="drawer-title">Diagnostics</span>
        </div>
        <button type="button" className="btn-icon" onClick={onClose} style={{ width: "24px", height: "24px" }}>
          <X size={14} />
        </button>
      </div>

      <div className="metrics-grid">
        <div className="metric-row">
          <span className="metric-label">Latency (RTT)</span>
          <span className="metric-val">{telemetry.rtt} ms</span>
        </div>

        <div className="metric-row">
          <span className="metric-label">Render FPS</span>
          <span className="metric-val" style={{ color: telemetry.fps < 45 ? "#f59e0b" : "#10b981" }}>
            {telemetry.fps} FPS
          </span>
        </div>

        <div className="metric-row">
          <span className="metric-label">Outgoing Traffic</span>
          <span className="metric-val">{telemetry.outgoingRate} /s</span>
        </div>

        <div className="metric-row">
          <span className="metric-label">Incoming Traffic</span>
          <span className="metric-val">{telemetry.incomingRate} /s</span>
        </div>

        <div className="metric-row">
          <span className="metric-label">Socket Buffer</span>
          <span className="metric-val">{telemetry.bufferedBytes} B</span>
        </div>

        <div className="metric-row">
          <span className="metric-label">Stale Dropped</span>
          <span className="metric-val">{telemetry.staleDrops}</span>
        </div>

        <div className="metric-row">
          <span className="metric-label">Reconnects</span>
          <span className="metric-val">{telemetry.reconnectCount}</span>
        </div>

        <div className="sim-row" style={{ marginTop: "0.5rem" }}>
          <div className="sim-label-row">
            <span>Interpolation Delay:</span>
            <span style={{ fontWeight: 600, color: "#fff" }}>{interpolationDelay}ms</span>
          </div>
          <input
            type="range"
            min="20"
            max="160"
            step="5"
            value={interpolationDelay}
            onChange={(e) => onChangeInterpolationDelay(Number(e.target.value))}
            className="slider-input"
            style={{ width: "100%" }}
          />
        </div>
      </div>
    </div>
  );
};
