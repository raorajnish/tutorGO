import { ProtectedShell } from "@/components/app-shell/ProtectedShell";
import { RoleRoute } from "@/components/app-shell/RoleRoute";

export default function StudyMaterialLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedShell>
      {/* Teaching staff — the same bar as scheduling lectures/tests, matching
          the backend's own MANAGE_ROLES. RECEPTION is out: course content,
          not front-desk work. */}
      <RoleRoute allow={["OWNER", "ADMIN", "FACULTY"]}>{children}</RoleRoute>
    </ProtectedShell>
  );
}
