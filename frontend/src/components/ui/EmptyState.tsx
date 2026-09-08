import type { ReactNode } from "react";
import { Button } from "./Button";

interface EmptyStateProps {
  /** Defaults to a generic "empty tray" glyph — pass a page-specific one when it's worth the extra distinctiveness. */
  icon?: ReactNode;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

const DEFAULT_ICON = (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground/40">
    <path d="M3 7.5l2.2-4h13.6l2.2 4M3 7.5V18a2 2 0 002 2h14a2 2 0 002-2V7.5M3 7.5h18" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9 12h6" strokeLinecap="round" />
  </svg>
);

/** Shared empty-state block for any list/table with nothing in it — an icon,
 * a message, and (when there's a real next action) a button for it, instead
 * of leaving the reader to go find the "create" button elsewhere on the
 * page. Used inline for a mobile card list, or inside a `<td colSpan>` for a
 * desktop table row. */
export function EmptyState({ icon, message, actionLabel, onAction, className = "" }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 px-4 py-10 text-center ${className}`}>
      {icon ?? DEFAULT_ICON}
      <p className="text-sm text-muted-foreground">{message}</p>
      {actionLabel && onAction && <Button onClick={onAction}>{actionLabel}</Button>}
    </div>
  );
}
