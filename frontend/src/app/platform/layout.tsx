import { ProtectedShell } from "@/components/app-shell/ProtectedShell";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedShell>{children}</ProtectedShell>;
}
