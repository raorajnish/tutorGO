import { ProtectedShell } from "@/components/app-shell/ProtectedShell";
import { RoleRoute } from "@/components/app-shell/RoleRoute";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedShell>
      {/* Every staff role — a STUDENT lands on /portal instead, and would only
          see permission errors here. */}
      <RoleRoute allow={["SUPERADMIN", "OWNER", "ADMIN", "ACCOUNTANT", "FACULTY", "RECEPTION"]}>{children}</RoleRoute>
    </ProtectedShell>
  );
}
