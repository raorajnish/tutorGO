"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

/**
 * Phone-first navigation for the student portal.
 *
 * Follows the reference design's floating pill (mobile.tsx) — including its
 * approach to the active state, which is a plain CSS transition on the filled
 * background rather than a JS-driven sliding element. One change on top: with
 * six destinations rather than four, the active item expands to show its
 * label, because six unlabelled icons is a guessing game. That expansion
 * animates `grid-template-columns` (0fr to 1fr), which opens smoothly without
 * needing a hard-coded width.
 *
 * Desktop keeps the sidebar (`lg:hidden` here) — this is additive, not a
 * replacement, so both routes to a page stay available.
 */

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Shows the unread dot. Only the updates tab uses it. */
  badge?: boolean;
}

const ICON = {
  home: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M4 10.5L12 4l8 6.5V19a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 19z" strokeLinejoin="round" />
      <path d="M9.5 20.5v-6h5v6" strokeLinejoin="round" />
    </svg>
  ),
  calendar: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8.5 3v4M15.5 3v4" strokeLinecap="round" />
    </svg>
  ),
  medal: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="12" cy="14.5" r="5.5" />
      <path d="M9 9.5L7 3.5h10l-2 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  check: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
      <path d="M8.5 13.5l2.5 2.5 4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  rupee: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M7 4.5h10M7 9h10M15.5 4.5c0 4-2.5 5-5 5H7l7 10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  bell: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M18 8.5a6 6 0 10-12 0c0 5.5-2 6.5-2 6.5h16s-2-1-2-6.5z" strokeLinejoin="round" />
      <path d="M13.7 19a2 2 0 01-3.4 0" strokeLinecap="round" />
    </svg>
  ),
};

const ITEMS: NavItem[] = [
  { href: "/portal", label: "Home", icon: ICON.home },
  { href: "/portal/timetable", label: "Classes", icon: ICON.calendar },
  { href: "/portal/tests", label: "Tests", icon: ICON.medal },
  { href: "/portal/attendance", label: "Attendance", icon: ICON.check },
  { href: "/portal/fees", label: "Fees", icon: ICON.rupee },
  { href: "/portal/notifications", label: "Updates", icon: ICON.bell, badge: true },
];

export function StudentBottomNav() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  // Cheap enough to refetch on navigation — it's the same count the dashboard
  // already returns, and it keeps the dot honest after a student reads their
  // updates without a full reload.
  useEffect(() => {
    apiFetch<{ unread: number }>("/portal/notifications")
      .then((r) => setUnread(r.unread))
      .catch(() => setUnread(0));
  }, [pathname]);

  // Longest match wins, so /portal doesn't claim /portal/tests.
  const active = ITEMS.map((i) => i.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <nav
      aria-label="Student navigation"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))] lg:hidden"
    >
      <div className="pointer-events-auto flex max-w-[92vw] items-center gap-0.5 rounded-full border border-border bg-card/95 p-1.5 shadow-(--shadow-overlay) backdrop-blur-md">
        {ITEMS.map((item) => {
          const isActive = item.href === active;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full px-2.5 transition-colors duration-200 ease-out ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              {item.icon}
              <span
                className="grid overflow-hidden transition-[grid-template-columns] duration-300 ease-out"
                style={{ gridTemplateColumns: isActive ? "1fr" : "0fr" }}
              >
                <span
                  className={`min-w-0 overflow-hidden whitespace-nowrap text-xs font-semibold transition-opacity duration-200 ${
                    isActive ? "opacity-100" : "opacity-0"
                  }`}
                >
                  {item.label}
                </span>
              </span>
              {item.badge && unread > 0 && !isActive && (
                <span className="absolute right-1 top-1.5 h-2 w-2 rounded-full bg-accent ring-2 ring-card" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
