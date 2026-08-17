import { ProtectedShell } from "@/components/app-shell/ProtectedShell";

export default function PayrollLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedShell>{children}</ProtectedShell>;
}
