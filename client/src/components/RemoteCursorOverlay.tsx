import React, { useEffect, useRef } from "react";
import { Participant } from "../shared/types.js";
import { RemoteCursorInterpolator } from "../realtime/interpolator.js";

interface RemoteCursorOverlayProps {
  participants: Participant[];
  currentUserId: string | null;
  interpolator: RemoteCursorInterpolator;
  onNavigateToUser?: (userId: string) => void;
}

export const RemoteCursorOverlay: React.FC<RemoteCursorOverlayProps> = ({
  participants,
  currentUserId,
  interpolator,
  onNavigateToUser,
}) => {
  const elementRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const indicatorRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const remoteParticipants = participants.filter((p) => p.userId !== currentUserId);

  useEffect(() => {
    // Register all active DOM elements with interpolator
    for (const p of remoteParticipants) {
      const el = elementRefs.current.get(p.userId);
      if (el) {
        interpolator.registerDomElement(p.userId, el);
      }
      const indEl = indicatorRefs.current.get(p.userId);
      if (indEl) {
        interpolator.registerIndicatorDomElement(p.userId, indEl);
      }
    }
  }, [remoteParticipants, interpolator]);

  return (
    <div className="cursor-overlay-container">
      {remoteParticipants.map((user) => (
        <React.Fragment key={user.userId}>
          {/* Normal On-Screen Stylized Cursor */}
          <div
            ref={(el) => {
              if (el) {
                elementRefs.current.set(user.userId, el);
                interpolator.registerDomElement(user.userId, el);
              } else {
                elementRefs.current.delete(user.userId);
                interpolator.registerDomElement(user.userId, null);
              }
            }}
            className="remote-cursor-wrapper"
            style={{
              transform: "translate3d(-100px, -100px, 0)",
            }}
          >
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

            <div
              className="remote-cursor-label"
              style={{
                backgroundColor: user.color,
              }}
            >
              {user.displayName}
            </div>
          </div>

          {/* Off-Screen Indicator attached to safe viewport edge */}
          <div
            ref={(el) => {
              if (el) {
                indicatorRefs.current.set(user.userId, el);
                interpolator.registerIndicatorDomElement(user.userId, el);
              } else {
                indicatorRefs.current.delete(user.userId);
                interpolator.registerIndicatorDomElement(user.userId, null);
              }
            }}
            className="offscreen-indicator"
            style={{ display: "none" }}
            onClick={(e) => {
              e.stopPropagation();
              onNavigateToUser?.(user.userId);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title={`Jump to ${user.displayName}'s location`}
            aria-label={`Jump to ${user.displayName}'s location`}
          >
            {/* Directional arrow pointing toward remote collaborator */}
            <div
              className="indicator-arrow"
              style={{
                transform: "rotate(var(--arrow-angle, 0deg))",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2.5 6H9.5M9.5 6L6.5 3M9.5 6L6.5 9"
                  stroke={user.color}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <span
              className="indicator-dot"
              style={{ backgroundColor: user.color }}
            />

            <span className="indicator-label">{user.displayName}</span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
};

