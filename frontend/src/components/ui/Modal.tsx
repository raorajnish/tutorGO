"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: "sm" | "md" | "lg" | "xl";
  /// Removes the horizontal dividers under the header and above the footer,
  /// for compact confirmations whose body is empty.
  noDividers?: boolean;
}

const WIDTH_CLASSES = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Modal({ open, onClose, title, description, children, footer, width = "md", noDividers = false }: ModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="tg-modal-portal fixed inset-0 z-50 flex items-end justify-center sm:items-center print:static print:z-auto print:block print:w-full print:p-0 print:m-0">
      {/* Translucent backdrop — hidden during print */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px] print:hidden" onClick={onClose} aria-hidden="true" />
      
      {/* Modal Dialog Card — unstyled during print so it fills the sheet without borders/shadows */}
      <div
        className={`relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-xl border border-border bg-card shadow-(--shadow-overlay) sm:rounded-xl print:static print:max-h-none print:w-full print:max-w-none print:overflow-visible print:rounded-none print:border-0 print:bg-white print:p-0 print:m-0 print:shadow-none ${WIDTH_CLASSES[width]}`}
      >
        {/* Modal Header Bar — hidden during print */}
        <div className={`flex items-start justify-between ${noDividers ? "" : "border-b border-border"} px-6 py-4 print:hidden`}>
          <div>
            <h3 className="font-display text-lg font-semibold text-foreground">{title}</h3>
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-secondary"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Modal Body Container */}
        <div className={`no-scrollbar flex-1 overflow-y-auto px-6 ${noDividers ? "py-0" : "py-5"} print:overflow-visible print:p-0`}>{children}</div>

        {/* Modal Footer Bar — hidden during print */}
        {footer && <div className={`flex justify-end gap-3 ${noDividers ? "" : "border-t border-border"} px-6 py-4 print:hidden`}>{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
