import { ProtectedShell } from "@/components/app-shell/ProtectedShell";
import { RoleRoute } from "@/components/app-shell/RoleRoute";

export default function StudentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedShell>
      <RoleRoute allow={["OWNER", "ADMIN", "RECEPTION"]}>{children}</RoleRoute>
    </ProtectedShell>
  );
}
