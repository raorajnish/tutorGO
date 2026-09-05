import { ProtectedShell } from "@/components/app-shell/ProtectedShell";
import { RoleRoute } from "@/components/app-shell/RoleRoute";

export default function PayrollLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedShell>
      <RoleRoute allow={["OWNER", "ADMIN", "ACCOUNTANT", "FACULTY"]}>{children}</RoleRoute>
    </ProtectedShell>
  );
}
