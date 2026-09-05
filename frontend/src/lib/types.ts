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
  /// changes-phase12.md §12.6 — true for every staff role (OWNER/ADMIN/
  /// ACCOUNTANT/FACULTY/RECEPTION), false for STUDENT/SUPERADMIN. Gates
  /// whether the Security tab even offers the option.
  mfaEligible: boolean;
  mfaEnabled: boolean;
  /// STUDENT only — true when their course has any study material. Hides the
  /// portal's "Study material" nav item until there's something to show
  /// (changes-phase12.md §12.5).
  hasStudyResources?: boolean;
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

interface LoginSuccess {
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

/// changes-phase12.md §12.6 — returned by POST /auth/login in place of
/// LoginSuccess when the account has MFA enabled. No token yet; the
/// challengeToken is exchanged for a real one via POST /auth/mfa/verify.
interface MfaChallengeResponse {
  mfaRequired: true;
  challengeToken: string;
}

export type LoginResponse = LoginSuccess | MfaChallengeResponse;

/// POST /auth/mfa/verify returns this same shape on success — it's the
/// second half of the same login, not a different response.
export type MfaVerifyResponse = LoginSuccess;

// ---------------------------------------------------------------------------
// Forgot password (OTP)
// ---------------------------------------------------------------------------

export interface VerifyOtpResponse {
  resetToken: string;
}

export interface ResetPasswordResponse {
  token: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: Role;
    instituteId: string | null;
    organizationId: string | null;
  };
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export interface ExpenseCategory {
  id: string;
  name: string;
  kind: "EXPENSE" | "INCOME";
  isActive: boolean;
  createdAt: string;
}

export interface ExpenseEvent {
  id: string;
  name: string;
  notes: string | null;
  createdAt: string;
}

export interface Expense {
  id: string;
  title: string;
  amount: string;
  date: string;
  mode: PaymentMode;
  referenceNo: string | null;
  notes: string | null;
  category: { id: string; name: string };
  event: { id: string; name: string } | null;
  createdByName: string | null;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  kind: "INCOME" | "EXPENSE" | "PAYROLL";
  date: string;
  description: string;
  amount: string;
}

export interface LedgerResponse {
  entries: LedgerEntry[];
  summary: { income: string; expense: string; payroll: string; net: string };
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

// ---------------------------------------------------------------------------
// Platform health (changes-phase14.md §14.1)
// ---------------------------------------------------------------------------

export interface ChannelHealth {
  sent: number;
  failed: number;
  total: number;
  failureRate: number;
}

export interface InstituteHealth {
  instituteId: string;
  instituteName: string;
  organizationName: string | null;
  whatsapp: ChannelHealth;
  email: ChannelHealth;
}

export interface PlatformHealth {
  from: string;
  to: string;
  overall: { whatsapp: ChannelHealth; email: ChannelHealth };
  institutes: InstituteHealth[];
}

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
  availablePlans: { id: string; code: string; name: string; limits: RoleLimitValues }[];
  /// What is actually ENFORCED for this institute — its own snapshot of the
  /// plan's numbers, taken when the plan was assigned and editable per
  /// institute since. Null only when no plan and no snapshot (unlimited).
  limits: PlanLimits | null;
  /// True when `limits` has drifted from `plan.limits` — either the plan was
  /// edited afterwards, or this institute was given a bespoke ceiling.
  customised: boolean;
  planLimitsSetAt: string | null;
  /// Where the snapshot originally came from. `plan.limits` are the plan's
  /// CURRENT headline numbers, i.e. what re-assigning it would copy over.
  plan: { id: string; code: string; name: string; limits: RoleLimitValues } | null;
}

/// A bare max-per-role map (no usage counts) — a plan's headline numbers.
export type RoleLimitValues = Record<CappedRole, number>;

/// One suspend/lift cycle for an institute (changes-phase12.md §12.10).
export interface InstituteSuspension {
  id: string;
  reason: string;
  suspendedAt: string;
  liftedAt: string | null;
  suspendedBy: { id: string; fullName: string };
  liftedBy: { id: string; fullName: string } | null;
}

/// One row of the platform-wide user directory (SUPERADMIN only).
export interface PlatformUser {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  mfaEnabled: boolean;
  instituteId: string | null;
  instituteName: string | null;
  instituteCode: string | null;
  organizationName: string | null;
}

/// One row of the platform-wide subscription overview: an institute, its
/// plan, live usage against every cap, and which modules it's paying for.
export interface SubscriptionRow {
  id: string;
  code: string;
  name: string;
  city: string | null;
  isActive: boolean;
  onboardingDone: boolean;
  createdAt: string;
  organization: { id: string; name: string; code: string };
  plan: { id: string; code: string; name: string } | null;
  limits: PlanLimits | null;
  /// True when this institute's enforced limits differ from its plan's
  /// headline numbers — see PlatformInstituteDetail.customised.
  customised: boolean;
  /// True when any capped role is at or over its limit — they've outgrown the tier.
  atLimit: boolean;
  activeModules: ModuleCode[];
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

// ---------------------------------------------------------------------------
// Scheduled reminders (Phase 8d)
// ---------------------------------------------------------------------------

export const REMINDER_CATEGORIES = ["UTILITY", "RENT", "MAINTENANCE", "COMPLIANCE", "SUPPLIES", "OTHER"] as const;
export type ReminderCategory = (typeof REMINDER_CATEGORIES)[number];

export const REMINDER_CATEGORY_LABELS: Record<ReminderCategory, string> = {
  UTILITY: "Utility bill",
  RENT: "Rent",
  MAINTENANCE: "Maintenance",
  COMPLIANCE: "Licence / compliance",
  SUPPLIES: "Supplies",
  OTHER: "Other",
};

export const REMINDER_REPEATS = ["NONE", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"] as const;
export type ReminderRepeat = (typeof REMINDER_REPEATS)[number];

export const REMINDER_REPEAT_LABELS: Record<ReminderRepeat, string> = {
  NONE: "Doesn't repeat",
  WEEKLY: "Every week",
  MONTHLY: "Every month",
  QUARTERLY: "Every 3 months",
  YEARLY: "Every year",
};

export const REMINDER_AUDIENCES = ["PRIVATE", "ADMINS"] as const;
export type ReminderAudience = (typeof REMINDER_AUDIENCES)[number];

export const REMINDER_AUDIENCE_LABELS: Record<ReminderAudience, string> = {
  PRIVATE: "Only me",
  ADMINS: "Me, the owner & all admins",
};

/** Presets the UI offers; any other number is still valid server-side. */
export const REMINDER_LEAD_PRESETS = [90, 30, 15, 7, 1, 0] as const;

export function reminderLeadLabel(days: number): string {
  if (days === 0) return "On the day";
  if (days === 1) return "1 day before";
  if (days === 7) return "1 week before";
  return `${days} days before`;
}

export type ReminderStatus = "SCHEDULED" | "NOTIFYING" | "DUE_TODAY" | "OVERDUE";

export interface Reminder {
  id: string;
  title: string;
  category: ReminderCategory;
  dueDate: string;
  /** Every lead time it notifies at, largest first. */
  leadDays: number[];
  repeat: ReminderRepeat;
  audience: ReminderAudience;
  notes: string | null;
  isActive: boolean;
  lastFiredAt: string | null;
  /** Next unfired nudge; null once every lead time for this date has gone out. */
  nextNotifyOn: string | null;
  nextNotifyLead: number | null;
  daysUntilDue: number;
  status: ReminderStatus;
  createdByName: string | null;
}

export interface CourseRef {
  id: string;
  name: string;
  code: string;
}

/** FLAT = one course fee; SUBJECT_WISE = the sum of the subjects a student picks. */
export type CourseFeeMode = "FLAT" | "SUBJECT_WISE";

export interface Course {
  id: string;
  name: string;
  code: string;
  durationMonths: number | null;
  description: string | null;
  isActive: boolean;
  feeMode: CourseFeeMode;
  /** True once the course has students or fee structures — the mode is then fixed. */
  feeModeLocked: boolean;
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
  hasFeeAccount: boolean;
  selfFillPending: boolean;
  profileCompletedAt: string | null;
}

/// One row from GET /students/self-fill-status — see changes-phase8.md §8f.
export interface SelfFillStatusRow {
  id: string;
  name: string;
  studentCode: string;
  course: CourseRef;
  profileCompletedAt: string | null;
  selfFillLocked: boolean;
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
  feesModuleEnabled: boolean;
  feeAccount: { planType: FeePlanType; status: FeeAccountStatus; totalDue: string; totalPaid: string; balance: string } | null;
  attendanceModuleEnabled: boolean;
  recentAttendance: { lectureId: string; date: string; subject: string; batch: string; status: AttendanceStatus }[];
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

export const LECTURE_KINDS = ["LECTURE", "TEST"] as const;
export type LectureKind = (typeof LECTURE_KINDS)[number];

export interface Lecture {
  id: string;
  /// A test session is the same row with kind "TEST" — see the Tests section.
  kind: LectureKind;
  testId: string | null;
  testTitle: string | null;
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

export const MESSAGE_TEMPLATE_TYPES = [
  "LECTURE_SCHEDULED",
  "LECTURE_CANCELLED",
  "ATTENDANCE_MARKED",
  "FEE_OVERDUE_REMINDER",
  "PAYROLL_PAYMENT_RECORDED",
] as const;
export type MessageTemplateType = (typeof MESSAGE_TEMPLATE_TYPES)[number];

export const MESSAGE_TEMPLATE_LABELS: Record<MessageTemplateType, string> = {
  LECTURE_SCHEDULED: "Lecture scheduled",
  LECTURE_CANCELLED: "Lecture cancelled",
  ATTENDANCE_MARKED: "Attendance marked",
  FEE_OVERDUE_REMINDER: "Fee overdue reminder",
  PAYROLL_PAYMENT_RECORDED: "Payroll payment recorded",
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

export interface Invigilator {
  id: string;
  fullName: string;
  role: Role;
}

export interface TestPaperAsset {
  url: string;
  type: "pdf" | "image";
  name: string;
  /// Storage handle, round-tripped back on save so the server can delete the
  /// asset if the paper is later replaced or removed.
  publicId: string;
  bytes: number;
}

export interface Test {
  id: string;
  title: string;
  totalMarks: number;
  passingMarks: number | null;
  instructions: string | null;
  paperAssetUrl: string | null;
  paperAssetType: "pdf" | "image" | null;
  paperAssetName: string | null;
  paperAssetPublicId: string | null;
  createdAt: string;
  course: CourseRef;
  subject: SubjectRef;
}

export interface TestListItem extends Test {
  sessionCount: number;
  resultCount: number;
  batches: string[];
  firstDate: string | null;
}

/// One batch's sitting of a test — a Lecture row with kind "TEST".
export interface TestSession extends Omit<Lecture, "markedCount"> {
  expected: number;
  markedCount: number;
  presentCount: number;
  resultCount: number;
}

export interface TestDetail extends Test {
  sessions: TestSession[];
}

export interface TestSessionPayload {
  batchId: string;
  date: string;
  startTime: string;
  endTime: string;
  invigilatorId: string;
}

export interface CreateTestPayload {
  courseId: string;
  subjectId: string;
  title: string;
  totalMarks: number;
  passingMarks?: number;
  instructions?: string;
  paperAssetUrl?: string;
  paperAssetType?: "pdf" | "image";
  paperAssetName?: string;
  paperAssetPublicId?: string;
  sessions: TestSessionPayload[];
  acceptSplitFor?: string[];
}

/// Returned as a 409 body when a test lands inside an existing lecture that
/// can be safely split around it.
export interface ScheduleConflict {
  batchId: string;
  batchName: string;
  split: {
    conflictLectureId: string;
    conflictLabel: string;
    before: { startTime: string; endTime: string } | null;
    after: { startTime: string; endTime: string } | null;
  };
}

export interface TestReportRow {
  student: { id: string; name: string; studentCode: string };
  attendanceStatus: AttendanceStatus | null;
  present: boolean;
  marksObtained: string | null;
  remarks: string | null;
  passed: boolean | null;
}

export interface TestReport {
  test: Test;
  instituteName: string;
  session: Omit<Lecture, "markedCount">;
  rows: TestReportRow[];
  summary: {
    total: number;
    present: number;
    absent: number;
    graded: number;
    highest: string | null;
    lowest: string | null;
    average: string | null;
    passed: number | null;
  };
}

// ---------------------------------------------------------------------------
// Reminder broadcasts
// ---------------------------------------------------------------------------

export interface ReminderAudienceRow {
  role: TeamRole;
  count: number;
}


// ---------------------------------------------------------------------------
// Fees (Phase 5a — staff-facing)
// ---------------------------------------------------------------------------

export const FEE_PLAN_TYPES = ["ONE_TIME", "RECURRING"] as const;
export type FeePlanType = (typeof FEE_PLAN_TYPES)[number];

export const FEE_PLAN_TYPE_LABELS: Record<FeePlanType, string> = {
  ONE_TIME: "One-time plan",
  RECURRING: "Monthly recurring",
};

export const FEE_ACCOUNT_STATUSES = ["ACTIVE", "CLOSED"] as const;
export type FeeAccountStatus = (typeof FEE_ACCOUNT_STATUSES)[number];

export const PAYMENT_MODES = ["UPI", "CASH", "CARD", "BANK_TRANSFER", "CHEQUE"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  UPI: "UPI",
  CASH: "Cash",
  CARD: "Card",
  BANK_TRANSFER: "Bank transfer",
  CHEQUE: "Cheque",
};

export const INSTALLMENT_STATUSES = ["PENDING", "PARTIAL", "PAID", "OVERDUE"] as const;
export type InstallmentStatus = (typeof INSTALLMENT_STATUSES)[number];

export interface FeeStudentRef {
  id: string;
  name: string;
  studentCode: string;
  course?: CourseRef;
}

/** One priced subject on a SUBJECT_WISE structure. `amount` "0" = complementary. */
export interface FeeStructureSubjectLine {
  subjectId: string;
  subjectName: string;
  subjectShortCode: string;
  amount: string;
}

export interface FeeStructure {
  id: string;
  name: string;
  course: CourseRef & { feeMode?: CourseFeeMode };
  planType: FeePlanType;
  courseFee: string | null;
  installmentCount: number | null;
  monthlyAmount: string | null;
  billingDay: number | null;
  isActive: boolean;
  isDefault: boolean;
  /** Null on a FLAT structure; the full priced subject list on a SUBJECT_WISE one. */
  subjectLines: FeeStructureSubjectLine[] | null;
}

export interface FeeInstallment {
  id: string;
  seq: number;
  dueDate: string;
  originalDueDate: string | null;
  amount: string;
  paidAmount: string;
  waived: boolean;
  /** True when this installment's amount was bumped up by a shortfall
   * carried forward from an earlier underpaid installment — see fees.ts
   * POST /payments and changes-phase8.md §8a. Display hint only. */
  adjustedFromPrevious: boolean;
  status: InstallmentStatus;
}

/** One line item within a payment — how much of that one transaction went
 * toward one specific installment. A single payment can span several
 * installments (waterfall allocation, see fees.ts). */
export interface PaymentAllocationRef {
  installmentId: string;
  installmentSeq: number;
  amount: string;
}

export interface FeePayment {
  id: string;
  amount: string;
  mode: PaymentMode;
  paidOn: string;
  receiptNumber: string;
  notes: string | null;
  createdByName: string | null;
  voided: boolean;
  voidReason: string | null;
  voidedByName: string | null;
  createdAt: string;
  allocations: PaymentAllocationRef[];
}

export type DiscountType = "FLAT" | "PERCENT";

export interface FeeAccount {
  id: string;
  studentId: string;
  planType: FeePlanType;
  status: FeeAccountStatus;
  feeStructure: { id: string; name: string } | null;
  courseFee: string | null;
  discount: string | null;
  discountType: DiscountType;
  finalFee: string | null;
  installmentCount: number | null;
  monthlyAmount: string | null;
  billingDay: number | null;
  installments: FeeInstallment[];
  payments: FeePayment[];
  totalDue: string;
  totalPaid: string;
  totalWaived: string;
  balance: string;
}

export interface FeeAccountResponse {
  student: FeeStudentRef;
  account: FeeAccount | null;
}

export interface InstallmentInput {
  dueDate: string;
  amount: number;
}

/** A student's subject enrollment on a SUBJECT_WISE course — drives their rosters. */
export interface StudentSubject {
  id: string;
  subjectId: string;
  subjectName: string;
  subjectShortCode: string;
  amount: string;
  isActive: boolean;
  joinedAt: string;
  leftAt: string | null;
}

export interface RevisePricingPayload {
  /** SUBJECT_WISE only — mutually exclusive with courseFee. */
  subjectIds?: string[];
  /** FLAT only — mutually exclusive with subjectIds. */
  courseFee?: number;
  discount?: number;
  discountType?: DiscountType;
  firstDueDate?: string;
  installmentCount?: number;
}

export interface OverdueEntry {
  installment: FeeInstallment;
  daysOverdue: number;
  student: FeeStudentRef & { phone: string | null; parentPhone: string | null };
  outstanding: string;
}

export interface ReceiptDetail extends FeePayment {
  student: FeeStudentRef & { course: CourseRef };
  accountTotals: { totalDue: string; totalPaid: string; totalWaived: string; balance: string };
  /// Null when this payment predates the publicToken column, or the link was
  /// revoked — no public link exists to share in either case.
  publicToken: string | null;
}

/// What GET /public/receipts/:token returns — deliberately narrower than
/// ReceiptDetail: a receipt documents one payment, not the whole fee
/// account, so there's no accountTotals/createdByName here (nothing an
/// unauthenticated visitor should see beyond this one payment).
export interface PublicReceipt {
  receiptNumber: string;
  amount: string;
  mode: PaymentMode;
  paidOn: string;
  notes: string | null;
  voided: boolean;
  voidReason: string | null;
  createdAt: string;
  institute: { name: string; address: string | null; phone: string | null; email: string | null };
  student: { id: string; name: string; studentCode: string; course: { name: string; code: string } | null };
  allocations: { installmentSeq: number; dueDate: string; amount: string }[];
}

export interface ReceiptListItem extends FeePayment {
  student: { id: string; name: string; studentCode: string; phone: string | null };
}

// ---------------------------------------------------------------------------
// Staff leave (Phase 10.4)
// ---------------------------------------------------------------------------

export const LEAVE_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export interface LeaveRequest {
  id: string;
  userId: string;
  userName: string;
  userRole: Role;
  startDate: string;
  endDate: string;
  /** Inclusive day count — a single-day request is 1, not 0. */
  days: number;
  reason: string;
  status: LeaveStatus;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
}

export interface CreateLeaveRequestResult extends LeaveRequest {
  /** True when this new request's dates overlap an already-APPROVED request
   * for the same person — surfaced as a warning, not blocked; the reviewer
   * decides. */
  overlapsApprovedLeave: boolean;
}

// ---------------------------------------------------------------------------
// Payroll (Phase 6)
// ---------------------------------------------------------------------------

export const SALARY_TYPES = ["FIXED", "PER_LECTURE"] as const;
export type SalaryType = (typeof SALARY_TYPES)[number];

export const SALARY_TYPE_LABELS: Record<SalaryType, string> = {
  FIXED: "Fixed monthly",
  PER_LECTURE: "Per lecture",
};

export const PAYROLL_ELIGIBLE_ROLES = ["ADMIN", "ACCOUNTANT", "FACULTY", "RECEPTION"] as const;
export type PayrollEligibleRole = (typeof PAYROLL_ELIGIBLE_ROLES)[number];

export interface SalaryProfileListItem {
  id: string;
  name: string;
  title: string | null;
  isExternal: boolean;
  externalEmail: string | null;
  externalPhone: string | null;
  salaryType: SalaryType;
  monthlyRate: string | null;
  perLectureRate: string | null;
  isActive: boolean;
  pendingAmount: string;
  lastPaidOn: string | null;
  lastPaidAmount: string | null;
}

export interface UnconfiguredStaffUser {
  id: string;
  fullName: string;
  role: PayrollEligibleRole;
}

export interface PayrollStaffResponse {
  staff: SalaryProfileListItem[];
  unconfigured: UnconfiguredStaffUser[];
}

export interface RateHistoryEntry {
  id: string;
  changedByName: string | null;
  changedAt: string;
  from: { monthlyRate: string | null; perLectureRate: string | null } | null;
  to: { monthlyRate: string | null; perLectureRate: string | null } | null;
}

export type PayrollLineItemKind = "SALARY" | "LECTURE";
export type PayrollLineItemStatus = "UNPAID" | "PARTIAL" | "PAID";

export interface PayrollLineItem {
  id: string;
  kind: PayrollLineItemKind;
  periodMonth: string;
  lectureId: string | null;
  label: string;
  amount: string;
  paidAmount: string;
  status: PayrollLineItemStatus;
}

export interface PayrollPeriodGroup {
  periodMonth: string;
  label: string;
  totalAmount: string;
  totalPaid: string;
  totalOutstanding: string;
  lineItems: PayrollLineItem[];
}

export interface PayrollLedgerTotals {
  lecturesCount: number;
  totalEarned: string;
  totalPaid: string;
  totalPending: string;
}

export interface PayrollLedger {
  id: string | null;
  name?: string;
  title?: string | null;
  salaryType?: SalaryType;
  monthlyRate?: string | null;
  perLectureRate?: string | null;
  isActive?: boolean;
  advanceBalance: string;
  totals: PayrollLedgerTotals;
  periods: PayrollPeriodGroup[];
}

export interface PayrollPaymentAllocationRef {
  lineItemId: string | null;
  amount: string;
}

export interface PayrollPayment {
  id: string;
  amount: string;
  mode: PaymentMode;
  paidOn: string;
  notes: string | null;
  voided: boolean;
  voidReason: string | null;
  createdByName: string | null;
  voidedByName: string | null;
  createdAt: string;
  allocations: PayrollPaymentAllocationRef[];
}

export const PAYROLL_RUN_STATUSES = ["DRAFT", "APPROVED", "PAID"] as const;
export type PayrollRunStatus = (typeof PAYROLL_RUN_STATUSES)[number];

export interface PayrollRunStaffSummary {
  salaryProfileId: string;
  name: string;
  totalAmount: string;
  totalPaid: string;
  totalOutstanding: string;
}

export interface PayrollRunSummary {
  staff: PayrollRunStaffSummary[];
  totalAmount: string;
  totalPaid: string;
  totalOutstanding: string;
}

export interface PayrollRun {
  id: string;
  periodMonth: string;
  label: string;
  status: PayrollRunStatus;
  approvedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  summary?: PayrollRunSummary;
}

export interface PayrollRunPreview {
  periodMonth: string;
  label: string;
  staff: { salaryProfileId: string; name: string; projectedAmount: string }[];
  totalAmount: string;
}

export interface CreateSalaryProfilePayload {
  userId?: string;
  externalName?: string;
  externalEmail?: string;
  externalPhone?: string;
  title?: string;
  salaryType: SalaryType;
  monthlyRate?: number;
  perLectureRate?: number;
}

// ---------------------------------------------------------------------------
// Institute email settings (Settings → Email)
// ---------------------------------------------------------------------------

export interface InstituteEmailConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromName: string;
  fromEmail: string;
  isEnabled: boolean;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// WhatsApp Business (Settings → WhatsApp) — see changes-phase9.md §9a
// ---------------------------------------------------------------------------

export interface InstituteWhatsAppConfig {
  phoneNumberId: string;
  wabaId: string;
  businessAccountId: string | null;
  isEnabled: boolean;
  connectedAt: string;
  updatedAt: string;
}

export type WhatsAppTemplateStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED";

export interface WhatsAppTemplate {
  id: string;
  instituteId: string;
  metaTemplateId: string | null;
  name: string;
  language: string;
  category: string;
  status: WhatsAppTemplateStatus;
  bodyText: string;
  mappedType: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// In-app notifications
// ---------------------------------------------------------------------------

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Help & support (changes-phase12.md §12.3)
// ---------------------------------------------------------------------------

export type SupportTicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED";
export type SupportTicketCategory = "BILLING" | "BUG" | "FEATURE_REQUEST" | "OTHER";

export const SUPPORT_CATEGORIES: SupportTicketCategory[] = ["BILLING", "BUG", "FEATURE_REQUEST", "OTHER"];
export const SUPPORT_CATEGORY_LABELS: Record<SupportTicketCategory, string> = {
  BILLING: "Billing",
  BUG: "Bug report",
  FEATURE_REQUEST: "Feature request",
  OTHER: "Other",
};
export const SUPPORT_STATUS_LABELS: Record<SupportTicketStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
};

export interface SupportTicketMessage {
  id: string;
  authorUserId: string;
  isFromPlatform: boolean;
  body: string;
  createdAt: string;
  author: { id: string; fullName: string };
}

export interface SupportTicketSummary {
  id: string;
  category: SupportTicketCategory;
  subject: string;
  status: SupportTicketStatus;
  instituteId?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; fullName: string; email?: string };
  organization?: { id: string; name: string };
  institute?: { id: string; name: string } | null;
  _count: { messages: number };
}

export interface SupportTicketDetail extends SupportTicketSummary {
  organizationId: string;
  instituteId: string | null;
  createdByUserId: string;
  messages: SupportTicketMessage[];
}

// ---------------------------------------------------------------------------
// Distribution tracking (books, bags, T-shirts, digests) — see changes-phase8.md §8e
// ---------------------------------------------------------------------------

export interface DistributionItem {
  id: string;
  name: string;
  course: CourseRef | null;
  totalSets: number | null;
  isActive: boolean;
  createdAt: string;
  studentCount: number;
  receivedCount: number;
}

export interface DistributionReceiptRow {
  id: string;
  student: { id: string; name: string; studentCode: string };
  batch: { id: string; name: string } | null;
  receivedAt: string | null;
  notes: string | null;
}

export interface DistributionRosterResponse {
  item: { id: string; name: string; totalSets: number | null };
  receipts: DistributionReceiptRow[];
  receivedCount: number;
  totalCount: number;
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export interface AnalyticsRange {
  from: string;
  to: string;
}

export interface TrendPoint {
  label: string;
  value: number;
}

export interface InstituteAnalytics {
  range: AnalyticsRange;
  enrollment: {
    totalActive: number;
    admissionsInRange: number;
    byCourse: { course: CourseRef | null; count: number }[];
    admissionsTrend: TrendPoint[];
  };
  lectures: {
    total: number;
    cancelled: number;
    byCourse: { course: CourseRef | null; held: number; cancelled: number }[];
  };
  attendance: {
    overallPercent: number;
    byStatus: Record<string, number>;
    trend: TrendPoint[];
  };
  tests: {
    testCount: number;
    totalAttempts: number;
    averagePercent: number;
    passRate: number;
    byCourse: { course: { id: string; name: string }; attempts: number; passRate: number; averagePercent: number }[];
  };
  fees: {
    totalDue: string;
    totalCollected: string;
    coveragePercent: number;
    collectedInRange: string;
    overdueCount: number;
    overdueAmount: string;
    collectedTrend: TrendPoint[];
  };
  payroll: {
    totalInRange: string;
    paidInRange: string;
    trend: TrendPoint[];
  };
  expenses: {
    totalInRange: string;
    byCategory: { category: { id: string; name: string } | null; amount: string }[];
    trend: TrendPoint[];
  };
  finance: {
    collected: string;
    payrollPaid: string;
    expensesPaid: string;
    net: string;
    trend: { label: string; income: number; payroll: number; expenses: number; net: number }[];
  };
}

export type StudentAnalyticsFlag = "LOW_ATTENDANCE" | "DECLINING_SCORES";

export interface StudentAnalyticsRow {
  student: { id: string; name: string; studentCode: string; course: CourseRef };
  attendancePercent: number | null;
  testAveragePercent: number | null;
  testCount: number;
  flags: StudentAnalyticsFlag[];
}

export interface StudentAnalyticsListResponse {
  range: AnalyticsRange;
  students: StudentAnalyticsRow[];
}

export interface StudentAnalyticsDetail {
  student: { id: string; name: string; studentCode: string; course: CourseRef & { feeMode: CourseFeeMode } };
  range: AnalyticsRange;
  attendance: {
    overallPercent: number;
    trend: TrendPoint[];
    bySubject: { subject: { id: string; name: string }; percent: number }[];
  };
  tests: {
    history: {
      testId: string;
      title: string;
      subject: string;
      marksObtained: number;
      totalMarks: number;
      percent: number;
      passed: boolean | null;
      date: string;
    }[];
    averagePercent: number | null;
  };
}

// ---------------------------------------------------------------------------
// Student portal (Phase 10.6)
// ---------------------------------------------------------------------------

/// Derived on the server on every read — never stored. See
/// backend/src/lib/portalAccess.ts for why.
export type PortalAccessStatus = "NOT_ELIGIBLE" | "PENDING" | "ACTIVE" | "SUSPENDED";

export interface PortalAccessStudent {
  id: string;
  name: string;
  email: string;
  batch: { id: string; name: string } | null;
  status: PortalAccessStatus;
  hasLogin: boolean;
  lastLoginAt: string | null;
  /// Login exists but the temp password has never been changed — i.e. they
  /// were sent credentials and haven't signed in yet.
  awaitingFirstLogin: boolean;
}

export interface PortalAccessCourse {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  portalEnabled: boolean;
  counts: { total: number; active: number; pending: number };
  students: PortalAccessStudent[];
}

/// Credential delivery result. `tempPassword` is only ever returned when the
/// email could NOT be delivered, so staff can hand it over another way —
/// same contract as the existing staff-invite flow.
export interface IssueCredentialResult {
  emailDelivered: boolean;
  tempPassword?: string;
}

export interface BulkIssueResult {
  issued: number;
  failed: number;
  results: { studentId: string; name: string; outcome: "ISSUED" | "FAILED"; message?: string }[];
}

export interface PortalLecture {
  id: string;
  kind: "LECTURE" | "TEST";
  date: string;
  startTime: string;
  endTime: string;
  cancelled: boolean;
  cancelReason: string | null;
  note: string | null;
  subject: string;
  faculty: string;
  test: { id: string; title: string; totalMarks: number } | null;
  attendanceStatus: AttendanceStatus | null;
}

export interface PortalAttendanceStats {
  total: number;
  present: number;
  absent: number;
  leave: number;
  rate: number | null;
}

export interface PortalFeeSummary {
  planType: FeePlanType;
  status: string;
  totalDue: string | null;
  totalPaid: string | null;
  balance: string | null;
  nextDueDate: string | null;
  nextDueAmount: string | null;
  overdueCount: number;
}

export interface PortalDashboard {
  student: {
    name: string;
    studentCode: string;
    email: string;
    course: { name: string; code: string };
    instituteName: string;
    admissionDate: string;
  };
  attendance: PortalAttendanceStats;
  upcoming: {
    id: string;
    kind: "LECTURE" | "TEST";
    date: string;
    startTime: string;
    endTime: string;
    subject: string;
    faculty: string;
    test: { id: string; title: string; totalMarks: number } | null;
  }[];
  recentResults: {
    id: string;
    title: string;
    subject: string;
    marksObtained: string | null;
    totalMarks: number;
    enteredAt: string;
  }[];
  fees: PortalFeeSummary | null;
  unreadNotifications: number;
}

export interface PortalTimetable {
  batch: { id: string; name: string } | null;
  lectures: PortalLecture[];
  parentMeetings: PortalParentMeeting[];
}

export interface PortalTestDetail {
  id: string;
  title: string;
  subject: string;
  totalMarks: number;
  passingMarks: number | null;
  instructions: string | null;
  paperAssetUrl: string | null;
  paperAssetName: string | null;
}

export interface PortalTests {
  upcoming: {
    lectureId: string;
    date: string;
    startTime: string;
    endTime: string;
    test: PortalTestDetail;
  }[];
  results: {
    id: string;
    heldOn: string;
    enteredAt: string;
    marksObtained: string | null;
    remarks: string | null;
    test: PortalTestDetail;
  }[];
}

export interface PortalAttendance {
  stats: PortalAttendanceStats;
  records: {
    id: string;
    status: AttendanceStatus;
    date: string;
    startTime: string;
    kind: "LECTURE" | "TEST";
    subject: string;
    batch: string;
  }[];
}

export interface PortalInstallment {
  id: string;
  seq: number;
  dueDate: string;
  amount: string | null;
  paidAmount: string | null;
  outstanding: string | null;
  status: "PAID" | "OVERDUE" | "PARTIAL" | "DUE" | "WAIVED";
}

export interface PortalFees {
  summary: PortalFeeSummary | null;
  installments: PortalInstallment[];
  payments: {
    id: string;
    amount: string | null;
    mode: string;
    paidOn: string;
    receiptNumber: string;
    /// Null when the institute revoked the public link — the portal then
    /// simply shows no receipt link rather than one that would 404.
    receiptToken: string | null;
  }[];
}

export interface PortalNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface PortalNotifications {
  notifications: PortalNotification[];
  unread: number;
}

export interface PortalProfile {
  name: string;
  studentCode: string;
  email: string;
  phone: string | null;
  parentPhone: string | null;
  dob: string | null;
  fatherName: string | null;
  motherName: string | null;
  school: string | null;
  admissionDate: string;
  course: { name: string; code: string };
  institute: { name: string; phone: string | null; email: string | null; city: string | null };
  currentBatch: { name: string } | null;
}

// ---------------------------------------------------------------------------
// Self-serve payment collection (Phase 11.1)
// ---------------------------------------------------------------------------

export interface InstitutePaymentConfig {
  isEnabled: boolean;
  upiId: string | null;
  payeeName: string | null;
  instructions: string | null;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Study material (changes-phase12.md §12.5) — course-scoped, optionally
// narrowed to one subject.
// ---------------------------------------------------------------------------

export type ResourceKind = "FILE" | "LINK";

export interface StudyResource {
  id: string;
  courseId: string;
  subjectId: string | null;
  title: string;
  description: string | null;
  kind: ResourceKind;
  assetUrl: string | null;
  assetName: string | null;
  externalUrl: string | null;
  createdAt: string;
  course: { id: string; name: string; code: string };
  subject: { id: string; name: string; shortCode: string } | null;
  uploadedBy: { id: string; fullName: string };
}

/// The student's own view — no course/uploader, since it's always their own
/// course and who uploaded it isn't theirs to act on.
export interface PortalStudyResource {
  id: string;
  title: string;
  description: string | null;
  kind: ResourceKind;
  assetUrl: string | null;
  assetName: string | null;
  externalUrl: string | null;
  createdAt: string;
  subject: { id: string; name: string; shortCode: string } | null;
}

export interface StudyResourceUploadResult {
  url: string;
  name: string;
  publicId: string;
}

/// The student's own read of the config — narrower than the staff shape:
/// null in its entirety when the feature is off, and no `updatedAt` since
/// nothing on the student side cares when it was last edited.
/// No QR image — the portal generates the QR from these fields at render
/// time (changes-phase13.md §13.1).
export interface PortalPaymentConfig {
  upiId: string | null;
  payeeName: string | null;
  instructions: string | null;
}

export type PaymentProofStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface PaymentProof {
  id: string;
  amountClaimed: string;
  referenceNo: string | null;
  assetUrl: string;
  status: PaymentProofStatus;
  rejectReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
}

/// The staff-side row — includes who it's from and (once approved) the
/// receipt it produced.
export interface StaffPaymentProof extends PaymentProof {
  assetName: string;
  paymentId: string | null;
  student: { id: string; name: string; studentCode: string };
}

export interface PaymentProofUploadResult {
  url: string;
  name: string;
  publicId: string;
}

export interface ApprovePaymentProofResult {
  paymentId: string;
  carryForward: {
    direction: "shortfall" | "overpay";
    amount: string;
    entries: { installmentId: string; seq: number; dueDate: string; amount: string; created: boolean; removed: boolean }[];
  } | null;
}

// ---------------------------------------------------------------------------
// Parent-teacher meetings (Phase 11.2)
// ---------------------------------------------------------------------------

export interface ParentMeeting {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  venue: string | null;
  note: string | null;
  cancelled: boolean;
  cancelReason: string | null;
  course: { id: string; name: string; code: string };
  batch: { id: string; name: string };
}

export interface CreateParentMeetingBatch {
  batchId: string;
  date: string;
  startTime: string;
  endTime: string;
  venue?: string;
  note?: string;
}

export interface CreateParentMeetingPayload {
  title: string;
  courseId: string;
  meetings: CreateParentMeetingBatch[];
}

/// The student portal's own view of a PTM for their batch — a lighter shape
/// than the staff one, folded into the timetable response.
export interface PortalParentMeeting {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  venue: string | null;
}
