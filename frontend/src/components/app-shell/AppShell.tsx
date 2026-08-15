"use client";

import { useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useAuth } from "@/lib/auth-context";

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!user) return null;

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
        <main className="content-scroll flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="tg-page-enter mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
