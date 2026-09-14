"use client";

import { useEffect, useRef, useState, type HTMLAttributes } from "react";

export interface Tab {
  id: string;
  label: string;
  count?: number;
}

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  tabs: Tab[];
  activeId: string;
  onChange: (id: string) => void;
  variant?: "pill" | "underline";
}

export function Tabs({
  tabs,
  activeId,
  onChange,
  className = "",
  variant = "pill",
  ...props
}: TabsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicator, setIndicator] = useState<{ left: number; width: number; ready: boolean }>({
    left: 0,
    width: 0,
    ready: false,
  });
  const [isInitial, setIsInitial] = useState(true);

  useEffect(() => {
    function updatePosition() {
      const activeIndex = tabs.findIndex((t) => t.id === activeId);
      const activeBtn = tabRefs.current[activeIndex];
      const containerEl = containerRef.current;

      if (activeBtn && containerEl) {
        const containerRect = containerEl.getBoundingClientRect();
        const activeRect = activeBtn.getBoundingClientRect();

        // Exact subpixel float distance from container inner edge to active button
        const left = activeRect.left - containerRect.left - containerEl.clientLeft;
        const width = activeRect.width;

        setIndicator({
          left,
          width,
          ready: true,
        });
      }
    }

    updatePosition();

    const containerEl = containerRef.current;
    if (!containerEl) return;

    const resizeObserver = new ResizeObserver(() => {
      updatePosition();
    });

    resizeObserver.observe(containerEl);
    window.addEventListener("resize", updatePosition);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updatePosition);
    };
  }, [activeId, tabs]);

  useEffect(() => {
    if (indicator.ready && isInitial) {
      const timer = setTimeout(() => setIsInitial(false), 50);
      return () => clearTimeout(timer);
    }
  }, [indicator.ready, isInitial]);

  if (variant === "underline") {
    return (
      <div
        ref={containerRef}
        className={`relative flex items-center gap-1 overflow-x-auto border-b border-border no-scrollbar ${className}`}
        {...props}
      >
        {indicator.ready && (
          <span
            className={`absolute bottom-0 left-0 h-0.5 rounded-full bg-accent pointer-events-none z-10 ${
              isInitial ? "" : "transition-all duration-250 ease-out"
            }`}
            style={{
              transform: `translate3d(${indicator.left}px, 0, 0)`,
              width: `${indicator.width}px`,
            }}
          />
        )}

        {tabs.map((tab, idx) => {
          const active = tab.id === activeId;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[idx] = el;
              }}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`relative z-0 flex shrink-0 items-center justify-center gap-2 whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                active ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>{tab.label}</span>
              {typeof tab.count === "number" && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs transition-colors ${
                    active ? "bg-accent-soft text-accent font-semibold" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`w-fit max-w-full overflow-x-auto no-scrollbar ${className}`}>
      <div
        ref={containerRef}
        className="relative inline-flex items-center gap-1 rounded-xl border border-border/70 bg-secondary/50 p-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.025)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)]"
        {...props}
      >
        {/* Sliding Active Pill Background Highlight */}
        {indicator.ready && (
          <div
            className={`absolute top-1 bottom-1 left-0 rounded-lg bg-card shadow-sm border border-border/70 pointer-events-none z-0 ${
              isInitial ? "" : "transition-all duration-250 ease-out"
            }`}
            style={{
              transform: `translate3d(${indicator.left}px, 0, 0)`,
              width: `${indicator.width}px`,
            }}
          />
        )}

        {tabs.map((tab, idx) => {
          const active = tab.id === activeId;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[idx] = el;
              }}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`group relative z-10 flex shrink-0 items-center justify-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors duration-150 select-none cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                active
                  ? "text-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>{tab.label}</span>
              {typeof tab.count === "number" && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs transition-colors ${
                    active
                      ? "bg-accent/15 text-accent font-semibold"
                      : "bg-muted/80 text-muted-foreground group-hover:text-foreground"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
