"use client";

import { useEffect, useState, type ReactElement } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { BentoCard } from "@/components/dashboard/BentoCard";
import { ProfileCard } from "@/components/dashboard/ProfileCard";
import { ListSection } from "@/components/dashboard/ListSection";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { MODULE_LABELS, MODULE_CODES } from "@/lib/types";
import { CreateInstituteModal } from "@/components/organization/CreateInstituteModal";
import { ManageInstituteDrawer } from "@/components/organization/ManageInstituteDrawer";
import { UpcomingLecturesWidget } from "@/components/attendance/UpcomingLecturesWidget";

const ICON_SHIELD = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" strokeLinejoin="round" />
  </svg>
);
const ICON_MAIL = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ICON_SETTINGS = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3" />
    <path d="M4.6 15a1.7 1.7 0 01-.34 1.87 2 2 0 102.83 2.83A1.7 1.7 0 019 19.4a1.7 1.7 0 011 1.55V21a2 2 0 104 0v-.06a1.7 1.7 0 011-1.55 1.7 1.7 0 011.87.34 2 2 0 102.83-2.83A1.7 1.7 0 0119.4 15a1.7 1.7 0 011.55-1H21a2 2 0 100-4h-.06a1.7 1.7 0 01-1.55-1 1.7 1.7 0 01.34-1.87 2 2 0 10-2.83-2.83A1.7 1.7 0 0115 4.6a1.7 1.7 0 01-1-1.55V3a2 2 0 10-4 0v.06A1.7 1.7 0 019 4.6a1.7 1.7 0 01-1.87-.34 2 2 0 10-2.83 2.83A1.7 1.7 0 014.6 9a1.7 1.7 0 01-1.55 1H3a2 2 0 100 4h.06a1.7 1.7 0 011.54 1z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ICON_CLOCK = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ICON_TESTS = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 3h6M9 3v4.5L4.5 15A3 3 0 007 19.5h10A3 3 0 0019.5 15L15 7.5V3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 15h8" strokeLinecap="round" />
  </svg>
);
const ICON_PAYROLL = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M7 6v12M17 6v12" />
  </svg>
);

const GLYPH_SHIELD = (
  <svg width="140" height="140" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
  </svg>
);
const GLYPH_CLOCK = (
  <svg width="140" height="140" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 5v5.4l4 2.3-1 1.7-5-2.9V7h2z" />
  </svg>
);

function DateLabel() {
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{today}</p>;
}

interface PlatformStats {
  organizations: number;
  activeOrganizations: number;
  institutes: number;
  tenantUsers: number;
  students: number;
  modules: number;
}

