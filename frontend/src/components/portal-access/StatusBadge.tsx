import { Badge } from "@/components/ui/Badge";
import type { PortalAccessStatus } from "@/lib/types";

/** One place the four derived statuses get their wording and colour, so the
 * course tree, the bulk-result list and the row actions can never disagree
 * about what "Pending" looks like. */
const STATUS: Record<PortalAccessStatus, { label: string; tone: "success" | "warning" | "neutral" | "danger"; hint: string }> = {
  ACTIVE: { label: "Active", tone: "success", hint: "Can sign in to the portal" },
  PENDING: { label: "Pending", tone: "warning", hint: "Eligible — credentials not sent for their current course yet" },
  NOT_ELIGIBLE: { label: "Not eligible", tone: "neutral", hint: "Portal access is off for this student's course" },
  SUSPENDED: { label: "Suspended", tone: "danger", hint: "Login exists but is disabled" },
};

export function PortalStatusBadge({ status }: { status: PortalAccessStatus }) {
  const s = STATUS[status];
  return (
    <span title={s.hint}>
      <Badge tone={s.tone}>{s.label}</Badge>
    </span>
  );
}

export const STATUS_META = STATUS;
