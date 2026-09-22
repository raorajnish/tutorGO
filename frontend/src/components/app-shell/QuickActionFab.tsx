"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import type { Role } from "@/lib/types";

interface ActionItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  href: string;
  color?: string;
}

const ROLE_ACTIONS: Record<Role, ActionItem[]> = {
  OWNER: [
    {
      id: "material",
      label: "Upload Material",
      description: "Notes, PDFs & video links",
      href: "/study-material?open=create",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
        </svg>
      ),
    },
    {
      id: "test",
      label: "Create Test",
      description: "Set up test or exam marks",
      href: "/tests?open=create",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="12" y1="18" x2="12" y2="12" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
      ),
    },
    {
      id: "student",
      label: "New Student",
      description: "Enroll or register a student",
      href: "/admissions?admit=true",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
          <line x1="20" y1="8" x2="20" y2="14" />
          <line x1="17" y1="11" x2="23" y2="11" />
        </svg>
      ),
    },
    {
      id: "expense",
      label: "Log Expense",
      description: "Track institute spending",
      href: "/expenses?open=create",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
        </svg>
      ),
    },
    {
      id: "fee",
      label: "Collect Fee",
      description: "Record installment & payment",
      href: "/fees?open=collect",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
        </svg>
      ),
    },
    {
      id: "lecture",
      label: "Create Lecture",
      description: "Schedule a class or lecture",
      href: "/attendance?open=create",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <line x1="12" y1="14" x2="12" y2="18" />
          <line x1="10" y1="16" x2="14" y2="16" />
        </svg>
      ),
    },
    {
      id: "enquiry",
      label: "New Enquiry",
      description: "Capture lead or enquiry",
      href: "/enquiries?open=create",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
      ),
    },
  ],
  ADMIN: [
    {
      id: "material",
      label: "Upload Material",
      description: "Notes, PDFs & video links",
      href: "/study-material?open=create",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
        </svg>
      ),
    },
    {
      id: "test",
      label: "Create Test",
      description: "Set up test or exam marks",
      href: "/tests?open=create",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="12" y1="18" x2="12" y2="12" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
      ),
    },
    {
      id: "student",
      label: "New Student",
      description: "Enroll or register a student",
      href: "/admissions?admit=true",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
          <line x1="20" y1="8" x2="20" y2="14" />
          <line x1="17" y1="11" x2="23" y2="11" />
        </svg>
      ),
    },
    {
      id: "expense",
      label: "Log Expense",
      description: "Track institute spending",
      href: "/expenses?open=create",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
        </svg>
      ),
    },
    {
      id: "fee",
      label: "Collect Fee",
      description: "Record installment & payment",
      href: "/fees?open=collect",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
        </svg>
      ),
    },
    {
      id: "lecture",
      label: "Create Lecture",
      description: "Schedule a class or lecture",
      href: "/attendance?open=create",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <line x1="12" y1="14" x2="12" y2="18" />
          <line x1="10" y1="16" x2="14" y2="16" />
        </svg>
      ),
    },
    {
      id: "enquiry",
      label: "New Enquiry",
      description: "Capture lead or enquiry",
      href: "/enquiries?open=create",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
      ),
    },
  ],
  FACULTY: [
    {
      id: "material",
      label: "Share Study Material",
      description: "Upload notes, assignments, links",
      href: "/study-material?open=create",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
        </svg>
      ),
    },
    {
      id: "test",
      label: "Create Test",
      description: "Set up test or schedule exam",
      href: "/tests?open=create",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      ),
    },
    {
      id: "ptm",
      label: "PTM & Remarks",
      description: "Log parent meeting notes",
      href: "/ptm",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87" />
          <path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
      ),
    },
    {
      id: "attendance",
      label: "Mark Attendance",
      description: "Batch daily attendance",
      href: "/attendance",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      ),
    },
    {
      id: "lecture",
      label: "Create Lecture",
      description: "Schedule a class or lecture",
      href: "/attendance?open=create",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <line x1="12" y1="14" x2="12" y2="18" />
          <line x1="10" y1="16" x2="14" y2="16" />
        </svg>
      ),
    },
  ],
  ACCOUNTANT: [
    {
      id: "payroll",
      label: "Payroll",
      description: "Manage staff salary payouts",
      href: "/payroll",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
        </svg>
      ),
    },
    {
      id: "expense",
      label: "Log Expense",
      description: "Track institute spending",
      href: "/expenses?open=create",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
        </svg>
      ),
    },
    {
      id: "fee",
      label: "Collect Fee",
      description: "Record installment & payment",
      href: "/fees?open=collect",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
        </svg>
      ),
    },
  ],
  RECEPTION: [
    {
      id: "student",
      label: "New Student",
      description: "Enroll or register a student",
      href: "/admissions?admit=true",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
          <line x1="20" y1="8" x2="20" y2="14" />
          <line x1="17" y1="11" x2="23" y2="11" />
        </svg>
      ),
    },
    {
      id: "fee",
      label: "Collect Fee",
      description: "Record installment & payment",
      href: "/fees?open=collect",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
        </svg>
      ),
    },
    {
      id: "lecture",
      label: "Create Lecture",
      description: "Schedule a class or lecture",
      href: "/attendance?open=create",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <line x1="12" y1="14" x2="12" y2="18" />
          <line x1="10" y1="16" x2="14" y2="16" />
        </svg>
      ),
    },
    {
      id: "enquiry",
      label: "New Enquiry",
      description: "Capture lead or walk-in enquiry",
      href: "/enquiries?open=create",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
      ),
    },
  ],
  STUDENT: [
    {
      id: "portal-fees",
      label: "Pay Fees",
      description: "View dues & make payments",
      href: "/portal/fees",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M7 4.5h10M7 9h10M15.5 4.5c0 4-2.5 5-5 5H7l7 10" />
        </svg>
      ),
    },
    {
      id: "portal-tests",
      label: "My Tests & Marks",
      description: "Check upcoming & past tests",
      href: "/portal/tests",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      ),
    },
    {
      id: "portal-resources",
      label: "Study Resources",
      description: "Notes, PDFs & video lectures",
      href: "/portal/resources",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
        </svg>
      ),
    },
    {
      id: "portal-timetable",
      label: "Class Schedule",
      description: "Timetable & batch timings",
      href: "/portal/timetable",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
    },
  ],
  SUPERADMIN: [
    {
      id: "orgs",
      label: "Organizations",
      description: "Manage system tenants",
      href: "/platform/organizations",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
        </svg>
      ),
    },
    {
      id: "users",
      label: "Platform Users",
      description: "Global admin user directory",
      href: "/platform/users",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
        </svg>
      ),
    },
  ],
};

