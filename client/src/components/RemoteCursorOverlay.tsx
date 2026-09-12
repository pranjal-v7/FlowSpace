import React, { useEffect, useRef } from "react";
import { Participant } from "../../../shared/types.js";
import { RemoteCursorInterpolator } from "../realtime/interpolator.js";

interface RemoteCursorOverlayProps {
  participants: Participant[];
  currentUserId: string | null;
  interpolator: RemoteCursorInterpolator;
}

export const RemoteCursorOverlay: React.FC<RemoteCursorOverlayProps> = ({
  participants,
  currentUserId,
  interpolator,
}) => {
  const elementRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const remoteParticipants = participants.filter((p) => p.userId !== currentUserId);

  useEffect(() => {
    // Register all active DOM elements with interpolator
    for (const p of remoteParticipants) {
      const el = elementRefs.current.get(p.userId);
      if (el) {
        interpolator.registerDomElement(p.userId, el);
      }
    }
  }, [remoteParticipants, interpolator]);

  return (
    <div className="cursor-overlay-container">
      {remoteParticipants.map((user) => (
        <div
          key={user.userId}
          ref={(el) => {
            if (el) {
              elementRefs.current.set(user.userId, el);
              interpolator.registerDomElement(user.userId, el);
            } else {
              elementRefs.current.delete(user.userId);
            }
          }}
          className="remote-cursor-wrapper"
          style={{
            transform: "translate3d(-100px, -100px, 0)",
          }}
        >
          {/* Stylized SVG cursor pointer */}
          <svg
            className="remote-cursor-pointer"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M3 3L10.5 21L13.5 13.5L21 10.5L3 3Z"
              fill={user.color}
              stroke="#ffffff"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>

          {/* User Display Name Tag */}
          <div
            className="remote-cursor-label"
            style={{
              backgroundColor: user.color,
            }}
          >
            {user.displayName}
          </div>
        </div>
      ))}
    </div>
  );
};
