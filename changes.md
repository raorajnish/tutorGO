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

