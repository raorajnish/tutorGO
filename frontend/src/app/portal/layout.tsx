import { ProtectedShell } from "@/components/app-shell/ProtectedShell";
import { RoleRoute } from "@/components/app-shell/RoleRoute";
import { PortalTransition } from "@/components/portal/PortalTransition";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedShell>
      <RoleRoute allow={["STUDENT"]}>
        <PortalTransition>{children}</PortalTransition>
      </RoleRoute>
    </ProtectedShell>
  );
}
