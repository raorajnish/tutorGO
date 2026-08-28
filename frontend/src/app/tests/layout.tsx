import { ProtectedShell } from "@/components/app-shell/ProtectedShell";

export default function TestsLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedShell>{children}</ProtectedShell>;
}
