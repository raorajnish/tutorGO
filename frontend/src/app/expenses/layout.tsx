import { ProtectedShell } from "@/components/app-shell/ProtectedShell";

export default function ExpensesLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedShell>{children}</ProtectedShell>;
}
