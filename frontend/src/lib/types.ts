export type Role = "SUPERADMIN" | "OWNER" | "ADMIN" | "ACCOUNTANT" | "FACULTY" | "RECEPTION" | "STUDENT";

export const MODULE_CODES = ["ENQUIRY", "ADMISSION", "ATTENDANCE", "FEES", "PAYROLL", "EXPENSE"] as const;
export type ModuleCode = (typeof MODULE_CODES)[number];

export const MODULE_LABELS: Record<ModuleCode, string> = {
  ENQUIRY: "Enquiries",
  ADMISSION: "Admissions",
  ATTENDANCE: "Attendance",
  FEES: "Fees",
  PAYROLL: "Payroll",
  EXPENSE: "Expenses",
};

export interface OrganizationSummary {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface OwnedInstituteSummary {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  onboardingDone: boolean;
  activeModules: ModuleCode[];
}

export interface CurrentInstitute {
  id: string;
  code: string;
  name: string;
  organizationName: string;
  planName: string | null;
  biometricEnabled: boolean;
  onboardingStep: number;
  onboardingDone: boolean;
  activeModules: ModuleCode[];
}

export interface MeResponse {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  phone: string | null;
  mustChangePassword: boolean;
  termsAcceptedAt: string | null;
  /// Set for OWNER only.
  organization: OrganizationSummary | null;
  /// Set for OWNER only — every institute under their organization.
  institutes: OwnedInstituteSummary[] | null;
  /// The institute the current session is "inside" — null for OWNER at the
  /// organization level, always set for ADMIN/FACULTY/RECEPTION/STUDENT.
  currentInstituteId: string | null;
  /// Populated whenever currentInstituteId is set (OWNER-entered or fixed role).
  institute: CurrentInstitute | null;
}

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: Role;
    instituteId: string | null;
    organizationId: string | null;
  };
  mustChangePassword: boolean;
}

// ---------------------------------------------------------------------------
// Platform (SuperAdmin) — Organizations
// ---------------------------------------------------------------------------

export interface OrganizationListItem {
  id: string;
  code: string;
  name: string;
  city: string | null;
  state: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerMustChangePassword: boolean;
  instituteCount: number;
  activeInstituteCount: number;
}

export interface OrganizationDetail {
  id: string;
  code: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  isActive: boolean;
  createdAt: string;
  owner: {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
    isActive: boolean;
    mustChangePassword: boolean;
    lastLoginAt: string | null;
  } | null;
  institutes: {
    id: string;
    code: string;
    name: string;
    city: string | null;
    isActive: boolean;
    onboardingDone: boolean;
    modules: { code: ModuleCode; label: string; isActive: boolean }[];
    admins: { id: string; fullName: string; email: string; isActive: boolean }[];
  }[];
}

export interface PersonInput {
  name: string;
  email: string;
  phone?: string;
}

export interface CreateOrganizationPayload {
  organization: {
    name: string;
    code: string;
    address?: string;
    city?: string;
    state?: string;
    phone?: string;
    email?: string;
    gstin?: string;
  };
  institute: {
    name: string;
    code: string;
    address?: string;
    city?: string;
    state?: string;
    phone?: string;
    email?: string;
    planCode?: string;
    modules: ModuleCode[];
  };
  owner?: PersonInput;
  admin?: PersonInput;
}

export interface InviteResult {
  emailDelivered: boolean;
  loginUrl: string;
  email: string;
  tempPassword: string;
  error?: string;
}

export interface CreateOrganizationResult {
  organization: { id: string; code: string; name: string };
  institute: { id: string; code: string; name: string };
  ownerInvite?: InviteResult;
  adminInvite?: InviteResult;
}

// ---------------------------------------------------------------------------
// Platform — flat institutes list + per-org institute detail
// ---------------------------------------------------------------------------

export interface PlatformInstituteListItem {
  id: string;
  code: string;
  name: string;
  city: string | null;
  isActive: boolean;
  organization: { id: string; name: string; code: string };
  plan: { code: string; name: string } | null;
  activeModuleCount: number;
  onboardingDone: boolean;
  hasAdmin: boolean;
  adminPendingOnboarding: boolean;
}

export interface PlatformInstituteDetail {
  id: string;
  code: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  isActive: boolean;
  biometricEnabled: boolean;
  onboardingDone: boolean;
  modules: { code: ModuleCode; label: string; isActive: boolean }[];
  admins: StaffMember[];
  accountants: StaffMember[];
  availablePlans: { id: string; code: string; name: string }[];
  plan: { id: string; code: string; name: string; limits: PlanLimits } | null;
}

