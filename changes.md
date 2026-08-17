# Changes — Phase 4 (Attendance) + Phase 5 (Fees)

> Planning doc, written before implementation per discussion. Supersedes the previous entry in
> this file (Phase 2/3's Academics + Enquiry→Admission→Students work), which is done and now
> lives only in the code (see `git log` / the routers themselves for reference). Update this doc
> as decisions change; it's a working doc, not a permanent record.

## Status: 4a (Attendance) implemented — 5a (Fees) not started

§2–§3 (Attendance schema + API) and the `/attendance` frontend are built and smoke-tested:
lecture scheduling (faculty self-resolve + role-scoped `facultyId` checks), roster derivation
from `StudentBatch` history, mixed-status marking via transactional upsert, "mark all present,"
and the daily summary endpoint — all verified end-to-end via a real faculty login (schedule →
roster → mark → re-mark → summary counts recompute correctly), plus the FACULTY-can-only-touch-
own-lectures restriction confirmed with a second faculty account (403 on mark/delete of another
faculty's lecture), plus unauthenticated/no-institute-session 401/403 checks. `tsc`/`eslint`/
`next build` all clean. §4–§6 (Fees) is planned but not started.

## 0. Scope & sequencing

Builds `developmentplan.md` §2.8–2.9. Attendance depends only on Academics (Batch, Subject,
CourseSubject) — already built. Fees depends only on Students + Course — already built. Neither
depends on the other, so they can be built and demoed independently, but Attendance goes first
because Batch/Subject rosters are the more foundational "does the data model hold up" risk.

**Both phases are being split into a staff-facing half and a student-portal half**, and only the
staff-facing half is in scope for this pass:

- **4a — Attendance (staff-facing):** lecture scheduling, roster, marking, daily summary.
- **5a — Fees (staff-facing):** fee accounts, installments, payments, receipts, reconciliation.
- **4b/5b — Student self-view ("My attendance" / "My fees")** — deferred. Reason in §1.
- **Biometric devices** — deferred, per the dev plan's own note ("follow-up sub-phase once core
  marking is solid"). Not touched here at all, not even schema.

---

## 1. Decision: student self-view is deferred to its own sub-phase

`Student` today is a pure operational record — name, contact info, course, batch history. It has
**no `User` row and no login.** "My attendance" / "My fees" require a student to authenticate,
which means either:

- provisioning a `User` (role `STUDENT`) at admission time, reusing the existing invite/temp-
  password machinery built for staff onboarding, or
- some lighter-weight unauthenticated lookup (e.g. magic link by phone) — weaker, not recommended
  for financial data.

That's a real feature (student onboarding flow, a second login surface, its own dashboard shell)
on top of Attendance/Fees themselves, not a small addition to either. Bundling it in risks a
half-built portal that's neither phase's main deliverable done well. Recommendation: ship 4a/5a
fully (staff can schedule, mark, collect fees, reconcile — the actual operational core), then do
a dedicated "Student portal" pass that adds the `User` provisioning + login + both self-view
screens together, once, instead of twice. Both `Lecture`/`AttendanceRecord` and `FeeAccount`/
`Payment` are modeled below so that self-view is a pure read layer on top with zero schema
changes when that pass happens.

---

## 2. Attendance — data model

```prisma
enum AttendanceStatus {
  PRESENT
  ABSENT
  LEAVE
  HOLIDAY
  PRESENT_BIOMETRIC // reserved now, written only once biometric devices exist
}

/// One scheduled class session. Roster is *not* stored on the lecture — it's
/// derived at read time from StudentBatch rows active on `date` (see §2 note
/// below), so a lecture never goes stale if a student is reassigned later.
model Lecture {
  id          String   @id @default(cuid())
  instituteId String
  batchId     String
  subjectId   String
  facultyId   String   // User.id, role FACULTY — required; auto-resolved to
                        // self on create if the requester is FACULTY and omits it
  date        DateTime @db.Date
  startTime   DateTime @db.Time
  endTime     DateTime @db.Time
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  institute  Institute          @relation(fields: [instituteId], references: [id], onDelete: Cascade)
  batch      Batch              @relation(fields: [batchId], references: [id])
  subject    Subject            @relation(fields: [subjectId], references: [id])
  faculty    User               @relation(fields: [facultyId], references: [id])
  attendance AttendanceRecord[]

  @@index([instituteId, date])
  @@index([batchId, date])
  @@map("lectures")
}

model AttendanceRecord {
  id         String           @id @default(cuid())
  lectureId  String
  studentId  String
  status     AttendanceStatus
  markedAt   DateTime         @default(now())
  markedById String?          // User.id who marked it (audit trail, not a relation on User)

  lecture Lecture @relation(fields: [lectureId], references: [id], onDelete: Cascade)
  student Student @relation(fields: [studentId], references: [id], onDelete: Cascade)

  @@unique([lectureId, studentId])
  @@index([studentId])
  @@map("attendance_records")
}
```

**Roster derivation (not stored):** for a given `Lecture`, the roster is every `Student` with a
`StudentBatch` row on `lecture.batchId` where `joinedAt <= lecture.date AND (leftAt IS NULL OR
leftAt >= lecture.date)`. This means a lecture scheduled for a date *before* a student joined (or
*after* they left) correctly excludes them, and past lectures keep showing the roster as it stood
on that date even after later reassignments — matches how the batch-history audit trail already
works (§2 of the previous phase's plan).

**Why `Subject` not `CourseSubject`:** a lecture is for one subject taught to one batch; the
`CourseSubject` join only exists to populate *which subjects are selectable* for the batch's
course in the scheduling form — the lecture itself just stores `subjectId` directly.

**Double-booking:** no hard DB constraint on overlapping times for the same faculty/batch — flag
it as a soft warning in the API response (`conflicts: Lecture[]`) rather than a blocking error,
since real institutes do have legitimate overlapping-adjacent sessions (a faculty finishing one
batch's lecture as another starts). Keeps the schema simple and avoids modeling "how much overlap
is acceptable."

`Institute` gains `lectures Lecture[]` for the same back-relation-array consistency as before.

---

## 3. Attendance — API surface

**`attendance.ts`** → mounted at `/attendance`, `requireModule("ATTENDANCE")`.

- `GET /lectures?date=&batchId=` — schedule view. Schedule role: `OWNER, ADMIN, RECEPTION,
  FACULTY` (FACULTY sees all, not just their own, for schedule *visibility* — marking is what's
  restricted).
- `POST /lectures` — `OWNER, ADMIN, RECEPTION, FACULTY`. Body: `batchId, subjectId, date,
  startTime, endTime, facultyId?`. If requester is `FACULTY` and omits `facultyId`, auto-resolves
  to self; if requester is `FACULTY` and supplies a *different* `facultyId`, reject (403) — a
  faculty member can only schedule their own lectures, per the dev plan's phrasing.
- `PATCH /lectures/:id`, `DELETE /lectures/:id` — same role shape as create; a faculty member may
  only touch lectures where `facultyId === self`.
- `GET /lectures/:id/roster` — derived roster (§2) joined with any existing `AttendanceRecord`
  for that lecture, so the marking screen shows current state, not blank.
- `POST /lectures/:id/mark` — body: `{ records: [{ studentId, status }] }`, one transaction,
  `attendanceRecord.upsert` per student (same upsert-in-a-loop-inside-`$transaction` pattern as
  the batch-reassignment endpoint). Roles: `OWNER, ADMIN, RECEPTION` freely; `FACULTY` only if
  `lecture.facultyId === self`.
- `POST /lectures/:id/mark-all-present` — shortcut, same transaction/role shape, sets every
  unmarked roster student to `PRESENT` (does not overwrite already-marked records).
- `GET /summary?date=` — daily summary: every lecture that date with
  `{ expected, present, absent, leave, holiday, unmarked }` counts. Roles: `OWNER, ADMIN,
  RECEPTION, FACULTY` (own lectures highlighted, not filtered — a coordinator needs the whole
  day).

No student-facing routes in this pass (§1).

---

## 4. Fees — data model

```prisma
enum PaymentMode {
  UPI
  CASH
  CARD
  BANK_TRANSFER
  CHEQUE
}

/// One per student. `finalFee` is stored (not computed on read) so a later
/// change to `Course.defaultFee` never silently reprices an existing
/// student's account.
model FeeAccount {
  id               String   @id @default(cuid())
  instituteId      String
  studentId        String   @unique
  courseFee        Decimal  @db.Decimal(10, 2)
  discount         Decimal  @default(0) @db.Decimal(10, 2)
  finalFee         Decimal  @db.Decimal(10, 2) // courseFee - discount, snapshotted at creation
  installmentCount Int
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  institute    Institute        @relation(fields: [instituteId], references: [id], onDelete: Cascade)
  student      Student          @relation(fields: [studentId], references: [id], onDelete: Cascade)
  installments FeeInstallment[]

  @@index([instituteId])
  @@map("fee_accounts")
}

/// Status is *derived*, not stored (see §5) — this table stores only the
/// facts (amount owed, amount paid), never a status enum that could drift
/// out of sync with the payments that are supposed to justify it.
model FeeInstallment {
  id           String   @id @default(cuid())
  feeAccountId String
  seq          Int      // 1-indexed, installment order
  dueDate      DateTime @db.Date
  amount       Decimal  @db.Decimal(10, 2)
  paidAmount   Decimal  @default(0) @db.Decimal(10, 2)
  waived       Boolean  @default(false) // manual override — treated as fully settled regardless of paidAmount
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  feeAccount FeeAccount @relation(fields: [feeAccountId], references: [id], onDelete: Cascade)
  payments   Payment[]

  @@unique([feeAccountId, seq])
  @@map("fee_installments")
}

model Payment {
  id              String      @id @default(cuid())
  instituteId     String
  installmentId   String
  amount          Decimal     @db.Decimal(10, 2)
  mode            PaymentMode
  paidOn          DateTime    @db.Date
  receiptNumber   String      @unique
  notes           String?
  createdByUserId String?
  createdAt       DateTime    @default(now())

  institute   Institute      @relation(fields: [instituteId], references: [id], onDelete: Cascade)
  installment FeeInstallment @relation(fields: [installmentId], references: [id])

  @@index([instituteId])
  @@index([installmentId])
  @@map("payments")
}

/// Same atomic-upsert pattern as StudentCodeCounter — one gapless sequence
/// per (institute, year+month), used to generate Payment.receiptNumber.
model ReceiptCounter {
  id          String @id @default(cuid())
  instituteId String
  yearMonth   String // "YYMM", e.g. "2608"
  seq         Int    @default(0)

  @@unique([instituteId, yearMonth])
  @@map("receipt_counters")
}
```

`Course` gains one new optional field, `defaultFee Decimal? @db.Decimal(10, 2)` — pre-fills
`courseFee` when creating a `FeeAccount` for a student in that course, editable per-student
before saving (a student can get a discount or a different fee entirely; the course value is
just a sane default, matching how `durationMonths` already works as a template value on `Batch`
creation).

`Institute` gains `feeAccounts FeeAccount[]`, `payments Payment[]`.

**Installment generation:** `finalFee` split into `installmentCount` equal installments, monthly
spacing from a chosen start date, **last installment absorbs the rounding remainder** (e.g.
₹10,000 ÷ 3 → ₹3,333.33, ₹3,333.33, ₹3,333.34) — exactly as specified.

---

## 5. Fees — reconciliation & status (key decision, flagged for confirmation)

The dev plan lists installment status as `PENDING/PARTIAL/PAID/OVERDUE`. Three of those
(`PENDING/PARTIAL/PAID`) are pure functions of `paidAmount` vs `amount` — event-driven, correctly
recomputed the moment a payment lands. `OVERDUE` is different: it becomes true purely because
*time passed* past `dueDate`, with no payment event to trigger a recompute. Storing it as a
persisted enum means either a cron job sweeping every installment nightly, or a status that's
wrong until someone happens to view/touch that record.

**Recommendation:** don't store status at all. `FeeInstallment` stores only the facts
(`amount`, `paidAmount`, `waived`); the API computes `status` on every read:

```ts
function installmentStatus(inst: FeeInstallment, today: Date): InstallmentStatus {
  if (inst.waived || inst.paidAmount >= inst.amount) return "PAID";
  if (inst.paidAmount > 0) return inst.dueDate < today ? "OVERDUE" : "PARTIAL";
  return inst.dueDate < today ? "OVERDUE" : "PENDING";
}
```

This is the same "single source of truth, derive the view" instinct already used for
`enrolledCount`/`lectureCount` on `Batch` and installment counts here — nothing to keep in sync,
nothing that can go stale. Flagging this explicitly since it's a deviation from the literal enum
list in the dev plan (in spirit, not in the resulting API shape — `GET` responses still return
one of exactly those four strings).

**Reconciliation on payment:** `POST /payments` runs in one `$transaction`: create the `Payment`
row (with a `ReceiptCounter`-generated `receiptNumber`), then `installment.paidAmount = {
increment: amount }`. No separate "recompute" step needed since paidAmount is now itself the
reconciled fact and status is derived from it on every read, per above.

**Auto-target selection:** if `installmentId` is omitted from the payment body, resolve to the
student's earliest installment where `paidAmount < amount` (i.e. not yet fully paid), ordered by
`seq`. Reject if all installments are already paid.

---

## 6. Fees — API surface

**`fees.ts`** → mounted at `/fees`, `requireModule("FEES")`.

- `POST /accounts` — create a `FeeAccount` for a student (one-time; 409 if one already exists).
  Body: `studentId, courseFee?, discount?, installmentCount, firstDueDate`. `courseFee` defaults
  to `Course.defaultFee` if omitted. Roles: `OWNER, ADMIN, RECEPTION`.
- `GET /accounts/:studentId` — account + installments (with derived `status`) + payment history.
  Roles: `OWNER, ADMIN, RECEPTION` (student self-view deferred, §1).
- `PATCH /accounts/:studentId` — adjust `discount` (recomputes `finalFee`, does **not**
  retroactively change already-generated installment amounts — a discount applied after
  installments exist only affects a manual regeneration, out of scope here; MVP: discount is only
  editable before installments exist, i.e. same call as creation, not a later edit path this
  pass).
- `POST /accounts/:studentId/installments/:id/waive` — manual override (§5). Roles: `OWNER,
  ADMIN`.
- `POST /payments` — body: `studentId, amount, mode, paidOn, installmentId?, notes?`. The
  transactional record-and-reconcile flow (§5). Roles: `OWNER, ADMIN, RECEPTION`.
- `GET /payments?studentId=&from=&to=` — payment history / receipt list, filterable. Same roles.
- `GET /payments/:id/receipt` — receipt detail (student, installment, amount, mode, receipt
  number, date) — the frontend renders this as a printable/downloadable view; no PDF generation
  in this pass (matches "no PDF anywhere yet" being true of the rest of the app today).

No student-facing routes in this pass (§1).

---

## 7. Frontend (new)

Two new top-level routes, same pattern as `/academics`/`/students`:

- **`/attendance`** — date-picker-driven day view: list of that day's lectures (batch, subject,
  faculty, time, expected/marked counts) → click a lecture opens the roster marking screen
  (per-student Present/Absent/Leave/Holiday toggle group, "Mark all present" button, save).
  Separate "Schedule lecture" modal (batch → subject dropdown filtered to
  `CourseSubject` for that batch's course, exactly the pattern already built for
  Batches-filtered-by-course). Daily summary as a `StatCard` row at the top (today's lecture
  count, total expected, total present, total absent).
- **`/fees`** — student-search-first layout (fees are always viewed per-student, unlike
  Attendance's date-first view): search picks a student → shows their fee account (or a
  "Set up fee account" empty state if none exists) → installment list with derived status badges
  → "Record payment" modal → receipt list below. `StatCard` row: total collected this month,
  pending amount across all students, overdue count.

Both reuse existing primitives throughout (`StatCard`, `Modal`, `Dropdown`, `Badge`, `Button`,
`ConfirmModal`), same as every module so far — no new UI primitives needed except a small
`ToggleGroup`-style multi-state control for attendance status (Present/Absent/Leave/Holiday isn't
a boolean `Toggle`, needs its own small component).

`navigation.ts` gets two new nav items, both `module`-gated (`ATTENDANCE`, `FEES`), roles per
§3/§6 above (`OWNER/ADMIN/RECEPTION/FACULTY` for Attendance nav visibility, `OWNER/ADMIN/
RECEPTION` for Fees).

---

## Build order

1. Schema: `Lecture`/`AttendanceRecord` + `Course.defaultFee`/`FeeAccount`/`FeeInstallment`/
   `Payment`/`ReceiptCounter` in one `prisma db push` (additive, no destructive changes to
   existing tables).
2. `services/receiptNumber.ts` (mirrors `services/studentCode.ts` exactly — same atomic-upsert
   shape, just keyed on year+month instead of year+courseCode).
3. `attendance.ts` router + `/attendance` frontend — demoable alone (only needs Batch/Subject,
   already built).
4. `fees.ts` router + `/fees` frontend — demoable alone (only needs Student/Course).
5. `navigation.ts` + `Sidebar` gating for both, wired last.
6. Type-check + lint pass on both sides after each numbered step.
7. Smoke-test end-to-end per module (schedule → roster → mark → summary; create account →
   generate installments → pay → reconcile → check status flips), plus cross-institute isolation
   checks, same rigor as Phase 2/3.

Explicitly **not** in this pass: biometric devices, student self-view/portal login (§1), payroll
integration with attendance (Phase 6, `PER_LECTURE` salary type reads validated lecture counts —
noted here only so Attendance's data shape is reviewed with that future consumer in mind; nothing
about the schema above blocks it).

---

# Addendum — Faculty teaching assignments + scheduling UX (planned, not yet built)

> Written before implementation per discussion, same as the sections above. Triggered by
> feedback after using the built Attendance module: with no notion of "which faculty teaches
> what," `ScheduleLectureModal` makes every OWNER/ADMIN/RECEPTION user pick course → batch →
> subject → faculty from full unfiltered lists every time, and a faculty member scheduling their
> own lecture sees every course/subject in the institute, not just the ones they actually teach.

## 1. Data model: `FacultyAssignment`

A new join table linking a `User` (role `FACULTY`) to a `Course`, optionally narrowed to specific
`Subject`s within that course:

```prisma
/// Which courses (and optionally which specific subjects within them) a
/// faculty member is eligible to teach. A course with no subject-scoped
/// rows means "all of that course's linked subjects" — the common case
/// (most faculty teach every subject of the one course they're assigned).
model FacultyAssignment {
  id        String  @id @default(cuid())
  facultyId String
  courseId  String
  subjectId String? // null = unrestricted (all of the course's subjects)

  faculty User     @relation(fields: [facultyId], references: [id], onDelete: Cascade)
  course  Course   @relation(fields: [courseId], references: [id], onDelete: Cascade)
  subject Subject? @relation(fields: [subjectId], references: [id], onDelete: Cascade)

  @@index([facultyId])
  @@index([courseId])
  @@map("faculty_assignments")
}
```

No DB-level uniqueness on `[facultyId, courseId, subjectId]` — Postgres treats every `NULL` as
distinct, so it can't stop two "all subjects" rows for the same (faculty, course) pair on its
own. Instead the API always **replaces the full set** for a faculty member in one transaction
(delete-then-recreate), the same pattern already used for `Subject.courseIds` in
`academics.ts` — so duplicates are structurally impossible from normal use, not just discouraged.

**Encoding on the wire:** `PUT` body is `{ assignments: { courseId, subjectIds }[] }` where
`subjectIds: []` means "all subjects of this course" and a non-empty array means "only these."
Never `null` over JSON — avoids a null/undefined/empty-array three-way ambiguity client-side.

## 2. API surface (additions to `attendance.ts`)

- `GET /attendance/faculty/:id/assignments` — OWNER/ADMIN, or the faculty member themself
  (`id === req.user.id`). Returns `{ course: CourseRef; allSubjects: boolean; subjects: SubjectRef[] }[]`
  — `subjects` is the resolved list either way (either every subject linked to that course via
  `CourseSubject`, when `allSubjects` is true, or just the assigned ones), so the frontend never
  has to cross-reference `CourseSubject` itself.
- `PUT /attendance/faculty/:id/assignments` — OWNER/ADMIN only. Body per §1. Validates every
  `courseId`/`subjectId` belongs to the institute and that each `subjectId` is actually linked to
  its `courseId` via `CourseSubject` before writing.
- `GET /attendance/faculty?courseId=` — **extends** the existing endpoint (currently returns every
  active FACULTY at the institute) with an optional `courseId` filter: when present, only faculty
  with a `FacultyAssignment` row for that course. Powers the staff scheduling flow's course-first
  path (§4).
- `POST /attendance/lectures` / `PATCH /attendance/lectures/:id` — **new server-side check**: when
  the requester is FACULTY, the chosen `courseId` must have a `FacultyAssignment` row for them,
  and if any subject-scoped rows exist for that (faculty, course) pair, `subjectId` must be one of
  them. This is enforcement, not just a UI filter — mirrors the existing
  `assertCanActOnLecture` pattern (defense in depth, same reasoning as the roster-view guard added
  after the last round of feedback). OWNER/ADMIN/RECEPTION scheduling on a faculty's behalf are
  **not** restricted by that faculty's assignments — an admin can always override.

## 3. Settings UI — assigning faculty to courses/subjects

New action on each FACULTY row in **Settings → Team** (`TeamTab.tsx`): "Assign courses" opens a
`FacultyAssignmentModal` — a checklist of the institute's courses; checking one reveals an inline
sub-checklist of that course's linked subjects (via the same `courses[].subjects` shape already
used in `SubjectModal`'s course picker), left entirely unchecked by default (= "all subjects").
Checking specific subjects narrows it. Saves the whole set via `PUT .../assignments` in one call,
same "replace the full set" semantics as the Subjects tab's course-linking already has.

## 4. Scheduling UX — mutual filtering + auto-fill

Today `ScheduleLectureModal` is a strict linear cascade: Course → Batch/Subject → (Faculty, if not
self). The request is for two different entry points that meet in the middle:

- **Faculty-first** (the common case called out explicitly: "if a faculty has one course and one
  subject, I just pick the faculty and everything else fills in"): picking a faculty narrows the
  Course dropdown to their assigned courses; if that's exactly one, it's auto-filled (shown as a
  read-only chip, not a dropdown the admin has to click through). Once a course is resolved
  (auto or manual), Subject narrows to that faculty's allowed subjects for that course — same
  auto-fill-if-singleton behavior. Batch narrows to that course's batches — auto-fill if the
  course only has one, dropdown if it has several. **Batch auto-fill is independent of faculty**,
  purely a function of the course's batch count, exactly as asked.
- **Course-first** (still needed — e.g. reception building out a whole day's schedule for one
  batch and not thinking faculty-first): picking a course first narrows the *Faculty* dropdown to
  `GET /attendance/faculty?courseId=` results instead. No forced auto-fill in this direction
  (course→single-faculty auto-fill would be a surprise reassignment of intent — the admin
  explicitly chose to browse by course), but the option list itself is already pre-filtered so
  there's minimal extra picking either way.
- Whichever of {faculty, course} is picked *second* only offers options consistent with the
  first, not a free-standing full list — so it's not possible to end up in an inconsistent
  combination the backend would then reject.
- Self-scheduling (FACULTY role) keeps today's implicit "faculty = self" but now also gets the
  same course/subject/batch auto-fill cascade, driven by `GET /attendance/faculty/:id/assignments`
  called with their own id — so a single-course single-subject faculty member sees a form that's
  already 3/4 filled in before they touch anything.

### Component-level plan for `ScheduleLectureModal.tsx`

- Fetch faculty list unfiltered (staff) or self-assignments only (faculty) on open, as today.
- New state: `facultyAssignments: Map<facultyId, AssignmentSummary[]>` — lazily fetched per
  faculty on selection (staff flow) or eagerly for self (faculty flow), not all-at-once for every
  faculty in the institute (avoids an N+1 fetch on modal open).
- Derive `availableCourses`, `availableSubjects`, `availableBatches` from whichever of
  faculty/course was set first, recomputing auto-fill on every dependency change — same shape as
  the existing `courseId → batches` `useEffect` already in the component, just with one more
  branch for the faculty-driven path.
- Auto-filled fields render as a disabled/read-only `Dropdown` (still a `Dropdown`, just
  `disabled` with the single option pre-selected) rather than a different control, so the visual
  language stays consistent and an admin can always see *what* got auto-filled, not just that a
  field is missing.

## 5. Open items to confirm before building

Flagged rather than assumed, since each is a real product call:

1. **Backend enforcement for FACULTY scheduling** (§2, last bullet) — confirmed as wanted (matches
   the project's existing defense-in-depth pattern), not asking again.
2. **Course-first UX when the picked course isn't taught by the faculty being changed to** — if an
   admin has already picked a course, then picks a faculty who *doesn't* teach it (filtered list
   should prevent this, but the two dropdowns are still two independent pieces of state) — the
   plan above prevents this by construction (course-first always filters faculty options, never
   lets an invalid faculty into the list), so no separate error state is needed.
3. **What happens to already-scheduled lectures if a faculty's assignment is later narrowed** —
   e.g. an admin removes a course from a faculty's assignment after lectures already exist for
   it. Recommendation: do nothing retroactively — existing `Lecture` rows are untouched (they're
   historical fact), the assignment only gates *new* scheduling/edits going forward. No migration
   or cleanup needed.

---

# Addendum — WhatsApp copy-message + lecture notes (planned, not yet built)

> Written before implementation per discussion. Triggered by a real operational pain point: staff
> currently retype a lecture-scheduled or attendance-marked update by hand every time they post it
> to a WhatsApp group. Deliberately **not** a WhatsApp API integration (no Business API approval,
> no per-message cost, no vendor dependency) — the whole feature is "generate the right text,
> let the user copy it and paste it themselves." Confirmed in discussion: attendance messages
> include actual absent/late student names (not just counts — counts alone aren't actionable for
> a parent group), and the copy option only appears once the *entire* roster is marked, not
> partial.

## 1. Data model

```prisma
enum MessageTemplateType {
  LECTURE_SCHEDULED
  ATTENDANCE_MARKED
}

/// One row per (institute, type). Missing row = fall back to a built-in
/// default string, so institutes that never touch Settings still get a
/// usable message — nothing breaks for the common case of never customizing.
model MessageTemplate {
  id          String              @id @default(cuid())
  instituteId String
  type        MessageTemplateType
  body        String              // free text with {{placeholder}} tokens

  institute Institute @relation(fields: [instituteId], references: [id], onDelete: Cascade)

  @@unique([instituteId, type])
  @@map("message_templates")
}
```

`Lecture` gains one new field: `note String?` — optional, settable at schedule/edit time. Stored
now specifically so it's already present with zero migration debt once student self-view exists
later (mirrors how the rest of Attendance was built with that future consumer in mind without
building it prematurely).

## 2. Placeholders

Interpolation is **client-side** — no new per-action endpoint. The relevant modal already has the
lecture/roster data in memory; it just needs the (possibly customized) template text, fetched
once. A shared `formatRelativeDate()` helper renders "Today, 16 Aug" / "Tomorrow, 17 Aug" /
"Mon, 18 Aug 2026" consistently across both templates.

- **`LECTURE_SCHEDULED`**: `{{course}} {{batch}} {{subject}} {{faculty}} {{date}} {{startTime}}
  {{endTime}} {{note}}`
- **`ATTENDANCE_MARKED`**: `{{course}} {{batch}} {{subject}} {{date}} {{presentCount}}
  {{absentCount}} {{lateCount}} {{leaveCount}} {{totalCount}} {{absentNames}} {{lateNames}}
  {{note}}` — `{{absentNames}}`/`{{lateNames}}` are comma-joined student names (present/on-time
  students aren't named individually, just counted — keeps the message short and focuses on what
  actually needs a parent's attention).

Rendering is a plain `{{key}}` string replace — no templating engine dependency needed.

## 3. Backend

- `Lecture` create/update schemas gain optional `note`.
- **`org.ts`** gains `GET /org/message-templates` (both types, resolved — custom body if set, else
  the built-in default so the frontend never has to know about the fallback logic) and
  `PUT /org/message-templates/:type` (OWNER/ADMIN only, body `{ body: string }`).
- No changes to the actual lecture/mark endpoints beyond accepting `note` — the message itself is
  never computed or stored server-side, only its ingredients (lecture/roster data, already
  returned) and the template text.

## 4. Frontend

- **`ScheduleLectureModal`**: new optional "Note" field. On successful submit, the modal doesn't
  just close — it switches to a success state: rendered message in a read-only preview box, a
  "Copy message" button (`navigator.clipboard.writeText`, no dependency), and "Done."
- **`MarkAttendanceModal`**: same success-state pattern, but only triggers when the save (via
  "Save attendance" or "Mark all present") results in the *entire* roster being marked — confirmed
  above, no partial-roster copy option.
- **Settings → Message templates** (new admin-only tab, same access pattern as Team/other admin
  settings): two textareas (Lecture scheduled, Attendance marked), a placeholder legend, and a
  live preview rendered against sample data — save via the `PUT` endpoint above.
- Shared `lib/messageTemplates.ts`: `DEFAULT_LECTURE_TEMPLATE`, `DEFAULT_ATTENDANCE_TEMPLATE`,
  `renderTemplate(body, vars)`, `formatRelativeDate(iso)` — used by both modals and the Settings
  preview, so there's exactly one rendering implementation, not three copies of the same logic.

## Build order

1. Schema: `Lecture.note` + `MessageTemplate` (additive, no destructive changes).
2. `lib/messageTemplates.ts` (frontend) — pure functions, easiest to get right in isolation before
   wiring into modals.
3. Backend: `note` on lecture create/update, `GET`/`PUT /org/message-templates`.
4. Settings → Message templates tab.
5. Wire the copy-message success state into `ScheduleLectureModal`, then `MarkAttendanceModal`
   (and `EditLectureModal` gets the note field too, for consistency, even though editing timing
   doesn't itself trigger a new copy prompt).
6. Type-check + lint pass, then a manual pass through both flows (schedule → copy, mark full
   roster → copy, mark partial roster → no copy prompt, edit a template in Settings → confirm the
   next generated message reflects it).

---

# Addendum — Fees (Phase 5), full plan (planned, not yet built)

> Written before implementation per discussion. Supersedes/extends §4–§6 above with three
> decisions confirmed in discussion: (1) support both a fixed-installment plan **and** an
> open-ended recurring-monthly plan, since not every course is "one total fee split N ways" —
> some batches are billed month-to-month for as long as the student stays enrolled; (2)
> rescheduling one installment's due date shifts **only that installment**, later ones keep their
> original dates (simplest, matches how a one-off late payment is actually handled in practice —
> cascading reschedule is not built now, flagged as a possible future toggle if it turns out to be
> needed); (3) "billing for each installment paid" means every receipt records *which staff user*
> recorded the payment — this is an accountability/audit feature, not faculty payroll (payroll
> tied to fees collected, if ever wanted, is Phase 6 territory and out of scope here).

## 1. Fee plan types

```prisma
enum FeePlanType {
  ONE_TIME   // fixed total, split into N installments (original §4 design)
  RECURRING  // open-ended monthly billing, no fixed total or end date
}

enum FeeAccountStatus {
  ACTIVE
  CLOSED // student left / course completed — stops future installment generation
}
```

`FeeAccount` gains `planType FeePlanType` and `status FeeAccountStatus @default(ACTIVE)`.

- **`ONE_TIME`** — unchanged from §4: `courseFee`, `discount`, `finalFee`, `installmentCount` are
  all required, all `FeeInstallment` rows generated up front at account creation.
- **`RECURRING`** — `courseFee`/`discount`/`finalFee`/`installmentCount` are all nullable on the
  account (not applicable); instead the account stores `monthlyAmount Decimal` and `billingDay
  Int` (1–28, day-of-month a new installment's `dueDate` lands on — capped at 28 to avoid
  Feb/30-day-month edge cases). Installments are **not** all generated up front — there's no
  fixed end. Instead:
  - On account creation, generate the first 3 months of installments (this month + next 2) —
    enough for the UI to show a plan without generating years of rows for a student who might
    leave next month.
  - A lightweight **rolling-window job**, run lazily on `GET /accounts/:studentId` (not a cron —
    matches the project's existing "derive/backfill on read" instinct used for installment
    status, §5): if the account is `ACTIVE` and has fewer than 2 future unpaid/upcoming
    installments, generate the next one (`seq = max(seq) + 1`, `dueDate` = next occurrence of
    `billingDay` after the last existing installment's due date). Keeps the plan always showing
    "next 2–3 months" without ever needing a background scheduler.
  - Closing the account (`status = CLOSED`, e.g. student withdraws) stops generation; existing
    installments (paid or not) are untouched — historical fact, same principle as Attendance's
    `Lecture` rows surviving a later `FacultyAssignment` change.

`Course` gains a second optional default field for symmetry with the existing `defaultFee`:
`defaultMonthlyFee Decimal? @db.Decimal(10, 2)` — pre-fills `monthlyAmount` when creating a
`RECURRING` account for a student in that course, same "template value, editable per student"
pattern as `defaultFee`/`durationMonths` elsewhere.

`POST /fees/accounts` body becomes a discriminated shape: `{ studentId, planType, ...}` where
`ONE_TIME` requires `courseFee?, discount?, installmentCount, firstDueDate` (as before) and
`RECURRING` requires `monthlyAmount?, billingDay, startDate` (`monthlyAmount` defaults to
`Course.defaultMonthlyFee` if omitted, mirroring `courseFee`'s default).

## 2. Installment rescheduling

New endpoint: `PATCH /fees/accounts/:studentId/installments/:id/reschedule` — body `{ dueDate }`.
Roles: `OWNER, ADMIN, RECEPTION`. Confirmed behavior: **only the targeted installment's `dueDate`
changes**; every other installment (earlier and later) is untouched. No cascading shift.

- Rejects if the installment is already `PAID` or `waived` (nothing to reschedule — a settled
  installment's due date is a closed historical fact; if the *amount* needs correcting after
  settlement, that's a different problem, see §6 refunds/void below).
- `FeeInstallment` gains `originalDueDate DateTime? @db.Date` — set once, on the *first*
  reschedule only (`null` means "never rescheduled"), so the UI can show "Rescheduled from 5 Sep"
  without needing a separate history table for what's expected to be a rare, single-shot edit per
  installment.
- No re-validation against neighboring installments' dates — an admin can legitimately move
  installment 2's due date past installment 3's (e.g. a genuine hardship case), the UI just sorts
  by `seq` (plan order), not by `dueDate`, so the list stays coherent either way.

## 3. Payment allocation & overpayment

Confirmed scope for this pass, kept deliberately simple:

- A payment always targets exactly one installment (explicit `installmentId`, or auto-resolved to
  the earliest non-fully-paid one, per §5's original design — unchanged).
- **No auto-spillover across installments.** If a payment amount would exceed that installment's
  outstanding balance, it's still accepted (small overpayments happen — rounding, a parent paying
  a bit extra) and simply pushes `paidAmount` above `amount`, which the status function (§5,
  unchanged) already treats as `PAID`. There's no mechanism to auto-apply the excess to the *next*
  installment — if a payer wants to pay two installments at once, that's two `POST /payments`
  calls (one per installment), which also keeps each receipt tied to exactly one installment,
  matching how a physical receipt book works. Flagged as the deliberately simple MVP behavior;
  auto-spillover / "pay any amount, auto-allocate across the plan" is a real future enhancement if
  it turns out staff want it, not built now.

## 4. Voiding a payment (not deleting)

Payments are financial records — hard-deleting one breaks the receipt-number sequence's meaning
(a gap that isn't a cancelled receipt looks like data loss) and silently changes `paidAmount`
history with no trace. Instead:

```prisma
model Payment {
  // ...existing fields from §4 above...
  voidedAt        DateTime?
  voidReason       String?
  voidedByUserId   String?
}
```

- `POST /fees/payments/:id/void` — body `{ reason }`. Roles: `OWNER, ADMIN` only (stricter than
  recording a payment — voiding is a correction of the record, not routine data entry). One
  `$transaction`: decrements the installment's `paidAmount` by the voided payment's `amount`
  (clamped at 0 as a safety floor), sets `voidedAt`/`voidReason`/`voidedByUserId` on the payment.
  The row stays forever — receipt number, original amount, everything — just excluded from
  "active" payment totals and visually struck through / badged "Voided" in the UI.
- `installmentStatus()` (§5) and every sum (`GET /accounts/:studentId`, dashboard stat cards)
  filters `voidedAt: null` — a voided payment contributes nothing to balances, exactly as if it
  had been deleted, but the audit trail survives.
- Receipts for voided payments still resolve (`GET /payments/:id/receipt`) so the paper trail is
  inspectable, clearly marked "VOID" if printed/viewed after the fact.

## 5. Discount edits after installments exist

§4's original MVP restriction (discount only editable at creation time, before installments
exist) is confirmed as staying for this pass — genuinely a separate feature ("apply a discount
mid-plan and reflow remaining installments") with its own design questions (does it reduce future
installments only, or retroactively re-split the whole remaining balance?) that don't need
answering to ship the core module. Noted here so it isn't silently forgotten, not because it's
being built now.

## 6. Overdue handling — what actually happens when `OVERDUE`

§5's `installmentStatus()` already computes `OVERDUE` correctly on every read. This pass adds the
operational surface that makes that status actually useful day-to-day, rather than just a badge:

- `GET /fees/overdue?asOf=` — every `OVERDUE` installment across the institute, joined with
  student name/contact, sorted by days-overdue descending. Roles: `OWNER, ADMIN, RECEPTION`.
  Powers a "Defaulters" view/tab on `/fees` — the thing a reception desk actually works off of
  every morning, not just a per-student detail page nobody opens until a parent calls.
- No automated late-fee charge, no automated reminder message in this pass — flagged as a natural
  next candidate for the WhatsApp copy-message pattern (already used for lecture-scheduled/
  cancelled/attendance-marked) once this view exists: a "Copy reminder" button per overdue row
  generating a payment-reminder message, same client-side-template approach as the existing
  addendum. Not built now — the dev plan itself names "fee-payment-received" style messages as a
  deferred candidate (see `handoff.md` §5) and this extends that list with "fee-overdue-reminder"
  rather than committing to build it this pass.

## 7. Receipts — numbering, void marking, still no PDF

Unchanged from §4/§6: `RCT-YYMM-SEQ` per institute via `ReceiptCounter`, receipt detail endpoint
renders a printable/downloadable view client-side, no server-side PDF generation (consistent with
the rest of the app). One addition: the receipt view surfaces `createdByUserId` (resolved to a
staff name) prominently — "Recorded by {{staffName}} on {{date}}" — directly answering the
"billing for each installment paid" ask from a plain accountability angle (§ intro).

## 8. Frontend additions (extends §7's original `/fees` plan)

- **Fee account creation**: a plan-type toggle (One-time plan / Monthly recurring) at the top of
  "Set up fee account" — switches the form between the §4 fixed-installment fields and the §1
  recurring fields (`monthlyAmount`, `billingDay`, `startDate`).
- **Installment list**: each row gets a "Reschedule" action (small date-picker popover, not a full
  modal — it's a single-field edit) next to the existing status badge; a rescheduled row shows a
  small "was 5 Sep" strikethrough hint using `originalDueDate`.
- **Payment row / receipt list**: voided payments render struck-through with a "Voided" badge and
  the void reason on hover/expand; a "Void" action (OWNER/ADMIN only, per §4) opens a small
  reason-required confirm, same pattern as `CancelLectureModal`'s reason-required cancel.
- **New "Defaulters" tab** on `/fees` (alongside the existing student-search-first view): the
  `GET /fees/overdue` list, StatCard row (total overdue amount, overdue installment count, count
  of distinct students affected), each row linking straight into that student's fee account.
- **Recurring accounts** show their installment list the same way as one-time ones (both are just
  `FeeInstallment[]` under the hood) — the only visual difference is there's no fixed "N of N"
  count, just an open-ended list that grows as the rolling-window job (§1) adds to it, plus a
  "Close account" action (sets `status = CLOSED`, confirm-required, same `ConfirmModal` pattern
  used everywhere else) for when a student leaves a month-to-month course.

## 9. What's explicitly still out of scope this pass

Named directly so it isn't ambiguous later:

- **Late fees / penalty amounts** — no automatic surcharge for overdue installments. §6's
  Defaulters view is the operational tool for now; if late fees are wanted later, likely shape is
  a `lateFeePolicy` on `Course` plus a computed (not stored) surcharge added to `OVERDUE`
  installments' effective amount — deliberately not designed further here.
- **Refunds** — no refund/negative-payment flow. A wrongly-recorded payment is corrected via void
  (§4) + a fresh correct payment, not a refund transaction.
- **Cascading reschedule** — confirmed single-installment-only for this pass (§2); a "shift this
  and everything after it" toggle is a small addition later if it turns out to be wanted, not
  built speculatively now.
- **Retroactive discount re-split** — §5.
- **Auto-spillover payment allocation across installments** — §3.
- **Student self-view ("My fees")** — still deferred to the dedicated student-portal pass, §1
  above; nothing in this addendum changes that plan, `RECURRING` accounts are modeled the same
  read-layer-on-top way.
- **Faculty payroll tied to fees collected** — Phase 6 territory, not this module (confirmed in
  discussion, § intro).

## Build order (this addendum, layered onto §"Build order" above)

1. Schema: `FeePlanType`/`FeeAccountStatus` enums, `FeeAccount.planType/status/monthlyAmount/
   billingDay`, `FeeInstallment.originalDueDate`, `Payment.voidedAt/voidReason/voidedByUserId`,
   `Course.defaultMonthlyFee` — additive, layers onto §4's original schema before the first
   `prisma db push` for this phase (i.e. build the full schema, including this addendum, in one
   migration rather than two).
2. `fees.ts` router: account creation (both plan types), installment generation (fixed-N and
   rolling-window-lazy), reschedule, payments (record/auto-target/void), overdue list, receipt
   detail — per §1–§7.
3. `/fees` frontend: plan-type-aware account creation, installment list with reschedule + status
   badges, payment recording + void, Defaulters tab, receipt view with recorder attribution — §8.
4. `navigation.ts`/`Sidebar` gating — unchanged from §7's original plan (`FEES` module,
   `OWNER/ADMIN/RECEPTION`).
5. Type-check + lint pass on both sides.
6. Smoke-test: create a `ONE_TIME` account → generate installments → pay partially → pay fully →
   status flips to `PAID`; create a `RECURRING` account → confirm 3 months generate → advance past
   them (or manually insert a past `dueDate`) → confirm the rolling-window job tops back up to 2
   future installments on next `GET`; reschedule an installment → confirm only that one moves;
   record a payment → void it → confirm balances reverse and the row survives with a `Voided`
   badge; hit `GET /fees/overdue` → confirm correct sort/filter; cross-institute isolation checks,
   same rigor as every prior phase.

---

# Addendum — Phase 6 (Staff + Payroll) + Phase 7 §2.10 Expenses (planned, not yet built)

> Written before implementation per discussion. Scope for this pass, per discussion: **Staff +
> Payroll first, Expenses second, Ledger deferred** — `2.10`'s "Combined Ledger view with CSV
> export" is explicitly out of scope here even though the schema below lays a `FinanceEntry` table
> that pass will read from. Triggered by a detailed walkthrough of how payroll actually needs to
> feel day-to-day: pay a faculty member for a month by looking at their individual lectures and
> deselecting the ones you don't want to pay yet; pay across several months at once, each shown as
> a collapsible group; hand it a lump sum and let it auto-apply oldest-first, carrying any
> shortfall forward as a normal outstanding balance and any *excess* forward as a credit that
> automatically absorbs future dues; support both lecture-rate and flat-monthly faculty under the
> same mechanism; and support people who draw a salary but were never a platform login at all
> (caretaker, housekeeping).

## 0. How this reuses Fees, and the one place it deliberately doesn't

Payroll's core money-tracking shape is **structurally identical to Fees**: a persistent account
per payee, dated line items owed against it, payments that can span several line items, void-not-
delete for corrections. Reusing that shape directly (§2 below mirrors `FeeAccount` →
`FeeInstallment` → `Payment` → `PaymentAllocation` almost one-for-one) means payroll inherits
everything already proven out — derived status, transactional reconciliation, the audit trail
pattern — instead of re-deriving it.

**The one deliberate difference:** Fees' waterfall (`fees.ts`, the `POST /payments` handler)
*rejects* an amount that exceeds every open installment's balance ("Amount exceeds the remaining
balance on this plan"). Payroll needs the opposite — a payment that exceeds the selected line
items' total is expected and should be **accepted as a credit**, silently absorbed by whatever line
item is generated next (a lecture happens, a new month rolls over). That single behavioral fork is
why payroll isn't just "Fees with different labels" and gets its own allocation rules in §4, even
though the underlying tables rhyme.

The shared *algorithm* (given a payment amount and an ordered list of `{id, outstanding}` targets,
apply oldest-first, return allocations + leftover) is worth factoring out once payroll needs its
own copy — see Build order §9 step 2.

## 1. Staff directory — what's new vs. what already exists

**Already built, untouched by this pass:** `Settings → Team` (`TeamTab.tsx` +
`POST/PATCH /org/team`) is the identity/access surface — invite a `User` with role `ADMIN`,
`ACCOUNTANT`, `FACULTY`, or `RECEPTION`, assign FACULTY course/subject teaching scope. That stays
exactly as-is; Payroll doesn't touch login, roles, or invites.

**New in this pass:** a `SalaryProfile` — the thing that makes someone *payable*. It's a separate,
opt-in record (same "not automatic, admin explicitly sets it up" relationship `FeeAccount` has to
`Student` — a `User` existing doesn't imply a salary any more than a `Student` existing implies a
fee plan). Two shapes:

- **Platform staff** — `userId` set, pointing at an existing `User` (any of `ADMIN`, `ACCOUNTANT`,
  `FACULTY`, `RECEPTION`; `OWNER`/`SUPERADMIN` excluded, they're not institute payroll subjects).
  Name/role badge always resolved by joining `User`, never duplicated onto the profile.
- **External staff** — `userId` null, `externalName` + `title` stored directly (e.g. "Ramesh Yadav"
  / "Caretaker", "Sunita Devi" / "Housekeeping"). No login, no `User` row, ever — these people exist
  only as payroll records. `title` is also settable (optional override) for platform staff, e.g. a
  FACULTY user whose payroll title should read "Senior Faculty — Physics" rather than just their
  role.

This directory lives on a **new `/payroll` route**, not inside Settings — it's about compensation,
not access, and belongs next to the ledger/payment UI it feeds.

```prisma
enum SalaryType {
  FIXED       // flat amount per period (YYYY-MM)
  PER_LECTURE // rate × validated lecture count in the period — FACULTY (platform) only
}
```

```prisma
/// A payable person — either a platform User (any staff role) or someone
/// entirely outside the platform (no login, no User row). PER_LECTURE is
/// only valid when userId is set and that User's role is FACULTY, since
/// lecture attribution runs through Lecture.facultyId → User.id; there's no
/// way to count "lectures" for an external caretaker. Rates are snapshotted
/// onto each generated PayrollLineItem at creation time (§2) — exactly the
/// FeeStructure→FeeAccount snapshot pattern — so a later rate change never
/// retroactively reprices an already-generated period.
model SalaryProfile {
  id             String     @id @default(cuid())
  instituteId    String
  userId         String?    @unique
  externalName   String?
  title          String?
  salaryType     SalaryType
  monthlyRate    Decimal?   @db.Decimal(10, 2) // required when salaryType = FIXED
  perLectureRate Decimal?   @db.Decimal(10, 2) // required when salaryType = PER_LECTURE
  isActive       Boolean    @default(true)
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt

  institute Institute @relation(fields: [instituteId], references: [id], onDelete: Cascade)
  user      User?     @relation(fields: [userId], references: [id], onDelete: Cascade)

  lineItems PayrollLineItem[]
  payments  PayrollPayment[]

  @@index([instituteId])
  @@map("salary_profiles")
}
```

Validation in the create/update handler (not the DB — same "enforced transactionally in the
router, not a constraint" precedent as `PaymentAllocation`'s sum invariant): exactly one of
`userId`/`externalName` set; if `userId` set, that `User.instituteId` must match and role must be
one of the four payroll-eligible roles; `salaryType = PER_LECTURE` requires `userId` set and that
user's role to be `FACULTY`; `monthlyRate`/`perLectureRate` required to match `salaryType`.
Deactivating (`isActive = false`) stops future line-item generation (§2) but never touches
existing ones — same non-retroactive principle as `FeeAccount.status = CLOSED`.

## 2. Line items — the per-period, per-lecture ledger

```prisma
enum PayrollLineItemKind {
  SALARY  // one per (profile, periodMonth) for FIXED profiles
  LECTURE // one per Lecture for PER_LECTURE profiles
}

/// One earned amount, generated lazily (§3), never all at once. `periodMonth`
/// is "YYYY-MM" in the institute's local sense (matches ReceiptCounter's
/// yearMonth convention, just month-grain instead of "YYMM" — kept as the
/// full 4-digit year here since payroll periods get referenced in the UI far
/// more explicitly than a receipt's month ever is). `lectureId` is set only
/// for LECTURE rows and is what makes "list of lectures with their amount,
/// deselect one" possible — nullable + a plain unique constraint works
/// because Postgres treats every NULL as distinct, the same trick already
/// relied on for FacultyAssignment.subjectId.
model PayrollLineItem {
  id            String              @id @default(cuid())
  salaryProfileId String
  kind          PayrollLineItemKind
  periodMonth   String              // "YYYY-MM"
  lectureId     String?             @unique
  label         String              // "Salary — August 2026" / "Physics — 10th Std A — 16 Aug, 10:00"
  amount        Decimal             @db.Decimal(10, 2)
  paidAmount    Decimal             @default(0) @db.Decimal(10, 2)
  createdAt     DateTime            @default(now())

  salaryProfile SalaryProfile       @relation(fields: [salaryProfileId], references: [id], onDelete: Cascade)
  lecture       Lecture?            @relation(fields: [lectureId], references: [id], onDelete: SetNull)
  allocations   PayrollPaymentAllocation[]

  @@index([salaryProfileId, periodMonth])
  @@map("payroll_line_items")
}
```

No DB uniqueness on `(salaryProfileId, periodMonth)` for `SALARY` rows (a `WHERE lectureId IS
NULL` partial unique index isn't expressible in the Prisma schema DSL without raw SQL) — the
generator function (§3) does a `findFirst`-before-`create` instead, same "enforced in code"
category as everything else transactional here.

`status` is derived exactly like `installmentStatus()` — `PAID` (`paidAmount >= amount`),
`PARTIAL` (`0 < paidAmount < amount`), `UNPAID` (`paidAmount = 0`) — no `OVERDUE` concept, payroll
line items don't have a due date in the way a fee installment does.

## 3. Generation — lazy, on-read, same instinct as Fees' rolling window

No cron, no webhook off the attendance-marking endpoint. Instead, **every** read of a staff
member's ledger (`GET /payroll/staff/:id/ledger`) and **every** run-draft creation
(`POST /payroll/runs`, §5) first calls a shared `syncLineItems(salaryProfileId, upToPeriod)`:

- **`FIXED`** — for every `periodMonth` from the profile's `createdAt` month up to `upToPeriod`
  (default: current month) with no existing `SALARY` row yet, create one: `amount =
  profile.monthlyRate`, `label = "Salary — {Month Year}"`.
- **`PER_LECTURE`** — query `Lecture` where `facultyId = profile.userId`, `cancelledAt IS NULL`,
  `date <= today`, and **at least one `AttendanceRecord` exists for it** (the working definition of
  "validated" — attendance was actually marked, not just scheduled; flagged here since the dev
  plan says "validated lecture count" without defining it precisely). For every such lecture with
  no existing `PayrollLineItem` (`lectureId` not already used), create one: `amount =
  profile.perLectureRate`, `periodMonth` derived from `lecture.date`, `label` built from
  `subject.name`, `batch.name`, and the lecture's date/time.

Same principle as `Lecture` rows surviving a later `FacultyAssignment` change: a line item, once
generated, is a historical fact. If a lecture is cancelled or a rate is edited *after* its line
item exists, nothing retroactively changes — flagged as an accepted edge case, not solved here (an
admin who needs to correct an already-generated item does it manually; no "delete a paid-against
line item" endpoint is being built this pass, mirroring Fees not letting a paid installment be
removed either).

**Immediately after generating any new line items, `syncLineItems` also runs advance
reconciliation** — see §4's last paragraph. This is what makes "pay too much this month, it quietly
covers next month automatically" work without a separate background job.

## 4. Payments — selectable line items, waterfall within the selection, credit beyond it

```prisma
/// One payout transaction (one entry in a faculty/staff member's payment
/// history). Mirrors Payment: never hard-deleted, corrected via void. Can
/// span multiple periods/line items in one transaction, same reasoning as a
/// parent paying two fee installments at once — except here it's normal, not
/// an edge case (see §0).
model PayrollPayment {
  id              String       @id @default(cuid())
  instituteId     String
  salaryProfileId String
  amount          Decimal      @db.Decimal(10, 2)
  mode            PaymentMode
  paidOn          DateTime     @db.Date
  notes           String?
  createdByUserId String?
  voidedAt        DateTime?
  voidReason      String?
  voidedByUserId  String?
  createdAt       DateTime     @default(now())

  institute     Institute                  @relation(fields: [instituteId], references: [id], onDelete: Cascade)
  salaryProfile SalaryProfile              @relation(fields: [salaryProfileId], references: [id], onDelete: Cascade)
  allocations   PayrollPaymentAllocation[]

  @@index([instituteId])
  @@index([salaryProfileId])
  @@map("payroll_payments")
}

/// lineItemId nullable = the *advance* case (§0): the portion of a payment
/// not yet matched to a specific line item, because none existed yet at
/// payment time. sum(allocations.amount) for a payment always equals
/// payment.amount, same invariant as PaymentAllocation, enforced in
/// payroll.ts. Unlike a real allocation (immutable once made — audit trail),
/// an advance row's `amount` is mutated down as syncLineItems consumes it
/// against newly generated items — it's a running balance, not a settled fact,
/// until it's fully absorbed.
model PayrollPaymentAllocation {
  id            String  @id @default(cuid())
  paymentId     String
  lineItemId    String?
  amount        Decimal @db.Decimal(10, 2)

  payment  PayrollPayment   @relation(fields: [paymentId], references: [id], onDelete: Cascade)
  lineItem PayrollLineItem? @relation(fields: [lineItemId], references: [id], onDelete: SetNull)

  @@index([paymentId])
  @@index([lineItemId])
  @@map("payroll_payment_allocations")
}
```

`POST /payroll/pay` — body `{ salaryProfileId, amount, mode, paidOn, lineItemIds: string[],
notes? }`. Roles: `OWNER, ADMIN` only (stricter than Fees' `MANAGE_ROLES`, which includes
`RECEPTION` — payroll is money leaving the institute, not coming in; matches the dev plan's
"manage: OWNER/ADMIN" for §2.11 directly). One `$transaction`:

1. Load exactly the `PayrollLineItem`s named in `lineItemIds` that belong to this
   `salaryProfileId` and aren't already fully paid — this is the **selection**: anything the
   caller deselected in the accordion UI (§7) simply isn't in this list, full stop, no special
   "skip" flag needed.
2. Sort selected items oldest-first (`periodMonth` asc, then `createdAt` asc within a period —
   covers both "pay August before September" and "pay lecture 1 before lecture 2 within August").
3. Waterfall the payment `amount` across them in that order — identical algorithm to Fees' (§0),
   `applied = min(outstanding, remaining)` per item.
4. **If `remaining > 0` after every selected item is fully covered** (the "amount is high" case):
   create one more `PayrollPaymentAllocation` with `lineItemId: null`, `amount: remaining` — the
   advance. No error, no cap, unlike Fees.
5. **If the selection's total outstanding exceeds `amount`** (the "amount is low" case): nothing
   special — the waterfall simply stops when `remaining` hits 0, whichever selected items are last
   in sort order stay `PARTIAL`/`UNPAID`. They're still selectable in a future `POST /payroll/pay`
   call ("later I should be able to pay the remaining lectures too") since selectability is just
   "not yet fully paid," same as Fees installments.
6. Increment `paidAmount` on every line item touched.

**Advance reconciliation** (invoked at the end of `syncLineItems`, §3, whenever new line items are
generated for a profile): find that profile's unconsumed advance allocations
(`lineItemId: null`), oldest `payment.paidOn` first; for each newly created line item, greedily
apply advance amount to it (`applied = min(advance.amount, lineItem.amount)`) by creating a *new*
allocation row pointing `lineItemId` at the new item and decrementing the advance row's `amount` in
place (deleting it once it hits zero) — a plain balance transfer inside the same payment, not a new
payment. This is what "in future a lecture happens then the balance is done" means concretely: the
faculty's next lecture (or next month's salary row) shows up already partially or fully paid, no
action needed from the admin.

`POST /payroll/pay/:id/void` — `OWNER, ADMIN`. Same shape as Fees' void: reverses every allocation
(decrements `paidAmount` on real line items, clamped at 0; deletes advance-row allocations
outright since there's nothing downstream to preserve for them), sets
`voidedAt`/`voidReason`/`voidedByUserId`, row survives for audit.

## 5. Run lifecycle — an institute-wide sign-off layer on top of the live ledger

This is the one place this addendum makes an explicit interpretive call, flagged rather than
silently assumed: the dev plan's Preview → Draft → Approve → Paid → Reopen lifecycle reads as one
formal, institute-wide monthly process, while everything in §2–§4 is a continuously-live per-staff
ledger (a lecture can generate a payable line item on the 3rd of the month; nothing about it should
have to wait for a monthly "run"). **Resolution: `PayrollRun` is a sign-off/reporting wrapper for a
period, not a gate that blocks the granular flow.** Payments can be recorded against a staff
member's line items at any time, run or no run — the run exists for the "close out August" ritual:
see the whole month's total obligation before committing, lock in a draft, approve it, and use
"mark paid" as a bulk sweep for anyone not already paid individually.

```prisma
enum PayrollRunStatus {
  DRAFT
  APPROVED
  PAID
}

/// One per (institute, periodMonth) — enforced by the unique constraint, not
/// by any snapshot of which line items belong to it. "In scope" for a run is
/// always derived (every PayrollLineItem across every active SalaryProfile
/// with that periodMonth), same derive-don't-duplicate instinct as everywhere
/// else — a run is a status + approval record, not a second copy of the data.
model PayrollRun {
  id               String           @id @default(cuid())
  instituteId      String
  periodMonth      String
  status           PayrollRunStatus @default(DRAFT)
  approvedAt       DateTime?
  approvedByUserId String?
  paidAt           DateTime?
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt

  institute Institute @relation(fields: [instituteId], references: [id], onDelete: Cascade)

  @@unique([instituteId, periodMonth])
  @@map("payroll_runs")
}
```

- `GET /payroll/runs/preview?period=YYYY-MM` — **dry run, nothing saved**: for every active
  `SalaryProfile`, compute (don't persist) what `syncLineItems` *would* generate for that period,
  return per-profile + institute-wide totals. No `PayrollLineItem`, no `PayrollRun` row written —
  matches "nothing saved" from the spec literally.
- `POST /payroll/runs` — body `{ period }`. Creates the `PayrollRun` (`DRAFT`) and, unlike preview,
  actually calls `syncLineItems` for every active profile up to that period — this is the moment
  preview numbers become real, referenceable rows. 409 if a run for that period already exists (one
  run per period, per spec).
- `POST /payroll/runs/:id/approve` — `DRAFT → APPROVED`. `OWNER, ADMIN`. Purely a status/sign-off
  flip; doesn't move money.
- `POST /payroll/runs/:id/pay` — `APPROVED → PAID`. `OWNER, ADMIN`. Bulk convenience: for every
  active profile with an outstanding balance in this period, auto-record one full-balance
  `PayrollPayment` (mode fixed to `BANK_TRANSFER` unless the request specifies otherwise) covering
  everything still unpaid — the "just pay everyone the rest for this month" fast path, for whoever
  wasn't already handled individually via §4. Does not touch profiles already fully paid.
- `POST /payroll/runs/:id/reopen` — `APPROVED` or `PAID → DRAFT`. `OWNER, ADMIN`. Resets the run's
  own status/approval metadata only — **does not reverse any `PayrollPayment`s already made**, same
  "financial records aren't undone, only voided" principle as Fees (§4 of the Fees addendum). A
  reopened run just means more line items can be reviewed/added before re-approving; individual
  corrections still go through void (§4).
- `GET /payroll/runs` / `GET /payroll/runs/:id` — list/detail, `OWNER, ADMIN, ACCOUNTANT`
  (accountants can review without approving).

## 6. Faculty self-view — "My payslips"

`GET /payroll/my-payslips` — any authenticated user with a `SalaryProfile` where `userId === self`
(not restricted to role `FACULTY` specifically, even though that's the dev plan's stated common
case — an ADMIN or RECEPTION user with a salary profile gets the same read for free, no extra
code). Returns the same period-grouped shape as the admin ledger (§7) minus any pay/select
controls: `periodMonth`, `totalEarned`, `totalPaid`, `status` (`PAID`/`PARTIAL`/`UNPAID` per
period), and per-lecture line items for `PER_LECTURE` profiles. Read-only.

## 7. Last-paid / pending — derived, not stored

`GET /payroll/staff` (the directory) and `GET /payroll/staff/:id` (detail) compute, per profile:

- `pendingAmount` = `sum(lineItem.amount - lineItem.paidAmount)` across all line items, **minus**
  any unconsumed advance total (§4) — can go negative, displayed as a credit ("₹450 credit") rather
  than clamped to zero, so an admin immediately sees a faculty member is pre-paid.
- `lastPaidOn` / `lastPaidAmount` = the most recent non-voided `PayrollPayment.paidOn`/`amount` for
  that profile.

Both computed on every read, same as `installmentStatus()` and every Fees stat card — nothing
stored that could drift.

## 8. Frontend

**New `/payroll` route**, tabs gated by role:

- **Staff** (`OWNER, ADMIN`) — directory table: name, title/role, salary type + rate, pending
  amount, last paid. Rows for platform users without a `SalaryProfile` yet show "Set up salary"
  (same empty-state pattern as Fees' "Not set up" badge); "Add external staff" button opens a
  lighter modal (name, title, monthly rate only — `salaryType` fixed to `FIXED`, `userId` omitted).
- **Staff ledger** (drill-in from a directory row) — the accordion UI, one collapsible section per
  `periodMonth` (newest first), each header showing that month's combined outstanding amount; open
  a section to see its line items (lecture rows for `PER_LECTURE`, single salary row for `FIXED`)
  each with a checkbox, pre-checked by default. Checkbox state is a single flat `Set<lineItemId>`
  lifted above the accordion so **selecting across multiple open months at once** (the explicit
  ask — "if I'm paying multiple months, combined amt in that month list format") works in one
  payment. A running "Selected total: ₹X" + an editable amount field (defaults to the selected
  total, but overridable — typing a smaller number demonstrates the "if low" partial case live, a
  larger number demonstrates the credit case) + "Record payment" button calling `POST
  /payroll/pay` with exactly the checked `lineItemIds`. A visible "Credit balance: ₹X" chip when
  `pendingAmount` is negative.
- **Runs** (`OWNER, ADMIN, ACCOUNTANT`) — period picker → preview totals (before a run exists) or
  run detail + status badge + Approve/Mark paid/Reopen buttons (role/status-gated) once one does.
- **My payslips** (`FACULTY` and anyone else with a `SalaryProfile` pointing at themselves) — same
  accordion visual, read-only, no checkboxes/pay button.

Reuses `StatCard`, `Modal`, `Dropdown`, `Badge`, `Button`, `ConfirmModal` throughout, same as every
module so far. The accordion itself is the one new primitive this phase needs (a plain
`<details>`-backed or controlled-open-state list group — no library, matches the project's
"no new UI primitives unless the interaction genuinely doesn't exist yet" bar).

`navigation.ts` + `Sidebar`: one `PAYROLL`-gated nav item, visible to `OWNER, ADMIN, ACCOUNTANT,
FACULTY` (last one sees only "My payslips").

## 9. Expenses (Phase 7 §2.10) — ledger deferred, this pass is CRUD + categories + the mirror table

Deliberately smaller scope, confirmed in discussion: build the expense recording surface and the
`FinanceEntry` mirror table now (so nothing has to migrate later), but the **combined Ledger
view / CSV export is a separate future pass** — this addendum only wires `Expense` creation into
`FinanceEntry`, not Fee `Payment`s or `PayrollPayment`s (those get mirrored in when the Ledger pass
actually reads from this table; wiring them now with no reader would be speculative).

```prisma
enum FinanceEntryKind {
  INCOME
  EXPENSE
}

model ExpenseCategory {
  id          String            @id @default(cuid())
  instituteId String
  name        String
  kind        FinanceEntryKind  @default(EXPENSE) // optional income/expense flag, per spec
  isActive    Boolean           @default(true)
  createdAt   DateTime          @default(now())

  institute Institute  @relation(fields: [instituteId], references: [id], onDelete: Cascade)
  expenses  Expense[]

  @@unique([instituteId, name])
  @@map("expense_categories")
}

model Expense {
  id              String   @id @default(cuid())
  instituteId     String
  categoryId      String
  title           String
  amount          Decimal  @db.Decimal(10, 2)
  date            DateTime @db.Date
  notes           String?
  createdByUserId String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  institute    Institute     @relation(fields: [instituteId], references: [id], onDelete: Cascade)
  category     ExpenseCategory @relation(fields: [categoryId], references: [id])
  financeEntry FinanceEntry?

  @@index([instituteId, date])
  @@map("expenses")
}

/// The future Ledger pass's read model. One row per originating financial
/// event across the whole institute — this pass only ever writes EXPENSE
/// rows (source = "EXPENSE"), but the shape is deliberately generic
/// (source + sourceId) so FEE_PAYMENT / PAYROLL_PAYMENT rows can be mirrored
/// in later without a schema change, matching how Lecture/FeeAccount were
/// both modeled ahead of their own deferred read-layers (§1 at the top of
/// this file).
model FinanceEntry {
  id          String           @id @default(cuid())
  instituteId String
  kind        FinanceEntryKind
  source      String           // "EXPENSE" this pass; "FEE_PAYMENT" / "PAYROLL_PAYMENT" later
  sourceId    String
  categoryName String?
  description String
  amount      Decimal          @db.Decimal(10, 2)
  date        DateTime         @db.Date
  createdAt   DateTime         @default(now())

  institute Institute @relation(fields: [instituteId], references: [id], onDelete: Cascade)
  expense   Expense?  @relation(fields: [sourceId], references: [id], map: "finance_entry_expense_fk")

  @@unique([source, sourceId])
  @@index([instituteId, date])
  @@map("finance_entries")
}
```

`expenses.ts` → mounted `/expenses`, `requireModule("EXPENSE")`, **`OWNER, ADMIN` only** for every
route (matches the dev plan's `2.10` gating exactly — no `RECEPTION`/`ACCOUNTANT` write access this
pass; flag as a call-out if accountants are expected to log expenses day-to-day, easy one-line role
change later).

- `GET /categories`, `POST /categories`, `PATCH /categories/:id` (rename/deactivate).
- `GET /?from=&to=&categoryId=` — filterable list, matches the Fees Receipts tab's exact
  search/filter UX pattern just built.
- `POST /`, `PATCH /:id`, `DELETE /:id` — plain CRUD. Deliberately **not** void-not-delete here
  (unlike `Payment`/`PayrollPayment`): an expense has no receipt-number sequence and no downstream
  balance it reconciles against, so a wrongly-entered one can just be corrected or removed outright
  — flagged as an intentional asymmetry with the financial-record patterns elsewhere, not an
  oversight. `POST`/`PATCH` both write-through to `FinanceEntry` in the same transaction
  (upsert on `[source, sourceId]`); `DELETE` removes the mirror row too (`onDelete: Cascade`
  isn't declared since `FinanceEntry.sourceId` isn't a hard FK to a single polymorphic parent —
  the handler deletes both rows explicitly in one transaction).

Frontend: new `/expenses` route — "Expenses" tab (searchable/filterable table, "Add expense"
modal: title, category dropdown, amount, date, notes) + "Categories" tab (simple list +
add/rename/deactivate, same shape as `Settings` tabs elsewhere). `navigation.ts`/`Sidebar`:
`EXPENSE`-gated, `OWNER, ADMIN` only.

## 10. What's explicitly out of scope this pass

- **Combined Ledger view + CSV export** — the rest of Phase 7 §2.10/§2.9's remaining half;
  `FinanceEntry` is seeded (Expenses only) so that pass is additive, not a migration.
- **Fee `Payment` / `PayrollPayment` → `FinanceEntry` mirroring** — added when the Ledger pass
  actually consumes them (§9).
- **Retroactive correction of a `PayrollLineItem` after its lecture is cancelled/edited** — flagged
  in §3, not solved; manual admin correction only, no automated reversal.
- **Late/penalty logic, refunds, or any payroll equivalent of Fees' overdue reminders** — nothing
  in the dev plan asks for it here, not building it speculatively.
- **Accountant write access to Expenses** — gated `OWNER/ADMIN` only per spec, flagged in §9 as an
  easy follow-up if wrong.

## Build order

1. Schema: `SalaryType`, `PayrollLineItemKind`, `PayrollRunStatus`, `FinanceEntryKind` enums;
   `SalaryProfile`, `PayrollLineItem`, `PayrollPayment`, `PayrollPaymentAllocation`, `PayrollRun`,
   `ExpenseCategory`, `Expense`, `FinanceEntry` models; `Institute` gains the corresponding
   back-relation arrays; `Lecture` gains `payrollLineItem PayrollLineItem?` for the `@unique
   lectureId` back-relation. One additive `prisma db push`, no destructive changes.
2. Extract the waterfall-allocation algorithm out of `fees.ts`'s inline `POST /payments` handler
   into `backend/src/services/waterfallAllocation.ts` (pure function: sorted targets + amount →
   allocations + leftover); refactor `fees.ts` to call it, confirm Fees' existing behavior/tests
   are unchanged before building on top of it.
3. `services/payrollSync.ts` — `syncLineItems(salaryProfileId, upToPeriod)` (§3) including the
   advance-reconciliation pass (§4's last paragraph). Build and unit-test this in isolation first —
   it's the trickiest piece (lazy generation + credit-consumption ordering) and everything else
   reads through it.
4. `payroll.ts` router: `staff` CRUD (§1), `GET /staff/:id/ledger` (§7 shape), `POST /pay` +
   `POST /pay/:id/void` (§4), `runs` preview/create/approve/pay/reopen (§5), `my-payslips` (§6).
5. `/payroll` frontend: Staff directory + set-up-salary/add-external modals, staff ledger accordion
   + selection + pay flow, Runs tab, My payslips — §8.
6. `expenses.ts` router + `FinanceEntry` mirroring (§9), `/expenses` frontend (categories +
   ledger-style list).
7. `navigation.ts`/`Sidebar` gating for both `PAYROLL` and `EXPENSE` — wired last, same order as
   every prior phase.
8. Type-check + lint pass on both sides after each numbered step.
9. Smoke-test: create a `FIXED` external staff member → run preview → create draft run → confirm a
   `SALARY` line item generated → pay it partially → confirm `PARTIAL` status and the remainder
   still selectable next payment; create a `PER_LECTURE` faculty profile → mark attendance on a
   couple of their lectures → confirm matching line items appear in their ledger accordion, grouped
   by month → deselect one lecture, pay the rest → confirm the deselected one stays unpaid and
   payable later → pay a lump sum exceeding the selected total → confirm a credit balance appears →
   confirm the next newly-generated line item (new lecture or month rollover) auto-absorbs that
   credit → void a payment → confirm balances reverse; approve → mark-paid → reopen a run → confirm
   status transitions and that reopening doesn't touch already-made payments; create an expense →
   confirm a matching `FinanceEntry` row exists → edit/delete it → confirm the mirror follows;
   cross-institute isolation checks throughout, same rigor as every prior phase.

