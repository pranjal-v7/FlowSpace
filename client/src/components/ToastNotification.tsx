import React from "react";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";

export interface ToastMessage {
  id: string;
  type: "error" | "warning" | "info";
  text: string;
}

interface ToastNotificationProps {
  toasts?: ToastMessage[];
  toast?: ToastMessage | null;
}

export const ToastNotification: React.FC<ToastNotificationProps> = ({ toasts, toast }) => {
  // Always display strictly at most one single active notification line
  const activeToast = toast || (toasts && toasts.length > 0 ? toasts[toasts.length - 1] : null);
  if (!activeToast) return null;

  return (
    <div className="toast-container" role="status" aria-live="polite">
      <div key={activeToast.id} className={`toast ${activeToast.type}`}>
        {activeToast.type === "error" && <AlertCircle size={16} style={{ flexShrink: 0 }} />}
        {activeToast.type === "warning" && <AlertTriangle size={16} style={{ flexShrink: 0 }} />}
        {activeToast.type === "info" && <Info size={16} style={{ flexShrink: 0 }} />}
        <span title={activeToast.text}>{activeToast.text}</span>
      </div>
    </div>
  );
};
