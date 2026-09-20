"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { MaintenanceBanner } from "./MaintenanceBanner";
import { useAuth } from "@/lib/auth-context";
import { StudentBottomNav } from "@/components/portal/StudentBottomNav";
import { QuickActionFab } from "./QuickActionFab";

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const mainRef = useRef<HTMLElement>(null);

  // Reset window scroll when AppShell mounts or pathname changes so navigating
  // from a standalone page (like 404 / StatusPage) into `.app-shell` (which has
  // overflow:hidden) doesn't leave the window locked at a non-zero scroll position.
  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [pathname]);

  if (!user) return null;

  // Students get a phone-first bottom bar in addition to the sidebar, not
  // instead of it — the sidebar is still there behind the hamburger on mobile
  // and is the only nav from `lg:` up. The extra bottom padding only applies
  // while that bar is floating over the content.
  const showBottomNav = user.role === "STUDENT";

  return (
    <div className="app-shell flex bg-background lg:h-dvh">
      <Sidebar
        role={user.role}
        instituteName={user.institute?.name}
        workspaceLabel={user.institute ? "Institute workspace" : (user.organization?.name ?? null)}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <MaintenanceBanner />
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main
          ref={mainRef}
          className={`content-scroll flex-1 px-4 py-6 sm:px-6 lg:px-8 ${showBottomNav ? "pb-28 lg:pb-6" : ""}`}
        >
          <div className="tg-page-enter mx-auto max-w-6xl">{children}</div>
        </main>
      </div>

      <QuickActionFab />
      {showBottomNav && <StudentBottomNav />}
    </div>
  );
}
