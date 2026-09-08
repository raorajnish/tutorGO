import { redirect } from "next/navigation";

/// The Overview page used to live here, duplicating /dashboard's
/// SuperAdminDashboard (same /platform/stats call, same "new organization"
/// action). Merged into the dashboard so SuperAdmin has one landing page
/// instead of two overlapping stat views — this route just forwards anyone
/// who still has it bookmarked or linked.
export default function PlatformIndexRedirect() {
  redirect("/dashboard");
}
