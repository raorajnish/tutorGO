import { ProtectedShell } from "@/components/app-shell/ProtectedShell";

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedShell>{children}</ProtectedShell>;
}
