"use client";

import { useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useAuth } from "@/lib/auth-context";
import { StudentBottomNav } from "@/components/portal/StudentBottomNav";

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main
          className={`content-scroll flex-1 px-4 py-6 sm:px-6 lg:px-8 ${showBottomNav ? "pb-28 lg:pb-6" : ""}`}
        >
          <div className="tg-page-enter mx-auto max-w-6xl">{children}</div>
        </main>
      </div>

      {showBottomNav && <StudentBottomNav />}
    </div>
  );
}
