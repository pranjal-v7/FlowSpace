import React, { useState, useEffect } from "react";
import { COLLABORATOR_COLORS } from "../../../shared/types.js";
import { PlusCircle, LogIn, RotateCw, Users, Crown, Sparkles, Shuffle, Check } from "lucide-react";
import { DoodleGraffitiOverlay } from "./DoodleGraffitiOverlay.js";

interface JoinScreenProps {
  onJoin: (roomId: string, displayName: string, preferredColor: string, isCreating?: boolean) => void;
  isRoomFull?: boolean;
  errorMessage?: string | null;
}

const PRESET_NAMES = [
  "Aisha", "Rohan", "Meera", "Karan", "Siddharth", "Ananya", "Dev", "Tara",
  "Kabir", "Zara", "Vikram", "Isha", "Arjun", "Diya"
];

const SUGGESTED_ROOMS = ["849201", "302194", "101010"];

export const JoinScreen: React.FC<JoinScreenProps> = ({
  onJoin,
  isRoomFull,
  errorMessage,
}) => {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [createdRoomId, setCreatedRoomId] = useState("");
  const [joinRoomId, setJoinRoomId] = useState("");
  const [displayName, setDisplayName] = useState(() => {
    return PRESET_NAMES[Math.floor(Math.random() * PRESET_NAMES.length)];
  });
  const [selectedColor, setSelectedColor] = useState<string>(COLLABORATOR_COLORS[0]);

  // Generate unique 6-digit room code
  const generateNewRoomId = () => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setCreatedRoomId(code);
  };

  const randomizeName = () => {
    const available = PRESET_NAMES.filter((n) => n !== displayName);
    const pick = available[Math.floor(Math.random() * available.length)];
    setDisplayName(pick);
  };

  const handleSelectSuggestedRoom = (code: string) => {
    setMode("join");
    setJoinRoomId(code);
  };

  useEffect(() => {
    generateNewRoomId();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;

    if (mode === "create") {
      if (!createdRoomId) return;
      onJoin(createdRoomId.trim(), displayName.trim(), selectedColor, true);
    } else {
      if (!joinRoomId.trim()) return;
      onJoin(joinRoomId.trim(), displayName.trim(), selectedColor, false);
    }
  };

  return (
    <div className="landing-page-root">
      {/* Background blueprint grid & gradient backdrop */}
      <div className="landing-bg-gradient" />
      <div className="landing-bg-grid" />
      <div className="landing-bg-spotlight" />

      {/* Interactive drawing canvas & floating graffiti doodle vectors */}
      <DoodleGraffitiOverlay />

      {/* Main content container */}
      <div className="landing-content-wrapper">
        {/* Hero Section Header */}
        <div className="landing-hero">
          {/* Eyebrow badge pill */}
          <div className="landing-eyebrow-pill">
            <span className="engine-status-dot" />
            <span className="eyebrow-text">Active WebSocket Engine · Sub-Millisecond Sync</span>
          </div>

          {/* FlowSpace Brand Logo Emblem */}
          <div className="landing-logo-badge">
            <img src="/logo.png" alt="FlowSpace Logo" className="landing-logo-img" />
          </div>

          {/* Large Hero Title */}
          <div className="hero-title-container">
            <h1 className="landing-hero-title">FlowSpace</h1>
            {/* Hand-drawn scribble highlighter underline */}
            <svg
              className="hero-scribble-underline"
              viewBox="0 0 240 18"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M4 11 C40 4, 110 3, 236 12 M20 15 C80 9, 170 8, 220 14"
                stroke="rgba(99, 102, 241, 0.45)"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          </div>

          {/* Hero Subtitle */}
          <p className="landing-hero-subtitle">
            Where ideas take shape together in real-time. Create an instant room or enter
            with a 6-digit code to collaborate on an infinite whiteboard.
          </p>
        </div>

        {/* Glassmorphic Room Entry Card */}
        <div className="landing-room-card glass-panel">
          {/* Mode Selector Tabs */}
          <div className="landing-tab-bar">
            <button
              type="button"
              className={`landing-tab-btn ${mode === "create" ? "active" : ""}`}
              onClick={() => setMode("create")}
            >
              <PlusCircle size={16} />
              <span>Create Room</span>
            </button>

            <button
              type="button"
              className={`landing-tab-btn ${mode === "join" ? "active" : ""}`}
              onClick={() => setMode("join")}
            >
              <LogIn size={16} />
              <span>Join Room</span>
            </button>
          </div>

          {isRoomFull && (
            <div className="toast error" style={{ position: "static", transform: "none", marginBottom: "1rem" }}>
              <Users size={16} />
              <span>Room is full (8/8 participants). Try another room number.</span>
            </div>
          )}

          {errorMessage && (
            <div className="toast error" style={{ position: "static", transform: "none", marginBottom: "1rem" }}>
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="landing-form">
            {mode === "create" ? (
              <div className="form-group">
                <label className="form-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Generated Room Number</span>
                  <button
                    type="button"
                    onClick={generateNewRoomId}
                    className="regenerate-code-btn"
                    title="Generate new unique number"
                  >
                    <RotateCw size={13} />
                    <span>New Number</span>
                  </button>
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    className="form-input room-code-display"
                    value={createdRoomId}
                    readOnly
                  />
                </div>
                <div className="creator-privilege-badge">
                  <Crown size={14} className="crown-icon" />
                  <span>You will be the <strong>Room Creator</strong> (Master Erase access).</span>
                </div>
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">Enter 6-Digit Room Number</label>
                <input
                  type="text"
                  className="form-input room-code-input"
                  value={joinRoomId}
                  onChange={(e) => setJoinRoomId(e.target.value.trim())}
                  placeholder="e.g. 849201"
                  required
                  maxLength={40}
                  autoFocus
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Your Display Name</span>
                <button
                  type="button"
                  onClick={randomizeName}
                  className="regenerate-code-btn"
                  title="Randomize name"
                >
                  <Shuffle size={13} />
                  <span>Randomize</span>
                </button>
              </label>
              <input
                type="text"
                className="form-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your name"
                required
                maxLength={30}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Identity Color</label>
              <div className="color-palette landing-palette">
                {COLLABORATOR_COLORS.map((color) => {
                  const isSelected = selectedColor === color;
                  return (
                    <button
                      key={color}
                      type="button"
                      className={`color-swatch landing-swatch ${isSelected ? "selected" : ""}`}
                      style={{ backgroundColor: color }}
                      onClick={() => setSelectedColor(color)}
                      aria-label={`Select color ${color}`}
                    >
                      {isSelected && <Check size={12} color="#ffffff" strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>
            </div>

            <button type="submit" className="btn-primary landing-submit-btn">
              <Sparkles size={16} />
              <span>{mode === "create" ? "Create & Enter Room" : "Join FlowSpace Room"}</span>
            </button>
          </form>
        </div>

        {/* Quick Suggestion Room Chips (TypeScrape style "Try stripe.com, linear.app...") */}
        <div className="landing-quick-suggestions">
          <span className="suggestions-label">Try demo room:</span>
          {SUGGESTED_ROOMS.map((code) => (
            <button
              key={code}
              type="button"
              className="suggestion-chip"
              onClick={() => handleSelectSuggestedRoom(code)}
            >
              #{code}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
