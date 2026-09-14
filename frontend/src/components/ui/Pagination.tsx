"use client";

import { useMemo, useState } from "react";

export interface PaginationProps {
  /** 1-indexed current page. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Optional array of selectable page sizes, e.g. [10, 20, 50]. */
  pageSizeOptions?: number[];
  /** Callback fired when the user selects a new page size. */
  onPageSizeChange?: (pageSize: number) => void;
  /** If true, hides the entire pagination bar when total <= pageSize. Defaults to false. */
  hideOnSinglePage?: boolean;
  /** Optional container class name. */
  className?: string;
}

/** Computes which page numbers to show, centered on the current page and
 * clamped so the window never runs past either edge. */
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
      className={`flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg px-2 text-xs sm:text-sm font-medium transition-all ${
        active
          ? "bg-primary text-primary-foreground shadow-xs"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      }`}
    >
      {p}
    </button>
  );
}

function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      {direction === "left" ? (
        <>
          <path d="M19 12H5" />
          <path d="M12 19l-7-7 7-7" />
        </>
      ) : (
        <>
          <path d="M5 12h14" />
          <path d="M12 5l7 7-7 7" />
        </>
      )}
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
      <ArrowIcon direction={direction} />
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
      {showLeadEllipsis && (
        <button
          type="button"
          onClick={() => onPageChange(1)}
          aria-label="First page"
          className="flex h-8 min-w-7 items-center justify-center text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          1…
        </button>
      )}
      {win.map((p) => (
        <PageButton key={p} p={p} active={p === page} onClick={() => onPageChange(p)} />
      ))}
      {showTrailEllipsis && (
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          aria-label="Last page"
          className="flex h-8 min-w-7 items-center justify-center text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          …{totalPages}
        </button>
      )}
    </div>
  );
}

/**
 * Shared, responsive pagination bar.
 * - Mobile (<640px): Compact row with item counts, prev/next arrows, and 3-page window.
 * - Desktop (>=640px): Full controls with items count, optional page size select, 5-page window with jump shortcuts.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  pageSizeOptions,
  onPageSizeChange,
  hideOnSinglePage = false,
  className = "",
}: PaginationProps) {
  if (total <= 0) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (hideOnSinglePage && totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-3 ${className}`}>
      {/* Item count & optional page size select */}
      <div className="flex items-center justify-between sm:justify-start gap-3">
        <p className="text-xs sm:text-sm text-muted-foreground">
          Showing <span className="font-semibold text-foreground">{from}–{to}</span> of{" "}
          <span className="font-semibold text-foreground">{total}</span>
        </p>

        {pageSizeOptions && pageSizeOptions.length > 0 && onPageSizeChange && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="hidden xs:inline">Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1);
              }}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground transition-colors hover:border-foreground/30 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              aria-label="Rows per page"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt} / page
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-1.5">
          <NavButton direction="left" disabled={page <= 1} onClick={() => onPageChange(page - 1)} />

          {/* Desktop view (5-window) */}
          <div className="hidden sm:block">
            <PageNumbers page={page} totalPages={totalPages} size={5} onPageChange={onPageChange} />
          </div>

          {/* Mobile view (3-window) */}
          <div className="sm:hidden">
            <PageNumbers page={page} totalPages={totalPages} size={3} onPageChange={onPageChange} />
          </div>

          <NavButton direction="right" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} />
        </div>
      )}
    </div>
  );
}

/**
 * Convenience hook for lightweight client-side pagination on any array.
 * Handles slicing, clamping on data changes, page size updates, and returns ready-to-spread paginationProps.
 */
export function useClientPagination<T>(items: T[], defaultPageSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Automatically clamp page if items shrink (e.g. date change, search/filter change)
  const safePage = Math.min(Math.max(1, page), totalPages);
  if (safePage !== page && total > 0) {
    setPage(safePage);
  }

  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  return {
    page: safePage,
    pageSize,
    totalPages,
    total,
    setPage,
    setPageSize,
    paginatedItems,
    paginationProps: {
      page: safePage,
      pageSize,
      total,
      onPageChange: setPage,
      onPageSizeChange: setPageSize,
    },
  };
}
