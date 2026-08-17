import { ProtectedShell } from "@/components/app-shell/ProtectedShell";

export default function FeesLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedShell>{children}</ProtectedShell>;
}
