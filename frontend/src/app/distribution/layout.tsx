import { ProtectedShell } from "@/components/app-shell/ProtectedShell";

export default function DistributionLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedShell>{children}</ProtectedShell>;
}
