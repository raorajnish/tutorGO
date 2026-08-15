import { ProtectedShell } from "@/components/app-shell/ProtectedShell";

export default function StudentsLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedShell>{children}</ProtectedShell>;
}