// ---------------------------------------------------------------------------
// Plans — per-institute role headcount limits
// ---------------------------------------------------------------------------

export const CAPPED_ROLES = ["ADMIN", "ACCOUNTANT", "FACULTY", "RECEPTION", "STUDENT"] as const;
export type CappedRole = (typeof CAPPED_ROLES)[number];

export const CAPPED_ROLE_LABELS: Record<CappedRole, string> = {
  ADMIN: "Admins",
  ACCOUNTANT: "Accountants",
  FACULTY: "Faculty",
  RECEPTION: "Reception",
  STUDENT: "Students",
};

export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  maxAdmins: number;
  maxAccountants: number;
  maxFaculty: number;
  maxReception: number;
  maxStudents: number;
  isActive: boolean;
  instituteCount: number;
}

export interface PlanLimits {
  ADMIN: { used: number; max: number };
  ACCOUNTANT: { used: number; max: number };
  FACULTY: { used: number; max: number };
  RECEPTION: { used: number; max: number };
  STUDENT: { used: number; max: number };
}

// ---------------------------------------------------------------------------
// Organization (Owner) — Institutes
// ---------------------------------------------------------------------------

export interface InstituteDetail {
  id: string;
  code: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  isActive: boolean;
  biometricEnabled: boolean;
  onboardingDone: boolean;
  modules: { code: ModuleCode; label: string; isActive: boolean }[];
  admins: StaffMember[];
  accountants: StaffMember[];
  plan: { code: string; name: string; limits: PlanLimits } | null;
}

export interface StaffMember {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
}

// ---------------------------------------------------------------------------
// Institute Settings (OWNER-entered institute, or ADMIN's fixed institute)
// ---------------------------------------------------------------------------

export interface InstituteProfile {
  id: string;
  code: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  planName: string | null;
  isActive: boolean;
  biometricEnabled: boolean;
  onboardingStep: number;
  onboardingDone: boolean;
  modules: { code: ModuleCode; isActive: boolean }[];
}

export const TEAM_ROLES = ["ADMIN", "ACCOUNTANT", "FACULTY", "RECEPTION"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  ADMIN: "Admin",
  ACCOUNTANT: "Accountant",
  FACULTY: "Faculty",
  RECEPTION: "Reception",
};

export interface TeamMember extends StaffMember {
  role: TeamRole;
}

export interface InstitutePlanResponse {
  plan: { code: string; name: string; description: string | null; limits: PlanLimits } | null;
}

// ---------------------------------------------------------------------------
// Academics — Courses / Subjects / Batches
// ---------------------------------------------------------------------------

export interface CourseRef {
  id: string;
  name: string;
  code: string;
}

export interface Course {
  id: string;
  name: string;
  code: string;
  durationMonths: number | null;
  description: string | null;
  isActive: boolean;
  batchCount: number;
  studentCount: number;
  subjectCount: number;
}

export interface Subject {
  id: string;
  name: string;
  shortCode: string;
  isActive: boolean;
  courses: CourseRef[];
}

export interface Batch {
  id: string;
  name: string;
  course: CourseRef;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  enrolledCount: number;
  lectureCount: number;
}

// ---------------------------------------------------------------------------
// Enquiry → Admission → Students
// ---------------------------------------------------------------------------

export const ENQUIRY_SOURCES = ["WALK_IN", "REFERRAL", "SOCIAL", "PHONE", "OTHER"] as const;
export type EnquirySource = (typeof ENQUIRY_SOURCES)[number];

export const ENQUIRY_SOURCE_LABELS: Record<EnquirySource, string> = {
  WALK_IN: "Walk-in",
  REFERRAL: "Referral",
  SOCIAL: "Social",
  PHONE: "Phone",
  OTHER: "Other",
};

export const ENQUIRY_STATUSES = ["NEW", "CONTACTED", "CONVERTED", "LOST"] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

export const ENQUIRY_STATUS_LABELS: Record<EnquiryStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  CONVERTED: "Converted",
  LOST: "Lost",
};

export interface Enquiry {
  id: string;
  name: string;
  phone: string;
  course: CourseRef | null;
  source: EnquirySource;
  status: EnquiryStatus;
  nextFollowUpDate: string | null;
  notes: string | null;
  createdAt: string;
}

export const MAX_NOTE_LENGTH = 300;

export const ENQUIRY_ACTIVITY_TYPES = ["CONTACTED", "CONVERTED", "LOST"] as const;
export type EnquiryActivityType = (typeof ENQUIRY_ACTIVITY_TYPES)[number];