function SuperAdminDashboard({ name }: { name: string }) {
  const [stats, setStats] = useState<PlatformStats | null>(null);

  useEffect(() => {
    apiFetch<PlatformStats>("/platform/stats").then(setStats).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <DateLabel />
      <h1 className="font-display text-3xl font-bold text-foreground">Platform overview</h1>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:col-span-2">
          <BentoCard
            variant="featured"
            badge="Platform"
            title={`${stats?.organizations ?? "—"} organizations`}
            description="Provisioned across the whole platform, with owners onboarded and modules assigned."
            glyph={GLYPH_SHIELD}
            footer={
              <>
                <Badge tone="accent">{stats?.activeOrganizations ?? "—"} active</Badge>
                <Link href="/platform/organizations" className="text-sm font-medium text-primary-foreground/90 underline underline-offset-2">
                  Manage
                </Link>
              </>
            }
          />
          <BentoCard
            variant="light"
            badge="Reach"
            title={`${stats?.institutes ?? "—"} institutes`}
            description={`${stats?.tenantUsers ?? "—"} tenant users, ${stats?.students ?? "—"} students on the platform.`}
          />
          <BentoCard
            variant="tinted"
            className="sm:col-span-2"
            badge="Modules"
            title={`${stats?.modules ?? "—"} modules in the catalog`}
            description="Enquiries, Admissions, Attendance, Fees, Payroll and Expenses — toggled per institute."
          />
        </div>

        <div className="space-y-5">
          <ProfileCard
            name={name}
            subtitle="Platform administrator"
            stats={[
              { label: "Orgs", value: stats?.organizations ?? "—" },
              { label: "Institutes", value: stats?.institutes ?? "—" },
              { label: "Modules", value: stats?.modules ?? "—" },
            ]}
          />
          <ListSection
            title="Quick links"
            items={[
              { key: "orgs", icon: ICON_SHIELD, title: "Organizations", subtitle: "Create and manage", href: "/platform/organizations" },
              { key: "mail", icon: ICON_MAIL, title: "Email settings", subtitle: "Outbound SMTP", href: "/platform/email-settings" },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

function OwnerOrgDashboard() {
  const { user, enterInstitute } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [entering, setEntering] = useState<string | null>(null);
  const [manageId, setManageId] = useState<string | null>(null);

  const institutes = user?.institutes ?? [];
  const activeModuleTotal = institutes.reduce((sum, i) => sum + i.activeModules.length, 0);

  async function handleEnter(id: string) {
    setEntering(id);
    try {
      await enterInstitute(id);
    } finally {
      setEntering(null);
    }
  }

  const featured = institutes[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <DateLabel />
          <h1 className="font-display mt-1 text-3xl font-bold text-foreground">{user?.organization?.name}</h1>
        </div>
        <Button variant="accent" onClick={() => setCreateOpen(true)}>
          New institute
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:col-span-2">
          {featured ? (
            <BentoCard
              variant="featured"
              badge={featured.code}
              title={featured.name}
              description={
                featured.activeModules.length
                  ? featured.activeModules.map((m) => MODULE_LABELS[m]).join(" · ")
                  : "No modules enabled yet."
              }
              glyph={GLYPH_SHIELD}
              footer={
                <>
                  <Badge tone={featured.isActive ? "accent" : "danger"}>{featured.isActive ? "Active" : "Inactive"}</Badge>
                  <button
                    onClick={() => handleEnter(featured.id)}
                    disabled={entering === featured.id}
                    className="text-sm font-medium text-primary-foreground/90 underline underline-offset-2"
                  >
                    {entering === featured.id ? "Entering…" : "Enter"}
                  </button>
                </>
              }
            />
          ) : (
            <BentoCard
              variant="featured"
              badge="Organization"
              title="No institutes yet"
              description="Create your first institute to start admitting students."
              glyph={GLYPH_SHIELD}
            />
          )}
          <BentoCard
            variant="light"
            badge="Institutes"
            title={`${institutes.length} total`}
            description={`${institutes.filter((i) => i.isActive).length} active · ${activeModuleTotal} modules enabled across all branches.`}
          />
          <BentoCard
            variant="tinted"
            className="sm:col-span-2"
            badge="Every institute is independent"
            title="Isolated data, per branch"
            description="Students, staff and finances never cross between institutes in this organization — each one runs on its own plan and modules."
          />
        </div>

        <div className="space-y-5">
          <ProfileCard
            name={user?.fullName ?? ""}
            subtitle="Organization owner"
            stats={[
              { label: "Institutes", value: institutes.length },
              { label: "Active", value: institutes.filter((i) => i.isActive).length },
              { label: "Modules", value: activeModuleTotal },
            ]}
          />
          <TrendChart
            title="Enrollments this week"
            data={[
              { label: "Mon", value: 8 },
              { label: "Tue", value: 14 },
              { label: "Wed", value: 11 },
              { label: "Thu", value: 22 },
              { label: "Fri", value: 18 },
              { label: "Sat", value: 30 },
              { label: "Sun", value: 27 },
            ]}
          />
          <ListSection
            title="Your institutes"
            items={institutes.map((inst) => ({
              key: inst.id,
              icon: <span className="text-sm font-semibold">{inst.code.slice(0, 2)}</span>,
              title: inst.name,
              subtitle: inst.isActive ? "Active" : "Inactive",
              onClick: () => setManageId(inst.id),
            }))}
            emptyLabel="No institutes yet."
          />
        </div>
      </div>

      <CreateInstituteModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <ManageInstituteDrawer instituteId={manageId} onClose={() => setManageId(null)} />
    </div>
  );
}

interface AttendanceStats {
  total: number;
  today: number;
  upcoming: number;
}

function FacultyDashboard() {
  const { user } = useAuth();
  const institute = user!.institute;
  const hasAttendance = institute?.activeModules.includes("ATTENDANCE");
  const hasPayroll = institute?.activeModules.includes("PAYROLL");
  const [stats, setStats] = useState<AttendanceStats | null>(null);

  useEffect(() => {
    if (!hasAttendance) return;
    apiFetch<AttendanceStats>("/attendance/stats").then(setStats).catch(() => {});
  }, [hasAttendance]);

  const quickLinks = [
    hasAttendance && { key: "attendance", icon: ICON_CLOCK, title: "Attendance", subtitle: "Mark and review lectures", href: "/attendance" },
    hasAttendance && { key: "tests", icon: ICON_TESTS, title: "Tests", subtitle: "Schedule and record results", href: "/tests" },
    hasPayroll && { key: "payroll", icon: ICON_PAYROLL, title: "Payroll", subtitle: "Your salary and payments", href: "/payroll" },
  ].filter((x): x is { key: string; icon: ReactElement; title: string; subtitle: string; href: string } => Boolean(x));

  return (
    <div className="space-y-6">
      <DateLabel />
      <h1 className="font-display text-3xl font-bold text-foreground">Welcome back, {user!.fullName.split(" ")[0]}</h1>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:col-span-2">
          {hasAttendance ? (
            <BentoCard
              variant="featured"
              className="sm:col-span-2"
              badge={institute?.code ?? "Institute"}
              title={`${stats?.today ?? "—"} lecture${stats?.today === 1 ? "" : "s"} today`}
              description={`At ${institute?.name ?? "your institute"} — mark attendance as each one runs.`}
              glyph={GLYPH_CLOCK}
              footer={
                <>
                  <Badge tone="accent">{stats?.upcoming ?? "—"} scheduled upcoming</Badge>
                  <Link href="/attendance" className="text-sm font-medium text-primary-foreground/90 underline underline-offset-2">
                    Open attendance
                  </Link>
                </>
              }
            />
          ) : (
            <BentoCard
              variant="featured"
              className="sm:col-span-2"
              badge={institute?.code ?? "Institute"}
              title={institute?.name ?? "No institute linked"}
              description="Attendance isn't enabled for this institute yet."
              glyph={GLYPH_SHIELD}
            />
          )}
          <div className="sm:col-span-2">
            <ListSection title="Quick links" items={quickLinks} emptyLabel="More tools roll out phase by phase." />
          </div>
        </div>

        <div className="space-y-5">
          <ProfileCard
            name={user!.fullName}
            subtitle={institute?.name ?? "No institute"}
            stats={[{ label: "Role", value: "Faculty" }]}
          />
          {hasAttendance && <UpcomingLecturesWidget />}
        </div>
      </div>
    </div>
  );
}

function InstituteDashboard() {
  const { user } = useAuth();
  const institute = user!.institute;
  const isAdmin = user!.role === "OWNER" || user!.role === "ADMIN";

  const quickLinks =
    user!.role === "OWNER" || user!.role === "ADMIN"
      ? [{ key: "settings", icon: ICON_SETTINGS, title: "Settings", subtitle: "Institute, team, subscription", href: "/settings" }]
      : [];

  return (
    <div className="space-y-6">
      <DateLabel />
      <h1 className="font-display text-3xl font-bold text-foreground">
        Welcome back, {user!.fullName.split(" ")[0]}
      </h1>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:col-span-2">
          <BentoCard
            variant="featured"
            className={isAdmin ? undefined : "sm:col-span-2"}
            badge={institute?.code ?? "Institute"}
            title={institute?.name ?? "No institute linked"}
            description={institute ? `${institute.organizationName} · ${institute.planName ?? "No plan"} plan` : undefined}
            glyph={GLYPH_SHIELD}
            footer={
              institute && (
                <>
                  {isAdmin && <Badge tone="accent">{institute.activeModules.length} modules active</Badge>}
                  <span className="text-sm text-primary-foreground/70 capitalize">{user!.role.toLowerCase()}</span>
                </>
              )
            }
          />
          {isAdmin && (
            <>
              <BentoCard
                variant="light"
                badge="Onboarding"
                title={institute?.onboardingDone ? "Complete" : `Step ${institute?.onboardingStep ?? 0} of 4`}
                description={institute?.onboardingDone ? "This institute is fully set up." : "Setup is still in progress."}
              />
              <BentoCard
                variant="tinted"
                className="sm:col-span-2"
                badge="Modules"
                title="What's enabled here"
                description={
                  institute && institute.activeModules.length
                    ? MODULE_CODES.filter((m) => institute.activeModules.includes(m))
                        .map((m) => MODULE_LABELS[m])
                        .join(" · ")
                    : "No modules enabled for this institute yet."
                }
              />
            </>
          )}
        </div>

        <div className="space-y-5">
          <ProfileCard
            name={user!.fullName}
            subtitle={institute?.name ?? "No institute"}
            stats={
              isAdmin
                ? [
                    { label: "Role", value: user!.role.charAt(0) + user!.role.slice(1).toLowerCase() },
                    { label: "Modules", value: institute?.activeModules.length ?? 0 },
                    { label: "Setup", value: institute?.onboardingDone ? "Done" : "Pending" },
                  ]
                : [{ label: "Role", value: user!.role.charAt(0) + user!.role.slice(1).toLowerCase() }]
            }
          />
          <ListSection
            title="Quick links"
            items={quickLinks}
            emptyLabel="More tools roll out phase by phase."
          />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;

  if (user.role === "SUPERADMIN") return <SuperAdminDashboard name={user.fullName} />;
  if (user.role === "OWNER" && !user.currentInstituteId) return <OwnerOrgDashboard />;
  if (user.role === "FACULTY") return <FacultyDashboard />;
  return <InstituteDashboard />;
}
