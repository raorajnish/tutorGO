import Link from "next/link";
import type { ReactNode } from "react";

interface ListItem {
  key: string;
  icon: ReactNode;
  title: string;
  subtitle?: string;
  href?: string;
  onClick?: () => void;
}

interface ListSectionProps {
  title: string;
  viewAllHref?: string;
  items: ListItem[];
  emptyLabel?: string;
}

export function ListSection({ title, viewAllHref, items, emptyLabel = "Nothing here yet." }: ListSectionProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 transition-colors duration-150 hover:border-primary/30">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
        {viewAllHref && (
          <Link href={viewAllHref} className="text-sm font-medium text-accent hover:opacity-80">
            View all
          </Link>
        )}
      </div>

      <div className="mt-4 divide-y divide-border">
        {items.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>}
        {items.map((item) => {
          const content = (
            <>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                {item.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                {item.subtitle && <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>}
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-muted-foreground">
                <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </>
          );

          const rowClass = "flex w-full items-center gap-3 rounded-lg px-2 py-3 -mx-2 text-left transition-colors duration-150 hover:bg-secondary";

          return item.href ? (
            <Link key={item.key} href={item.href} className={rowClass}>
              {content}
            </Link>
          ) : (
            <button key={item.key} type="button" onClick={item.onClick} className={rowClass}>
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}
