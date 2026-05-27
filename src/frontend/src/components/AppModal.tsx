import { useEffect } from "react";
import type React from "react";

interface AppModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

function stopPropagation(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export function AppModal({ isOpen, onClose, children }: AppModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add("modal-open");
    } else {
      document.body.classList.remove("modal-open");
    }
    return () => {
      document.body.classList.remove("modal-open");
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      aria-hidden="true"
    >
      <div
        className="modal-content"
        onClick={stopPropagation}
        onKeyDown={stopPropagation}
      >
        {children}
      </div>
    </div>
  );
}
