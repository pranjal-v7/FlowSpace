import React from "react";
import { ConnectionState, ClientTelemetry } from "../../../shared/types.js";
import { Activity, Crown, LogOut, Trash2, Users } from "lucide-react";

interface HeaderProps {
  roomId: string;
  userCount: number;
  maxUsers: number;
  connectionState: ConnectionState;
  telemetry: ClientTelemetry;
  isHost?: boolean;
  onClearCanvas?: () => void;
  onLeave: () => void;
  onToggleTelemetry: () => void;
  isTelemetryOpen: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  roomId,
  userCount,
  maxUsers,
  connectionState,
  telemetry,
  isHost = false,
  onClearCanvas,
  onLeave,
  onToggleTelemetry,
  isTelemetryOpen,
}) => {
  const getStatusClass = () => {
    switch (connectionState) {
      case "CONNECTED":
        return "connected";
      case "RECONNECTING":
      case "CONNECTING":
      case "JOINING":
      case "LEAVING":
        return "reconnecting";
      default:
        return "error";
    }
  };

  const getStatusText = () => {
    switch (connectionState) {
      case "CONNECTED":
        return "Connected";
      case "RECONNECTING":
        return "Reconnecting...";
      case "CONNECTING":
        return "Connecting...";
      case "JOINING":
        return "Joining...";
      case "LEAVING":
        return "Leaving room...";
      case "LEFT":
        return "Left room";
      case "ROOM_FULL":
        return "Room Full";
      default:
        return "Disconnected";
    }
  };

  return (
    <header className="app-header">
      {/* Left: Brand Identity & Room Info */}
      <div className="header-brand">
        <div className="header-brand-cluster">
          <img src="/logo.png" alt="FlowSpace Logo" className="header-logo-img" />
          <span className="header-title">FlowSpace</span>
        </div>
        
        {/* Room Code Badge - Clean Display */}
        <div className="header-room-badge" title={`Room Number: ${roomId}`}>
          <span className="room-badge-label">Room:</span>
          <strong className="room-badge-code">
            {roomId}
          </strong>
        </div>

        {/* Room Creator Badge */}
        {isHost && (
          <div className="header-creator-badge" title="You are the creator of this room with master erase permissions">
            <Crown size={14} className="creator-crown-icon" />
            <span className="creator-badge-text">Room Creator</span>
          </div>
        )}
      </div>

      {/* Center: Live Telemetry & Connection Status */}
      <div className="header-center">
        <div className="header-telemetry">
          <div className="telemetry-item telemetry-item-connection" title="WebSocket connection state">
            <span className={`status-dot ${getStatusClass()}`} />
            <span className="connection-status-text">{getStatusText()}</span>
          </div>

          <div className="telemetry-item telemetry-item-participants" title="Connected participants">
            <Users size={14} className="telemetry-participants-icon" />
            <span className="telemetry-participants-count">
              {userCount} / {maxUsers}
            </span>
          </div>

          <div className="telemetry-item telemetry-item-latency" title="Round-trip latency">
            <span>{telemetry.rtt}ms</span>
          </div>

          <div className="telemetry-item telemetry-item-fps" title="Render frames per second">
            <span>{telemetry.fps} FPS</span>
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="header-actions">
        {/* Creator Clear All Canvas Button */}
        {isHost && onClearCanvas && (
          <button
            type="button"
            className="btn-clear-canvas"
            onClick={onClearCanvas}
            title="Erase all strokes & shapes (Room Creator master erase)"
          >
            <Trash2 size={15} />
            <span className="btn-label-text">Clear Canvas</span>
          </button>
        )}

        <button
          type="button"
          className={`btn-icon header-btn-telemetry ${isTelemetryOpen ? "active" : ""}`}
          onClick={onToggleTelemetry}
          title="Telemetry Diagnostics"
          style={isTelemetryOpen ? { background: "var(--accent-primary)", color: "#fff", borderColor: "var(--accent-primary)" } : {}}
        >
          <Activity size={17} />
        </button>

        <button type="button" className="btn-leave" onClick={onLeave} title="Leave room">
          <LogOut size={15} />
          <span className="btn-label-text">Leave</span>
        </button>
      </div>
    </header>
  );
};

