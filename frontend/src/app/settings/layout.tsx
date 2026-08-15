import { ProtectedShell } from "@/components/app-shell/ProtectedShell";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedShell>{children}</ProtectedShell>;
}
