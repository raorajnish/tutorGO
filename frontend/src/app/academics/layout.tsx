import { ProtectedShell } from "@/components/app-shell/ProtectedShell";

export default function AcademicsLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedShell>{children}</ProtectedShell>;
}
