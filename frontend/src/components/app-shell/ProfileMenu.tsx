"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import type { MeResponse } from "@/lib/types";

interface Props {
  user: MeResponse;
  onLogout: () => void;
}

function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a7 7 0 0114 0v1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The header's account menu — avatar trigger, top-right dropdown. Replaces
 * the old always-visible "Log out" button that used to sit at the bottom of
 * the sidebar: logout is now one click behind the profile avatar, alongside
 * a link to the new /profile page, matching where most SaaS apps put
 * account-level actions rather than mixing them into primary navigation. */
export function ProfileMenu({ user, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    function reposition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className={`flex items-center gap-2 rounded-xl py-1 pl-1 pr-1 transition-colors duration-150 sm:pr-2.5 ${
          open ? "bg-secondary" : "hover:bg-secondary"
        }`}
      >
        {user && (
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium leading-tight text-foreground">{user.fullName}</p>
            <p className="text-xs capitalize leading-tight text-muted-foreground">{user.role.toLowerCase()}</p>
          </div>
        )}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
          {user?.fullName?.charAt(0).toUpperCase() ?? "?"}
        </div>
      </button>

      {open &&
        mounted &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: "fixed", top: position.top, right: position.right, width: 240 }}
            className="z-100 overflow-hidden rounded-xl border border-border bg-card shadow-(--shadow-overlay)"
          >
            <div className="flex items-center gap-2.5 bg-linear-to-b from-accent/10 to-transparent px-3.5 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                {user.fullName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-semibold text-foreground">{user.fullName}</p>
                  <Badge tone="neutral" className="shrink-0 px-1.5! py-0! text-[10px]">
                    {user.role.charAt(0) + user.role.slice(1).toLowerCase()}
                  </Badge>
                </div>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
            </div>

            <div className="border-t border-border p-1.5">
              <Link
                href="/profile"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-secondary"
              >
                <UserIcon />
                Profile
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onLogout();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-danger transition-colors hover:bg-danger-soft"
              >
                <LogoutIcon />
                Log out
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
