import React from "react";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";

export interface ToastMessage {
  id: string;
  type: "error" | "warning" | "info";
  text: string;
}

interface ToastNotificationProps {
  toasts: ToastMessage[];
}

export const ToastNotification: React.FC<ToastNotificationProps> = ({ toasts }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          {t.type === "error" && <AlertCircle size={16} />}
          {t.type === "warning" && <AlertTriangle size={16} />}
          {t.type === "info" && <Info size={16} />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
};
