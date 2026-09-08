interface PaginationProps {
  /** 1-indexed current page. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/** Computes which page numbers to show, centered on the current page and
 * clamped so the window never runs past either edge. Returns fewer entries
 * than `size` only when there simply aren't that many pages yet. */
function pageWindow(page: number, totalPages: number, size: number): number[] {
  if (totalPages <= size) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const half = Math.floor(size / 2);
  let start = Math.max(1, page - half);
  const end = Math.min(totalPages, start + size - 1);
  start = Math.max(1, end - size + 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function PageButton({ p, active, onClick }: { p: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={`Page ${p}`}
      className={`flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg px-2 text-sm font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      }`}
    >
      {p}
    </button>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d={direction === "left" ? "M15 18l-6-6 6-6" : "M9 6l6 6-6 6"} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NavButton({ direction, disabled, onClick }: { direction: "left" | "right"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "left" ? "Previous page" : "Next page"}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <ChevronIcon direction={direction} />
    </button>
  );
}

/** One row of page-number buttons for a given window size, with an ellipsis
 * on whichever side still has more pages beyond the visible window. */
function PageNumbers({ page, totalPages, size, onPageChange }: { page: number; totalPages: number; size: number; onPageChange: (p: number) => void }) {
  const win = pageWindow(page, totalPages, size);
  const showLeadEllipsis = win[0]! > 1;
  const showTrailEllipsis = win[win.length - 1]! < totalPages;

  return (
    <div className="flex items-center gap-1">
      {showLeadEllipsis && <span className="px-1 text-sm text-muted-foreground">…</span>}
      {win.map((p) => (
        <PageButton key={p} p={p} active={p === page} onClick={() => onPageChange(p)} />
      ))}
      {showTrailEllipsis && <span className="px-1 text-sm text-muted-foreground">…</span>}
    </div>
  );
}

/** Shared pagination bar — "Showing X–Y of Z" on the left, page numbers plus
 * prev/next on the right. One component used by every paginated list in the
 * app, so they all behave and look identical rather than each list rolling
 * its own Previous/Next buttons.
 *
 * The page-number window is 5 wide on desktop and 3 on mobile — rendered as
 * two variants swapped by a CSS breakpoint (not a resize listener), so there
 * is no client/server hydration mismatch and no JS measuring involved. */
export function Pagination({ page, pageSize, total, onPageChange, className = "" }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
      <p className="text-sm text-muted-foreground">
        Showing <span className="font-medium text-foreground">{from}–{to}</span> of{" "}
        <span className="font-medium text-foreground">{total}</span>
      </p>

      {totalPages > 1 && (
        <div className="flex items-center gap-1.5">
          <NavButton direction="left" disabled={page <= 1} onClick={() => onPageChange(page - 1)} />

          <div className="hidden sm:block">
            <PageNumbers page={page} totalPages={totalPages} size={5} onPageChange={onPageChange} />
          </div>
          <div className="sm:hidden">
            <PageNumbers page={page} totalPages={totalPages} size={3} onPageChange={onPageChange} />
          </div>

          <NavButton direction="right" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} />
        </div>
      )}
    </div>
  );
}
