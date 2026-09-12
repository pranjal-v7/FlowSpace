import React from "react";
import { LogOut } from "lucide-react";

interface LeaveConfirmProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const LeaveConfirm: React.FC<LeaveConfirmProps> = ({
  open,
  onCancel,
  onConfirm,
}) => {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal glass-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-modal-title"
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              background: "#fee2e2",
              color: "#dc2626",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <LogOut size={20} />
          </div>
          <h2
            id="leave-modal-title"
            style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--text-primary)" }}
          >
            Leave this room?
          </h2>
        </div>

        <p
          style={{
            color: "var(--text-secondary)",
            fontSize: "0.92rem",
            lineHeight: 1.55,
            margin: "0.5rem 0 1.5rem",
          }}
        >
          Your presence will be removed, but your canvas work will remain visible to everyone.
        </p>

        <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <button
            type="button"
            className="btn-modal-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-modal-danger"
            onClick={onConfirm}
          >
            Leave room
          </button>
        </div>
      </div>
    </div>
  );
};
