import type { ModuleCode, Role } from "./types";

export type NavIcon =
  | "dashboard"
  | "settings"
  | "platform"
  | "organizations"
  | "institutes"
  | "mail"
  | "plans"
  | "academics"
  | "enquiries"
  | "admissions"
  | "students"
  | "attendance"
  | "fees"
  | "payroll"
  | "expenses"
  | "tests"
  | "subscriptions"
  | "distribution"
  | "analytics"
  | "portalAccess"
  | "timetable"
  | "notifications"
  | "ptm"
  | "support"
  | "auditLog";

export interface NavItem {
  label: string;
  href: string;
  icon: NavIcon;
  roles: Role[];
  /// If set, the item only shows when the institute has this module active.
  /// Absent means "not gated" (always shown to matching roles).
  module?: ModuleCode;
}

export interface NavSection {
  section: string;
  items: NavItem[];
}

// Only routes that actually exist are listed here. New sections are added
// module-by-module as each phase in developmentplan.md is built.
export const NAV_SECTIONS: NavSection[] = [
  {
    section: "",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: "dashboard",
        // STUDENT deliberately absent — their landing page is /portal, which
        // shows their own record rather than the institute's operations.
        roles: ["SUPERADMIN", "OWNER", "ADMIN", "ACCOUNTANT", "FACULTY", "RECEPTION"],
      },
    ],
  },
  {
    section: "Institute",
    items: [
      { label: "Academics", href: "/academics", icon: "academics", roles: ["OWNER", "ADMIN", "RECEPTION"] },
      { label: "Enquiries", href: "/enquiries", icon: "enquiries", roles: ["OWNER", "ADMIN", "RECEPTION"], module: "ENQUIRY" },
      { label: "Admissions", href: "/admissions", icon: "admissions", roles: ["OWNER", "ADMIN", "RECEPTION"], module: "ADMISSION" },
      { label: "Students", href: "/students", icon: "students", roles: ["OWNER", "ADMIN", "RECEPTION"] },
      {
        label: "Attendance",
        href: "/attendance",
        icon: "attendance",
        roles: ["OWNER", "ADMIN", "RECEPTION", "FACULTY"],
        module: "ATTENDANCE",
      },
      {
        label: "Fees",
        href: "/fees",
        icon: "fees",
        roles: ["OWNER", "ADMIN", "RECEPTION"],
        module: "FEES",
      },
      {
        label: "Payroll",
        href: "/payroll",
        icon: "payroll",
        roles: ["OWNER", "ADMIN", "ACCOUNTANT", "FACULTY"],
        module: "PAYROLL",
      },
      {
        label: "Expenses",
        href: "/expenses",
        icon: "expenses",
        roles: ["OWNER", "ADMIN"],
        module: "EXPENSE",
      },
      {
        label: "Distribution",
        href: "/distribution",
        icon: "distribution",
        // Faculty deliberately left out — ops/logistics task, same reasoning
        // as Fees. Not module-gated (no `module:` key): a small always-on
        // utility, not a billable subscription tier.
        roles: ["OWNER", "ADMIN", "RECEPTION"],
      },
      {
        label: "Tests",
        href: "/tests",
        icon: "tests",
        roles: ["OWNER", "ADMIN", "FACULTY"],
        module: "ATTENDANCE",
      },
      {
        label: "Analytics",
        href: "/analytics",
        icon: "analytics",
        // Fee/payroll figures live in here — same OWNER/ADMIN-only bar as
        // the Fees and Payroll sections themselves, not module-gated since
        // it draws from whichever modules are actually active.
        roles: ["OWNER", "ADMIN"],
      },
      {
        label: "PTM",
        href: "/ptm",
        icon: "ptm",
        // Same scheduling roles as lectures (attendance.ts's SCHEDULE_ROLES).
        // Not module-gated — same reasoning as Distribution.
        roles: ["OWNER", "ADMIN", "RECEPTION"],
      },
    ],
  },
  {
    // The student's own portal. A separate section rather than reusing
    // "Institute": every item here reads only the signed-in student's own
    // record, so nothing in it shares a route or a permission with the
    // staff-facing pages of the same name.
    section: "My learning",
    items: [
      { label: "Overview", href: "/portal", icon: "dashboard", roles: ["STUDENT"] },
      { label: "Timetable", href: "/portal/timetable", icon: "timetable", roles: ["STUDENT"] },
      { label: "Tests", href: "/portal/tests", icon: "tests", roles: ["STUDENT"] },
      { label: "Attendance", href: "/portal/attendance", icon: "attendance", roles: ["STUDENT"] },
      { label: "Fees", href: "/portal/fees", icon: "fees", roles: ["STUDENT"] },
      { label: "Updates", href: "/portal/notifications", icon: "notifications", roles: ["STUDENT"] },
    ],
  },
  {
    section: "Organization",
    items: [
      { label: "Settings", href: "/settings", icon: "settings", roles: ["OWNER", "ADMIN"] },
      // Sits with Settings rather than under Academics on purpose: issuing a
      // login is an administrative access decision with the same OWNER/ADMIN
      // bar as Settings, not course management (which RECEPTION also has).
      { label: "Portal access", href: "/portal-access", icon: "portalAccess", roles: ["OWNER", "ADMIN"] },
    ],
  },
  {
    section: "Platform",
    items: [
      { label: "Overview", href: "/platform", icon: "platform", roles: ["SUPERADMIN"] },
      { label: "Organizations", href: "/platform/organizations", icon: "organizations", roles: ["SUPERADMIN"] },
      { label: "Institutes", href: "/platform/institutes", icon: "institutes", roles: ["SUPERADMIN"] },
      { label: "Plans", href: "/platform/plans", icon: "plans", roles: ["SUPERADMIN"] },
      { label: "Subscriptions", href: "/platform/subscriptions", icon: "subscriptions", roles: ["SUPERADMIN"] },
      { label: "Email settings", href: "/platform/email-settings", icon: "mail", roles: ["SUPERADMIN"] },
      { label: "Support", href: "/platform/support", icon: "support", roles: ["SUPERADMIN"] },
      { label: "Audit log", href: "/platform/audit-log", icon: "auditLog", roles: ["SUPERADMIN"] },
    ],
  },
];

export function navForRole(role: Role, activeModules: ModuleCode[] = []): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => item.roles.includes(role) && (!item.module || activeModules.includes(item.module))
    ),
  })).filter((section) => section.items.length > 0);
}
