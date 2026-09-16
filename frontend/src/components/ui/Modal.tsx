"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
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
  const [shouldRender, setShouldRender] = useState(open);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      const timer = requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimateIn(true));
      });
      return () => cancelAnimationFrame(timer);
    } else {
      setAnimateIn(false);
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!shouldRender) return null;

  return createPortal(
    <div className="tg-modal-portal fixed inset-0 z-50 flex items-end justify-center sm:items-start sm:pt-16 md:pt-20 print:static print:z-auto print:block print:w-full print:p-0 print:m-0">
      {/* Translucent backdrop — hidden during print */}
      <div
        className={`absolute inset-0 bg-black/30 backdrop-blur-[2px] transition-opacity duration-200 ease-out print:hidden ${
          animateIn ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Modal Dialog Card — unstyled during print so it fills the sheet without borders/shadows */}
      <div
        className={`relative flex max-h-[90vh] sm:max-h-[85vh] w-full flex-col overflow-hidden rounded-t-xl border border-border bg-card shadow-(--shadow-overlay) transition-all duration-200 ease-out sm:rounded-xl print:static print:max-h-none print:w-full print:max-w-none print:overflow-visible print:rounded-none print:border-0 print:bg-white print:p-0 print:m-0 print:shadow-none ${WIDTH_CLASSES[width]} ${
          animateIn
            ? "translate-y-0 opacity-100 sm:scale-100"
            : "translate-y-8 opacity-0 sm:translate-y-6 sm:scale-98"
        }`}
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
