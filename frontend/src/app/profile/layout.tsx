import { ProtectedShell } from "@/components/app-shell/ProtectedShell";

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedShell>{children}</ProtectedShell>;
}
