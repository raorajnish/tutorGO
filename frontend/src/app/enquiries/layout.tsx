import { ProtectedShell } from "@/components/app-shell/ProtectedShell";

export default function EnquiriesLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedShell>{children}</ProtectedShell>;
}
