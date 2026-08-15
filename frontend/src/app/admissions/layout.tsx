import { ProtectedShell } from "@/components/app-shell/ProtectedShell";

export default function AdmissionsLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedShell>{children}</ProtectedShell>;
}
