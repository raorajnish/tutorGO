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
  | "payroll";

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
        roles: ["SUPERADMIN", "OWNER", "ADMIN", "ACCOUNTANT", "FACULTY", "RECEPTION", "STUDENT"],
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
    ],
  },
  {
    section: "Organization",
    items: [{ label: "Settings", href: "/settings", icon: "settings", roles: ["OWNER", "ADMIN"] }],
  },
  {
    section: "Platform",
    items: [
      { label: "Overview", href: "/platform", icon: "platform", roles: ["SUPERADMIN"] },
      { label: "Organizations", href: "/platform/organizations", icon: "organizations", roles: ["SUPERADMIN"] },
      { label: "Institutes", href: "/platform/institutes", icon: "institutes", roles: ["SUPERADMIN"] },
      { label: "Plans", href: "/platform/plans", icon: "plans", roles: ["SUPERADMIN"] },
      { label: "Email settings", href: "/platform/email-settings", icon: "mail", roles: ["SUPERADMIN"] },
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
