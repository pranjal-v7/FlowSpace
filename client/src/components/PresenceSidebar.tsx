import React from "react";
import { MAX_USERS_PER_ROOM, Participant } from "../shared/types.js";
import { Users } from "lucide-react";

interface PresenceSidebarProps {
  participants: Participant[];
  currentUserId: string | null;
}

export const PresenceSidebar: React.FC<PresenceSidebarProps> = ({
  participants,
  currentUserId,
}) => {
  // Build an 8-slot array (PRD Section 69)
  const totalSlots = MAX_USERS_PER_ROOM;
  const slots: (Participant | null)[] = [];

  for (let i = 0; i < totalSlots; i++) {
    slots.push(participants[i] || null);
  }

  return (
    <aside className="presence-panel glass-panel">
      <div className="presence-header">
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Users size={15} />
          <span>Participants</span>
        </div>
        <span className="presence-count-badge">
          {participants.length} / {MAX_USERS_PER_ROOM}
        </span>
      </div>

      <div className="slots-grid">
        {slots.map((slot, index) => {
          if (slot) {
            const isSelf = slot.userId === currentUserId;
            return (
              <div key={slot.userId} className="user-slot active">
                <div
                  className="user-avatar"
                  style={{
                    backgroundColor: slot.color,
                    boxShadow: `0 0 8px ${slot.color}88`,
                  }}
                >
                  {slot.displayName.charAt(0).toUpperCase()}
                </div>
                <span className="user-name" style={{ color: "var(--text-primary)" }}>
                  {slot.displayName}
                </span>
                {slot.isHost && (
                  <span
                    style={{
                      fontSize: "9px",
                      background: "#fef3c7",
                      color: "#b45309",
                      border: "1px solid #fde68a",
                      padding: "1px 5px",
                      borderRadius: "4px",
                      marginLeft: "auto",
                      fontWeight: 700,
                    }}
                  >
                    CREATOR
                  </span>
                )}
                {isSelf && <span className="you-tag" style={{ marginLeft: slot.isHost ? "4px" : "auto" }}>YOU</span>}
              </div>
            );
          } else {
            return (
              <div key={`empty-slot-${index}`} className="user-slot empty">
                <div
                  className="user-avatar"
                  style={{
                    backgroundColor: "transparent",
                    border: "1px dashed rgba(255, 255, 255, 0.2)",
                  }}
                />
                <span className="user-name" style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                  Empty slot
                </span>
              </div>
            );
          }
        })}
      </div>
    </aside>
  );
};