import { haptic } from "@/lib/haptics";

export function QuickActionFab() {
  const { user } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const actionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const actions = user ? (ROLE_ACTIONS[user.role] ?? ROLE_ACTIONS.OWNER) : [];
  const isStudent = user?.role === "STUDENT";

  const toggleOpen = () => {
    haptic.tap();
    setOpen((prev) => {
      const next = !prev;
      if (next) setFocusedIndex(actions.length - 1);
      return next;
    });
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      // Global shortcut: Ctrl+C / Cmd+C (or Shift+C) toggles Create Quick Actions
      if (
        (event.key === "c" || event.key === "C") &&
        ((event.metaKey || event.ctrlKey) || event.shiftKey)
      ) {
        const selection = window.getSelection()?.toString();
        const tag = (event.target as HTMLElement)?.tagName;
        if (!selection && tag !== "INPUT" && tag !== "TEXTAREA" && !(event.target as HTMLElement)?.isContentEditable) {
          event.preventDefault();
          toggleOpen();
          return;
        }
      }

      if (!open) return;

      if (event.key === "Escape") {
        setOpen(false);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        // Visually moving UP means going towards top of menu (index 0)
        setFocusedIndex((prev) => (prev > 0 ? prev - 1 : actions.length - 1));
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        // Visually moving DOWN means going towards bottom of menu (index length - 1)
        setFocusedIndex((prev) => (prev < actions.length - 1 ? prev + 1 : 0));
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, actions.length]);

  useEffect(() => {
    if (open && focusedIndex >= 0 && actionRefs.current[focusedIndex]) {
      actionRefs.current[focusedIndex]?.focus();
    }
  }, [open, focusedIndex]);

  if (!user) return null;

  const handleAction = (href: string) => {
    haptic.tap();
    setOpen(false);
    router.push(href);
  };

  return (
    <div
      ref={containerRef}
      className={`fixed z-40 transition-all duration-300 ease-out ${
        isStudent
          ? "bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] right-4 lg:bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] lg:right-6"
          : "bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] right-6"
      }`}
    >
      {/* Backdrop overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-background/30 backdrop-blur-xs transition-opacity duration-200"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Expanded Menu Dock (Apple Books Floating Pill Style) */}
      <div
        style={{
          transition: "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease-out",
        }}
        className={`absolute bottom-full right-0 mb-3 z-40 w-72 origin-bottom-right rounded-2xl border border-border/80 bg-card/95 p-2 shadow-2xl backdrop-blur-xl ${
          open
            ? "translate-y-0 scale-100 opacity-100 pointer-events-auto"
            : "translate-y-3 scale-95 opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Quick Actions
          </span>
          <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-foreground uppercase">
            {user.role}
          </span>
        </div>

        <div className="mt-1 flex flex-col gap-0.5">
          {actions.map((act, idx) => (
            <button
              key={act.id}
              ref={(el) => {
                actionRefs.current[idx] = el;
              }}
              type="button"
              onClick={() => handleAction(act.href)}
              style={{
                transitionProperty: "transform, opacity, background-color",
                transitionDuration: "0.25s",
                transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
                transitionDelay: open ? `${idx * 35}ms` : "0ms",
                transform: open ? "translateY(0px)" : "translateY(8px)",
                opacity: open ? 1 : 0,
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-secondary/80 focus:outline-none focus:bg-secondary focus:ring-2 focus:ring-primary/20"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors">
                {act.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground truncate">{act.label}</p>
                {act.description && (
                  <p className="text-xs text-muted-foreground truncate">{act.description}</p>
                )}
              </div>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="shrink-0 text-muted-foreground/60"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          ))}
        </div>
      </div>

      {/* Floating Trigger Button with Butter-Smooth Morphing */}
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={open}
        aria-label="Toggle Quick Actions"
        style={{
          height: "48px",
          transition: "width 0.3s cubic-bezier(0.16, 1, 0.3, 1), min-width 0.3s cubic-bezier(0.16, 1, 0.3, 1), padding 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s ease",
        }}
        className={`group relative z-40 flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/20 bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 hover:shadow-xl active:scale-95 ${
          open
            ? "w-12 min-w-12 p-0 ring-4 ring-primary/20"
            : "w-[118px] min-w-[118px] md:w-[158px] md:min-w-[158px] px-4 md:px-4.5"
        }`}
      >
        {/* Dynamic rotating icon: Plus to Cross */}
        <div
          style={{
            transition: "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          className={`flex h-5 w-5 shrink-0 items-center justify-center ${
            open ? "rotate-135" : "rotate-0"
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" strokeLinecap="round" />
            <line x1="5" y1="12" x2="19" y2="12" strokeLinecap="round" />
          </svg>
        </div>

        {/* Collapsible text container */}
        <div
          style={{
            maxWidth: open ? "0px" : "120px",
            opacity: open ? 0 : 1,
            marginLeft: open ? "0px" : "6px",
            transition: "max-width 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease-out, margin-left 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          className="flex items-center overflow-hidden whitespace-nowrap"
        >
          <span className="flex items-center gap-2 text-sm font-semibold tracking-wide">
            Create
            <kbd className="hidden md:inline-flex items-center rounded-md bg-primary-foreground/20 px-2 py-1 text-[11px] font-mono font-medium leading-none text-primary-foreground opacity-90">
              <span>⌘</span>
              <span className="ml-0.5">C</span>
            </kbd>
          </span>
        </div>
      </button>
    </div>
  );
}