export const ENQUIRY_ACTIVITY_LABELS: Record<EnquiryActivityType, string> = {
  CONTACTED: "Contacted",
  CONVERTED: "Converted to admission",
  LOST: "Marked lost",
};

export interface EnquiryActivity {
  id: string;
  type: EnquiryActivityType;
  note: string | null;
  nextFollowUpDate: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface BatchRef {
  id: string;
  name: string;
}

export interface StudentListItem {
  id: string;
  studentCode: string;
  name: string;
  email: string;
  phone: string | null;
  course: CourseRef;
  currentBatch: BatchRef | null;
  admissionDate: string;
  isActive: boolean;
}

export interface StudentsResponse {
  students: StudentListItem[];
  stats: {
    activeStudents: number;
    totalStudents: number;
    activeBatches: number;
    feeBookValue: number;
  };
}

export interface StudentBatchHistoryEntry {
  id: string;
  batch: { id: string; name: string; course: { id: string; name: string } };
  joinedAt: string;
  leftAt: string | null;
}

export interface StudentDetail {
  id: string;
  studentCode: string;
  name: string;
  email: string;
  phone: string | null;
  parentPhone: string | null;
  course: CourseRef;
  dob: string | null;
  fatherName: string | null;
  motherName: string | null;
  school: string | null;
  admissionDate: string;
  fingerprintId: string | null;
  isActive: boolean;
  enquiry: { id: string; source: EnquirySource; createdAt: string } | null;
  batchHistory: StudentBatchHistoryEntry[];
  feeAccount: null;
  recentAttendance: never[];
}

export interface AdmitStudentPayload {
  enquiryId?: string;
  name: string;
  email?: string;
  phone: string;
  parentPhone?: string;
  courseId: string;
  dob?: string;
  fatherName?: string;
  motherName?: string;
  school?: string;
  admissionDate: string;
  batchId: string;
  fingerprintId?: string;
}

// ---------------------------------------------------------------------------
// Attendance (Phase 4a — staff-facing)
// ---------------------------------------------------------------------------

// HOLIDAY intentionally left out of the offered toggle options (§ mark-attendance UX
// feedback: a holiday is calendar-wide, not a per-student choice) but kept in the type
// so any already-marked HOLIDAY records still render a label instead of crashing.
export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LATE", "LEAVE"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number] | "HOLIDAY" | "PRESENT_BIOMETRIC";

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LEAVE: "Leave",
  LATE: "Late",
  HOLIDAY: "Holiday",
  PRESENT_BIOMETRIC: "Present (biometric)",
};

export interface FacultyRef {
  id: string;
  fullName: string;
}

export interface SubjectRef {
  id: string;
  name: string;
  shortCode: string;
}

export interface Lecture {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  cancelled: boolean;
  cancelReason: string | null;
  note: string | null;
  batch: { id: string; name: string; course: CourseRef };
  subject: SubjectRef;
  faculty: FacultyRef;
  markedCount: number;
}

export const MESSAGE_TEMPLATE_TYPES = ["LECTURE_SCHEDULED", "LECTURE_CANCELLED", "ATTENDANCE_MARKED"] as const;
export type MessageTemplateType = (typeof MESSAGE_TEMPLATE_TYPES)[number];

export const MESSAGE_TEMPLATE_LABELS: Record<MessageTemplateType, string> = {
  LECTURE_SCHEDULED: "Lecture scheduled",
  LECTURE_CANCELLED: "Lecture cancelled",
  ATTENDANCE_MARKED: "Attendance marked",
};

export interface MessageTemplate {
  type: MessageTemplateType;
  body: string;
  isDefault: boolean;
}

export interface LectureSummary extends Lecture {
  expected: number;
  present: number;
  absent: number;
  leave: number;
  late: number;
  holiday: number;
  unmarked: number;
}

export interface RosterEntry {
  student: { id: string; name: string; studentCode: string };
  status: AttendanceStatus | null;
  markedAt: string | null;
  markedByName: string | null;
}

export interface AttendanceStats {
  total: number;
  today: number;
  upcoming: number;
}

export interface FacultyCourseAssignment {
  course: CourseRef;
  allSubjects: boolean;
  subjects: SubjectRef[];
}

export interface FacultyAssignmentInput {
  courseId: string;
  subjectIds: string[];
}

export interface ScheduleLecturePayload {
  batchId: string;
  subjectId: string;
  date: string;
  startTime: string;
  endTime: string;
  facultyId?: string;
  note?: string;
}
