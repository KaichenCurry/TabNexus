import { useEffect, type ReactNode } from "react";

export function Modal({
  children,
  onClose,
  label,
  closeLabel = "Close",
  className = ""
}: {
  children: ReactNode;
  onClose: () => void;
  label: string;
  closeLabel?: string;
  className?: string;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`modal-card ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close-button" type="button" onClick={onClose} aria-label={closeLabel}>×</button>
        {children}
      </section>
    </div>
  );
}
