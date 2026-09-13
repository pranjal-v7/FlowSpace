import React from "react";
import { ALLOWED_EMOJIS, ServerReactionMessage } from "../shared/types.js";

interface ReactionPickerProps {
  onSendReaction: (emoji: string) => void;
  activeReactions: ServerReactionMessage[];
  canvasRect: DOMRect | null;
}

export const ReactionPicker: React.FC<ReactionPickerProps> = ({
  onSendReaction,
  activeReactions,
  canvasRect,
}) => {
  return (
    <>
      {/* Top Reaction Dock */}
      <div className="reaction-dock glass-panel">
        {ALLOWED_EMOJIS.slice(0, 8).map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="reaction-btn"
            onClick={() => onSendReaction(emoji)}
            title={`React with ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Floating Animated Reaction Bursts */}
      {canvasRect &&
        activeReactions.map((r) => {
          const pixelX = r.x * canvasRect.width;
          const pixelY = r.y * canvasRect.height;

          return (
            <div
              key={r.id}
              className="floating-reaction"
              style={{
                left: `${pixelX}px`,
                top: `${pixelY}px`,
              }}
            >
              {r.emoji}
            </div>
          );
        })}
    </>
  );
};
