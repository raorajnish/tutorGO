# Changes — Phase 2 (Academics) + Phase 3 (Enquiry → Admission → Students)

> Planning doc, written before implementation per discussion. Supersedes the previous entry in
> this file (Phase 1's org-creation wizard work), which is done and now lives only in the code.
> Update this doc as decisions change; it's a working doc, not a permanent record.

## Status: implemented

All of §3–§5 is built and smoke-tested end-to-end (curl, two separate institutes) —
Academics CRUD, Enquiry pipeline, the transactional admit endpoint (student code generation,
batch enrollment, enquiry conversion all verified), batch reassignment (history preserved,
old row closed), deactivation (closes open enrollment), and cross-institute isolation
(second institute gets a clean 404 on the first institute's student, not a leak). Frontend
type-checks, lints, and production-builds clean across all four new routes
(`/academics`, `/enquiries`, `/admissions`, `/students`). Nav items are role- and
module-gated per §5.

## 0. Scope

Builds `developmentplan.md` §2.4–2.7 / Phases 2–3 in one pass, since Academics is a hard
dependency of everything downstream (Enquiry references `Course`, Admission/Students reference
`Batch`). Order: **Academics → Enquiry → Admission → Students**, each demoable on its own before
moving to the next.

Not in scope here: Attendance, Fees (Students' "fee snapshot" and "recent attendance" panels
render an honest empty/stub state — "Fees module not enabled" / "No attendance yet" — until
Phases 4–5 exist. No fake data.)

---

## 1. Student code generation (decided — revised)

**`Course` doubles as the institute's "class/standard."** Coaching institutes structure
themselves by standard — "10th", "12th — JEE", "12th — NEET" — and those *are* the courses
(each with its own subjects and batches), not a separate thing a student picks in addition to a
course. So a student is admitted **into a Course**, full stop — no free-text "class/standard"
field. This also fixes the class-code problem at the root: instead of parsing whatever text
someone types at admission time, `Course` gets an explicit short `code` (e.g. `10`, `12JEE`),
set once when the course is created, and that code is used directly — no string parsing at
admission time at all.

**Format:** `{INSTITUTE_CODE}-{YY}-{COURSE_CODE}-{SEQ}` — e.g. `SP20-25-10-0007`. Dashes are kept
deliberately: institute codes are variable-length (2-8 chars) and course codes are variable-length
too, so a plain digit-string (`SP2025100007`) would be genuinely ambiguous to parse back, on top
of being harder to read/say aloud/spot a typo in — same reasoning as invoice numbers, PAN, GSTIN
all using separators.

- `INSTITUTE_CODE` — the institute's existing code (already unique platform-wide).
- `YY` — 2-digit **admission year** (from `admissionDate`, not "today"), so backdated admissions
  land in the right bucket.
- `COURSE_CODE` — `Course.code`, staff-defined once at Academics setup (2-8 chars, alphanumeric,
  unique per institute — same validation shape as institute/org codes elsewhere in the app).
- `SEQ` — 4-digit, gapless, **per (institute, year, courseCode)**. Resets per course per year, not
  global — matches how coaching institutes actually file rolls (`10-0001`..., `12JEE-0001`...,
  each starting fresh every year).

**Concurrency-safe counter (industry-standard pattern):** a dedicated `StudentCodeCounter` table
keyed on `@@unique([instituteId, year, courseCode])`, incremented via `prisma.upsert` with
`update: { seq: { increment: 1 } }`. On Postgres, Prisma compiles `upsert` to a single
`INSERT ... ON CONFLICT DO UPDATE` round-trip — atomic at the row level, no read-then-write race,
no explicit locking needed, and correct under concurrent admissions from two reception desks at
once. This whole thing runs inside the same `prisma.$transaction` as the `Student` insert, so a
failed admission never burns a sequence number.

```ts
// services/studentCode.ts
async function nextStudentCode(tx, instituteId, instituteCode, admissionDate, courseCode) {
  const year = admissionDate.getFullYear() % 100;
  const counter = await tx.studentCodeCounter.upsert({
    where: { instituteId_year_courseCode: { instituteId, year, courseCode } },
    create: { instituteId, year, courseCode, seq: 1 },
    update: { seq: { increment: 1 } },
  });
  return `${instituteCode}-${String(year).padStart(2, "0")}-${courseCode}-${String(counter.seq).padStart(4, "0")}`;
}
```

This also sets up Attendance scheduling cleanly later: pick a Course → its linked `Subject`s (via
`CourseSubject`) populate the subject dropdown → pick a Batch under that course → schedule the
lecture. No schema debt from this phase blocks that.

---

## 2. Full flow: Enquiry → Admission → Student

Note on batch linkage: a student's batch is **never a field on `Student`** — it's a separate
`StudentBatch` join row (§3). That's what makes reassignment a clean insert-and-close rather than
an edit: the student record itself doesn't know or care which batch it's currently in, so
swapping batches, or leaving a student unassigned entirely (batch is optional at admission time),
never requires touching `Student`.

1. **Capture** — RECEPTION/ADMIN/OWNER logs a lead in Enquiry: name, phone, course interested
   (optional FK to `Course`), source, next follow-up date, notes. Status starts `NEW`.
2. **Work the pipeline** — tabbed board (`NEW` / `CONTACTED` / `CONVERTED` / `LOST`) with counts
   per tab. Per-lead actions: edit, "Mark contacted" (`NEW→CONTACTED`), "Convert" (jumps into the
   Admission form, pre-filled — **does not** change status yet), "Mark lost" (`→LOST`), delete.
   Faculty can edit; students get read-only visibility if the module is shown to them at all.
3. **Admit** — two entry points into the same form: "Admit directly" (blank) or "Admit from
   enquiry" (pre-fills name/phone/**course** from the selected `NEW`/`CONTACTED` lead). Form
   collects the full student record: name, email (optional), phone, parent phone, **course**
   (required — this *is* the class/standard), DOB, father's/mother's name, school, admission
   date, optional batch (filtered to batches under the selected course), optional fingerprint ID.
4. **On submit — one `$transaction`:**
   a. Generate the student code (§1).
   b. Create the `Student` row (`isActive: true`, `enquiryId` set if this came from a lead).
   c. If a batch was picked, open a `StudentBatch` row (`joinedAt = admissionDate`).
   d. If converting, flip the source `Enquiry.status → CONVERTED` (the `Student.enquiryId` FK
      *is* the link back — no separate "convertedStudentId" needed).
   e. Audit log (`STUDENT_CREATED`, plus `ENQUIRY_CONVERTED` when applicable).
   All-or-nothing: a failed student creation never leaves an enquiry stuck half-converted, and
   never burns a code sequence number (§1).
5. **Funnel view** on the Admission page — "Pipeline" tab (open enquiries, `NEW`/`CONTACTED`,
   each with an "Admit" button) vs "Admitted" tab (a rolling recent-admissions feed, linking into
   the Students directory for the full record).
6. **Students directory** — search + active/inactive/all filter, stat cards (active students,
   total on file, active batches, fee book value — the last one reads `0`/hidden until Fees
   exists). Row click opens a **profile drawer**: contact/parents/school/DOB/admission date,
   full batch history, fee snapshot stub, last-10 attendance stub.
7. **Batch reassignment** (from the drawer) — one transaction: close the currently-open
   `StudentBatch` (`leftAt = today`), open a new one (`joinedAt = today`). Rows are never edited
   or deleted after the fact — that history is the audit trail for "which batch was this student
   in on date X," which fees/attendance reporting will eventually need.
8. **Deactivation, not deletion** — `Student.isActive → false`. Also closes any currently-open
   `StudentBatch` (a deactivated student shouldn't read as "currently enrolled" anywhere), but
   reactivating does **not** auto-reopen one — staff must explicitly reassign a batch, since which
   batch to resume into is a judgment call, not a mechanical undo.

---

## 3. Data model (new)

```prisma
enum EnquirySource { WALK_IN, REFERRAL, SOCIAL, PHONE, OTHER }
enum EnquiryStatus { NEW, CONTACTED, CONVERTED, LOST }

/// Doubles as the institute's "class/standard" — e.g. "10th Standard" (code
/// "10"), "12th — JEE" (code "12JEE"). code feeds directly into
/// Student.studentCode generation, no free-text parsing needed.
model Course {
  id             String   @id @default(cuid())
  instituteId    String
  name           String
  code           String
  durationMonths Int?
  description    String?
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  institute Institute       @relation(fields: [instituteId], references: [id], onDelete: Cascade)
  batches   Batch[]
  enquiries Enquiry[]
  students  Student[]
  subjects  CourseSubject[]

  @@unique([instituteId, code])
  @@index([instituteId])
  @@map("courses")
}

model Subject {
  id          String   @id @default(cuid())
  instituteId String
  name        String
  shortCode   String
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  institute Institute       @relation(fields: [instituteId], references: [id], onDelete: Cascade)
  courses   CourseSubject[]

  @@unique([instituteId, shortCode])
  @@index([instituteId])
  @@map("subjects")
}

/// Explicit many-to-many: a subject (e.g. "Physics") is often taught across
/// several courses (e.g. both a JEE and a NEET course), not owned by one.
model CourseSubject {
  id        String @id @default(cuid())
  courseId  String
  subjectId String

  course  Course  @relation(fields: [courseId], references: [id], onDelete: Cascade)
  subject Subject @relation(fields: [subjectId], references: [id], onDelete: Cascade)

  @@unique([courseId, subjectId])
  @@index([subjectId])
  @@map("course_subjects")
}

model Batch {
  id          String    @id @default(cuid())
  instituteId String
  courseId    String
  name        String
  startDate   DateTime  @db.Date
  endDate     DateTime? @db.Date
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  institute Institute      @relation(fields: [instituteId], references: [id], onDelete: Cascade)
  course    Course         @relation(fields: [courseId], references: [id])
  students  StudentBatch[]

  @@index([instituteId])
  @@index([courseId])
  @@map("batches")
}

model Enquiry {
  id               String        @id @default(cuid())
  instituteId      String
  name             String
  phone            String
  courseId         String?
  source           EnquirySource @default(OTHER)
  status           EnquiryStatus @default(NEW)
  nextFollowUpDate DateTime?     @db.Date
  notes            String?
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  institute Institute @relation(fields: [instituteId], references: [id], onDelete: Cascade)
  course    Course?   @relation(fields: [courseId], references: [id])
  student   Student?

  @@index([instituteId, status])
  @@map("enquiries")
}

model StudentCodeCounter {
  id          String @id @default(cuid())
  instituteId String
  year        Int
  courseCode  String
  seq         Int    @default(0)

  @@unique([instituteId, year, courseCode])
  @@map("student_code_counters")
}

model Student {
  id            String    @id @default(cuid())
  instituteId   String
  studentCode   String    @unique
  enquiryId     String?   @unique
  courseId      String
  name          String
  email         String    @unique // falls back to {studentCode}@local.in if not provided
  phone         String?
  parentPhone   String?
  dob           DateTime? @db.Date
  fatherName    String?
  motherName    String?
  school        String?
  admissionDate DateTime  @db.Date
  fingerprintId String?
  isActive      Boolean   @default(true)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  institute Institute      @relation(fields: [instituteId], references: [id], onDelete: Cascade)
  enquiry   Enquiry?       @relation(fields: [enquiryId], references: [id], onDelete: SetNull)
  course    Course         @relation(fields: [courseId], references: [id])
  batches   StudentBatch[]

  @@index([instituteId, isActive])
  @@index([courseId])
  @@map("students")
}

model StudentBatch {
  id        String    @id @default(cuid())
  studentId String
  batchId   String
  joinedAt  DateTime  @db.Date
  leftAt    DateTime? @db.Date

  student Student @relation(fields: [studentId], references: [id], onDelete: Cascade)
  batch   Batch   @relation(fields: [batchId], references: [id], onDelete: Cascade)

  @@index([studentId])
  @@index([batchId])
  @@map("student_batches")
}
```

`Institute` gains back-relation arrays (`courses`, `subjects`, `batches`, `enquiries`,
`students`) for consistency with its existing `users`/`modules` fields. `StudentCodeCounter` is
internal bookkeeping only — no relation array needed on `Institute`.

---

## 4. API surface (new routers)

All new routers: `authenticate, requireInstitute` at the top (tenant-scoped, mirrors `org.ts`).

**`academics.ts`** → mounted at `/academics`. Not gated. Read open to any authenticated tenant
role; writes restricted to `OWNER, ADMIN, RECEPTION`.
- `GET/POST /courses`, `PATCH /courses/:id` — `code` required (2-8 chars, alphanumeric,
  auto-uppercased, unique per institute — same validation shape as institute codes). Includes
  `batchCount`, `subjectCount`, `studentCount` in the list response.
- `GET/POST /subjects`, `PATCH /subjects/:id` — body takes `courseIds: string[]` (replaces the
  full `CourseSubject` set for that subject in one call, same pattern as the module-toggle
  checkboxes already used in the org wizard)
- `GET/POST /batches`, `PATCH /batches/:id` (includes `enrolledCount`; lecture count returns 0
  until Attendance exists)

**`enquiry.ts`** → mounted at `/enquiries`, `requireModule("ENQUIRY")`. Writes:
`OWNER, ADMIN, RECEPTION` (+`FACULTY` may `PATCH`); students get `GET` only if the module is
visible to them at all (existing module-visibility rule, not new).
- `GET /` (`?status=&search=`), `POST /`, `PATCH /:id`
- `POST /:id/contacted`, `POST /:id/lost`, `DELETE /:id`

**`admission.ts`** → mounted at `/admissions`, `requireModule("ADMISSION")`,
`OWNER, ADMIN, RECEPTION`.
- `POST /` — the transactional admit endpoint (§2 step 4); body carries an optional `enquiryId`.

**`students.ts`** → mounted at `/students`. View not gated (open to `OWNER, ADMIN, RECEPTION`,
per dev plan "view otherwise open to managers"); create lives in `admission.ts`; reassignment is
gated since it's an "assign" action.
- `GET /` (`?search=&status=active|inactive|all`), `GET /:id` (profile + batch history + stubs)
- `PATCH /:id` (contact/parent/school fields only — never `studentCode`/`instituteId`)
- `POST /:id/deactivate`, `POST /:id/activate`
- `POST /:id/reassign-batch` (`requireModule("ADMISSION")`) — body `{ batchId }`

---

## 5. Frontend (new)

Top-level routes, matching the existing `/dashboard`, `/settings` pattern (not nested):
`/academics` (tabs: Courses / Subjects, plus a Batches table), `/enquiries` (pipeline board),
`/admissions` (funnel: Pipeline / Admitted tabs), `/students` (directory + profile drawer).

Reuses existing primitives throughout — `StatCard`, `Modal`, `Dropdown` (now searchable/
keyboard-nav, per the recent polish pass), `Badge`, `Button`, `ConfirmModal` for every delete.
Batch/Course pickers use `Dropdown`. Enquiry pipeline uses `Tabs` (already built) for the
NEW/CONTACTED/CONVERTED/LOST board.

`lib/navigation.ts` gets four new nav items. Academics is role-gated only (`OWNER/ADMIN/
RECEPTION`, always visible once role matches). Enquiry/Admission additionally check
`user.institute.activeModules.includes("ENQUIRY" | "ADMISSION")` — `navForRole` needs a second
parameter (`activeModules: ModuleCode[]`) threaded from `Sidebar` via `useAuth()`. Students nav
item is ungated (visible whenever role matches, independent of Admission being on — matches "view
otherwise open to managers").

---

## Build order

1. Schema migration: all of §3 in one migration (`academics_and_admissions`).
2. `services/studentCode.ts` (§1) + `services/academics.ts` helpers (batch/course counts).
3. `academics.ts` router + frontend (`/academics`) — demoable alone, nothing downstream depends
   on Enquiry/Admission yet.
4. `enquiry.ts` router + frontend (`/enquiries`) — demoable alone (course dropdown only needs
   Academics to exist).
5. `admission.ts` + `students.ts` routers + frontend (`/admissions`, `/students`) together, since
   the admit transaction and the directory/drawer are two views of the same data.
6. `navigation.ts` + `Sidebar` module-gating change, wired last so nothing links to unbuilt pages
   mid-way.
7. Type-check + lint pass on both sides after each numbered step, not just at the end.
