# Phase 10 — Discounts, WhatsApp Send, Staff Leave, Public Receipts, Student Portal

Planning doc, same convention as `changes-phase8.md`/`changes-phase9.md`. Nothing here is built yet — each phase starts only when told to, same as every phase before it. Ordered by ease-of-implementation × payoff, not by the order the features were raised in conversation, per the explicit ask ("phase wise at the ease/complexity of implementation").

Every phase below ends in a working, demoable slice, typechecked clean on both sides, before the next one starts.

---

## Ordering rationale

| Phase | Feature | Why here |
|---|---|---|
| 10.1 | Percentage/flat discount | Smallest possible change — one new column, one UI control, no new tables, no auth surface, no new routes beyond the existing fee-account endpoints. Ships in an afternoon. |
| 10.2 | WhatsApp send dispatcher | Groundwork already exists (connection, templates, encryption, delivery-status webhook) — this phase is "wire the last function," not build new infrastructure. High payoff (this is what makes reminders actually reach parents) for low remaining effort. |
| 10.3 | Public receipt links | New public route + one frontend page, same shape as the self-fill portal you already have. No new roles, no new auth model — the riskiest part (an unauthenticated public surface) is a pattern you've already shipped once. |
| 10.4 | Staff leave management | New domain (requests, approval states) but self-contained — one model, one tab, no interaction with money until you decide unpaid-leave deduction is in scope (deliberately deferred, see 10.4). |
| 10.5 | Export coverage (§9e follow-through) | Mechanical, no schema changes — every route is a read + `toCsv()`, and the frontend piece (`apiDownload`, the icon button) is one small shared component used four times. Placed after Leave because it's pure plumbing, no design decisions left open once scope per module is fixed. |
| 10.6 | Student portal | Largest phase — new role-shaped access surface, new login/credential flow, five read-only data views. Placed last because it depends on nothing above but benefits from WhatsApp send (10.2) existing for credential delivery, and is the most UI surface to get right. |

Homework (flagged in the original gap analysis as "doesn't exist, real scope") is **not** in this phase — it's a staff-side authoring module in its own right (assign, edit, list, mark-complete), not a portal display concern. Worth its own phase-11 once the portal ships and you've seen what parents actually ask for.

---

## Phase 10.1 — Percentage or flat discount

**Complexity: trivial. ~half a day.**

### Data model
`FeeAccount` gets one new column:
```prisma
discountType DiscountType @default(FLAT)   // FLAT | PERCENT
```
`discount` (existing `Decimal`) keeps its meaning: a flat rupee amount when `discountType = FLAT`, a percentage (0–100) when `PERCENT`. No new table — this is one enum + one column, migrated via `db push` like every schema change so far in this project.

### Backend
`finalFee` computation (currently `courseFee − discount`) becomes:
```
finalFee = discountType === "PERCENT"
  ? courseFee - (courseFee * discount / 100)
  : courseFee - discount
```
This one function is called from exactly two places today (`SetupFeeAccountModal`'s create endpoint and `EditFeeAccountPricingModal`'s update endpoint) — both go through `academics`/`fees` routes, so the calculation moves into a single shared helper (`lib/feeMath.ts` or similar) rather than being duplicated a second time. Validate `discount <= 100` when `discountType = PERCENT` at the zod-schema level (a >100% discount is nonsensical and should 400, not silently produce a negative fee).

### Frontend
In both `SetupFeeAccountModal.tsx` and `EditFeeAccountPricingModal.tsx`, the existing `Input label="Discount (₹, optional)"` becomes a **compound field**: the number input, plus a small two-option toggle immediately beside it — ₹ / % — using the same visual language as your existing segmented-toggle components (check `Toggle.tsx`/`Dropdown.tsx` for the closest existing primitive rather than inventing a new one). The `finalFee` preview already recalculates live today (it's a `useMemo` keyed on the input state) — adding `discountType` to that same dependency array is all that's needed for "recalculates as I type" to keep working exactly as it does now, just with the new mode included.

### UI polish
- ₹ is the default (matches every existing account, so nothing changes for institutes that never touch this)
- Switching the toggle keeps the *numeric value* as typed and just reinterprets it — switching from "500" (₹) to "%" doesn't clear the field, it recomputes what 500% would mean and the live preview will immediately show that's absurd, which is itself useful feedback; the 0–100 validation catches it on submit
- If `finalFee` would go negative or below `paidAmount` on an *edit* (not create), block save with the same "can't be less than what's already been paid" message the amount-edit route already uses elsewhere in `fees.ts` — reuse that exact copy for consistency

### Risk
None — this is additive to one existing, well-tested code path. No migration backfill needed since `discountType` defaults to `FLAT`, which is the only mode that has ever existed.

---

## Phase 10.2 — WhatsApp send dispatcher

**Complexity: low-medium. The hard parts (auth, encryption, template lifecycle, delivery webhook) already exist and were audited clean earlier this session.**

### What exists today (confirmed, not assumed)
- `services/whatsapp.ts`: `sendTemplateMessage()` — fully implemented, logs to `OutboundMessage`, handles success/failure — **but is never called from anywhere in the codebase.**
- Template sync/submit/map lifecycle: working.
- Delivery-status webhook (`routes/public.ts`): working, updates `OutboundMessage.status` from Meta's callbacks.
- `services/reminderScheduler.ts`: currently calls `notify()` (in-app) and `sendPush()` (web push) only.

### The one piece of new code: the dispatcher
A single function, `dispatchMessage(instituteId, type, recipient, vars)`, that:
1. Resolves the institute's `WhatsAppTemplate` mapped to `type` (e.g. `FEE_REMINDER`, `ATTENDANCE_ALERT`) — reuses the `mappedType` field already on `WhatsAppTemplate` from the earlier audit.
2. If a mapped, **APPROVED** template exists and WhatsApp `isEnabled` is on for the institute → calls `sendTemplateMessage()`.
3. Falls back to whatever channel already exists (in-app notification, push) regardless of WhatsApp outcome — WhatsApp is additive, never a replacement, so a misconfigured template must never mean a parent hears nothing at all.

### Wiring points (where `dispatchMessage` gets called)
- `reminderScheduler.ts` — fee-overdue and lecture reminders, sent to `Student.parentPhone` (this is the actual gap: reminders exist and fire, they just never reach a phone today)
- Fee payment recorded → optional "payment received" confirmation (nice-to-have, not required for this phase)
- **Explicitly not in scope for 10.2:** any *new* trigger types beyond what `reminderScheduler` already fires. This phase is "make the existing reminders reach WhatsApp," not "invent new notification moments."

### UI
Settings → WhatsApp tab already shows template status (DRAFT/PENDING/APPROVED/REJECTED) and connection state — the only addition is a small delivery indicator on the existing Reminders tab ("Last sent via: WhatsApp / Push only" per reminder), so staff can see at a glance whether WhatsApp is actually being used or silently falling back.

### Risk / dependency
Needs a real Meta WABA connected and at least one APPROVED template to test against — this is an external dependency (Meta's review turnaround, "usually within a day" per your own settings-tab copy), not a code risk. Build and test the fallback path first (WhatsApp unconfigured → push/in-app still works), so the feature degrades safely even before your WABA is approved.

---

## Phase 10.3 — Public receipt links (print + share)

**Complexity: low. New public route + one page, reusing an existing pattern.**

As discussed: no PDF generation, no PDF storage.

### Data model
`Payment` gets one new column: `publicToken String @unique @default(cuid())` — actually, prefer explicit generation over a Prisma default here so the token format matches your other opaque identifiers (`randomBytes(16).toString('base64url')`), generated once in the same transaction that creates the `Payment` row.

### Backend
- `GET /public/receipts/:token` in `routes/public.ts`, same rate-limiter shape as `/public/students/lookup` (`keyPrefix: "public-receipt"`).
- Returns exactly what the existing staff-side `GET /fees/payments/:id/receipt` already returns — extract that response-shaping into a shared function both routes call, rather than duplicating the `include` shape.
- No auth — the token is the auth, same reasoning as the self-fill PIN.

### Frontend
- New route `/r/[token]/page.tsx` — server component, fetches from the public endpoint, renders the receipt: institute name, student, course, installment breakdown, amount, mode, date, receipt number.
- `@media print` stylesheet on this one page hides the app chrome entirely, prints only the receipt content — this is what turns "Print" into a de facto PDF via the browser's own print-to-PDF.
- **Print** button → `window.print()`.
- **Share** button → `navigator.share({ url, title })` with graceful fallback to a "Copy link" action (clipboard write + toast) on browsers without the Web Share API (most desktop browsers).
- Staff-side: a **"Copy receipt link"** action next to the existing receipt view in `ReceiptModal.tsx`/`ReceiptsTab.tsx`, just `${NEXT_PUBLIC_APP_URL}/r/${payment.publicToken}` behind a copy-to-clipboard button.

### Open decision (flagged earlier, still open)
Links never expire by default — a receipt is a permanent proof-of-payment. If you want a revoke path for the "sent to the wrong number" case, that's a `publicTokenRevokedAt` column and a staff-side "Revoke link" button — cheap to add now or later; doesn't need to block this phase.

### Extends to payslips later
Same exact pattern — `PayrollPayment.publicToken` → `/p/[token]` — is a near-copy-paste of this phase once it's built, so it's mentioned but not separately planned here.

---

## Phase 10.4 — Staff leave management

**Complexity: medium. New domain model, contained to one tab.**

### Placement
A fourth tab on the existing Payroll page: **`Leave`** (OWNER/ADMIN — approve/reject everyone's requests) and **`My leave`** (every staff role — submit and track their own), sitting next to the existing `Staff` / `Runs` / `My payslips` tabs. Not merged into the payroll ledger itself — see rationale above.

### Data model
```prisma
enum LeaveStatus { PENDING APPROVED REJECTED CANCELLED }

model LeaveRequest {
  id            String       @id @default(cuid())
  instituteId   String
  userId        String        // the staff member requesting
  startDate     DateTime      @db.Date
  endDate       DateTime      @db.Date   // same as startDate for a single day
  reason        String
  status        LeaveStatus   @default(PENDING)
  reviewedByUserId String?
  reviewedAt    DateTime?
  reviewNote    String?
  createdAt     DateTime      @default(now())

  institute  Institute @relation(...)
  user       User      @relation("LeaveRequester", ...)
  reviewedBy User?     @relation("LeaveReviewer", ...)

  @@index([instituteId, userId])
  @@index([instituteId, status])
}
```

### Backend
- `POST /org/leave` — any authenticated staff role, creates a `PENDING` request for `req.user!.id`. Validates `endDate >= startDate`.
- `GET /org/leave/mine` — the requester's own history.
- `GET /org/leave` — OWNER/ADMIN, all requests for the institute, filterable by status.
- `PATCH /org/leave/:id` — OWNER/ADMIN, transitions `PENDING → APPROVED/REJECTED` with an optional note. A staff member can `PATCH` their own `PENDING` request to `CANCELLED` (withdraw before review) — nobody else's, and never after it's been reviewed.
- Overlap check: warn (not block — staff can still explicitly approve a double-booking, e.g. a planned substitute) if a new request's date range overlaps an already-`APPROVED` request for the same user.

### What this phase deliberately does NOT do
- **No automatic payroll deduction for unpaid leave.** `FIXED` salary is unaffected by an approved leave request in this phase — that's a policy decision (some institutes pay full salary regardless, some deduct per-day) that needs your input before it's encoded into the payroll engine. Flag it as phase 10.4b once you've decided the policy; building the wrong deduction rule is worse than building none yet.
- **No calendar/team-view of who's out today.** Worth having eventually (a small "Away today" widget on the dashboard), but out of scope for the first cut — the approval workflow is the actual ask.

### UI
- `My leave` tab: a simple request form (date range picker, reason textarea) + a status list (color-badged PENDING/APPROVED/REJECTED/CANCELLED, matching the badge-tone conventions already used everywhere else in the app — e.g. `WhatsAppTemplateStatus`'s `STATUS_TONE` map).
- `Leave` tab (managers): a table of all requests, filterable by status, with inline Approve/Reject actions — same interaction shape as the existing payroll-run approve/reopen actions, so it feels native to the page rather than bolted on.

---

## Phase 10.5 — Export coverage (§9e follow-through)

**Complexity: low. Mechanical — no schema changes, one shared frontend component, N nearly-identical backend routes.**

`changes-phase9.md` §9e asked for per-module CSV export on Students/Fees/Attendance/Expenses. Checking the actual code: **only Expenses has one** (`GET /expenses/ledger/export.csv`). `GET /students/roster.csv` looks like a students export but isn't — it's a narrow self-fill-PIN handout sheet, unrelated to a real student directory export. Fees, Attendance, and Payroll have nothing at all.

### Scope for this phase

| Module | Export | Content |
|---|---|---|
| Fees | `GET /fees/payments/export.csv` | Receipt no., student, mode, date, amount — the payment history an owner hands to their accountant. Date-range filterable, same as the ledger. |
| Fees | `GET /fees/accounts/export.csv` | Student, course, final fee, paid, balance — the accounts-list view, as a snapshot (no date range; a balance is a point-in-time fact). |
| Students | `GET /students/export.csv` | The real directory: name, code, class, batch, phone, parent phone, status. A new route — must not be confused with `roster.csv`, which stays exactly as it is (different feature, different data, already correctly scoped). |
| Attendance | `GET /attendance/daily/export.csv` | The daily-summary view (time, batch, subject, faculty, expected/present/absent/marked) for whatever date is selected on screen. |
| Payroll | `GET /payroll/runs/:id/export.csv` | One run's line items — matches what a run's detail view already shows. |

**Held for your confirmation, not built yet:** Distribution, Enquiries, and Admissions weren't part of this discussion's scope decision — say if you want them added and what each should contain before I design those three; everything above is enough to act on now.

### Design

- **Role gate:** `OWNER`/`ADMIN` on every new route — matches the precedent Expenses already shipped, per your call.
- **Backend:** each route is `parseDateRange` (already exists, extracted from Expenses in the pass-2 cleanup) where a date range applies, a read using the same query the on-screen view already runs, then `toCsv()` — no new library, no new pattern, exactly the shape `expenses.ts` already proves out.
- **Frontend — one new shared component**, `ExportButton`, since the interaction is identical everywhere:

  ```tsx
  <ExportButton path="/fees/payments/export.csv" filename="payments.csv" title="Export payment history as CSV" />
  ```

  A minimal icon button (download-arrow glyph, no label text — "minimal" per the ask), native `title` attribute for the tooltip rather than a new Tooltip primitive — this app has no tooltip component today, and a single `title="…"` attribute is the right amount of infrastructure for "hover to see what this does," not a reason to invent one. Internally calls the existing `apiDownload()` (already correct — checks `res.ok` before touching `res.blob()`, confirmed while looking into the reported bug, which turned out to already be fixed) and shows a spinner state on the icon while the request is in flight, matching the existing `Export CSV`/`Exporting…` text-button pattern on the Ledger tab, just iconified.
- **Placement:** each page's existing header/toolbar row, next to whatever filter controls that page already has (date pickers on Fees/Attendance, nothing extra needed on Students/Payroll).

### Build order

1. `ExportButton` component — build once, reused four times, nothing depends on backend routes existing yet (it's just a fetch-and-download wrapper).
2. Fees payments + accounts routes (2 routes, same file, same patterns as `expenses.ts`).
3. Students directory route (deliberately separate from `roster.csv` — different query, different auth reasoning, don't touch the existing one).
4. Attendance daily-summary route.
5. Payroll run-detail route.
6. Verify: each export's CSV matches what's on screen; cross-institute isolation holds (can't export another institute's data by guessing an ID); confirm large exports don't need pagination yet (check realistic row counts for your actual institutes before assuming this needs streaming — the original §9e note flagged this as a "check before building" item, not an assumed requirement).

---

## Phase 10.6 — Student portal  ✅ built

**Complexity: highest of any phase this round. New login surface, new dedicated management page, new access-gating logic, a full student-facing read UI, and a reminders/notifications layer on top.** Both open questions from the original draft are now settled (see "Decisions" below) — this section is the detailed, build-ready version.

### Decisions (settled)

1. **Management page placement:** its own top-level nav item, `/portal-access`, living in the **Organization** section of the sidebar directly below **Settings** — not nested under Academics. Rationale: it's an administrative/config concern scoped to `OWNER`/`ADMIN` only, exactly like Settings, and unlike Academics (which `RECEPTION` also has access to). Grouping by *role scope*, not by *subject matter*, is the better fit here.
2. **Who can issue/resend/edit-email:** `OWNER` and `ADMIN` only, confirmed. `RECEPTION` is not included.

### Access model

- **No auto-creation, ever.** A new admission never gets a login. Staff always create it explicitly from the management page.
- **Gating is course-only** — `Course.portalEnabled` is the single flag. No separate institute-wide switch (redundant: turning off every course's flag already achieves "portal off for this institute").
- **Login:** one account per student, role `STUDENT` — confirmed never instantiated anywhere in the codebase today. Parent and student share the one login; no separate parent role.
- **Credentials:** email + temp password, identical shape to the existing staff-invite flow (`mustChangePassword: true` forces a change on first login). Forgot-password reuses the existing OTP flow unmodified.
- **Course changes:** there is currently no way to change a student's course at all (`PATCH /students/:id` can't touch `courseId`). So the "moves to a course without/with portal access" scenario can't happen yet through any existing route — but the design must not assume it never will. Access status is **computed live** from current facts on every read/auth check, so the moment a course-change mechanism exists (this phase or a later one), the derivation is already correct with zero additional wiring. **History is never touched by any of this** — `AttendanceRecord`, `TestResult`, `Payment`/`FeeInstallment` all key off `studentId`, which never changes, so nothing about login status can ever erase or hide past records.

### Data model

```prisma
// Course
portalEnabled Boolean @default(false)

// Student
userId                  String? @unique  // link to the login, once one exists
portalIssuedForCourseId String?          // which course the CURRENT/last-issued
                                          // credential was generated for — compared
                                          // against the student's live courseId to
                                          // detect "this needs re-issuing"
```

No stored status enum — status is a pure function of `(student.userId, student.courseId, student.portalIssuedForCourseId, course.portalEnabled, user.isActive)`, the same "derive, don't store" principle already used for `FeeInstallment` and `DistributionReceipt` status elsewhere in this codebase.

### Status derivation (computed on every read, never stored)

| userId | portalIssuedForCourseId vs. current courseId | course.portalEnabled | Status shown |
|---|---|---|---|
| none | — | false | **Not eligible** — nothing to do |
| none | — | true | **Pending** — "Send credentials" |
| set | matches | true, user active | **Active** |
| set | matches | false (course toggled off since) | **Not eligible** — login blocked at auth time, history intact |
| set | **differs** (course changed since issue) | true | **Pending** — needs re-issue for the new enrollment; old login blocked meanwhile |
| set | differs | false | **Not eligible** |

**Enforcement, not just labeling:** `authenticate` middleware gets one more live check for `role === "STUDENT"` — same pattern as the existing institute-suspension re-check — reject the request if the linked student's current course doesn't have `portalEnabled`, or if `portalIssuedForCourseId !== student.courseId`. One extra `select` folded into the same query that already loads the user row — no second round trip.

### Backend — schema & access

- `PATCH /academics/courses/:id` gains `portalEnabled` (existing route, one more field).
- `GET /portal-access` — the management page's data source: every course → its batches → its students, each with computed status. One institute-scoped query set (join across `Student`/`User`/`Course`, grouped in memory), not N+1 per student.
- `POST /students/:id/portal-login` — OWNER/ADMIN only. Allowed when status is **Pending**. Creates the `User` row on first issue, or rotates password + reactivates + updates `portalIssuedForCourseId` on a re-issue after a course change. Sends the credential email, `mustChangePassword: true`.
- `POST /students/:id/portal-login/resend` — regenerates temp password and re-sends, same mechanics as the existing staff `resend-invite`. Available any time a login exists.
- `PATCH /students/:id/portal-login/email` — updates `Student.email` and, if a login exists, the linked `User.email` in the same transaction. Rejects cleanly if the new email is already in use by another `User`.
- `POST /academics/courses/:id/portal-logins` — bulk issue to every currently-**Pending** student in the course ("send creds to all of 12th"). Returns a per-student result list (issued / already had one / failed), not all-or-nothing.

### Backend — student-facing read endpoints

Each scoped to `req.user!.studentId` (the linked student row), read-only, tenant-scoped as usual:

- `GET /portal/dashboard` — summary card data: attendance % (current course/batch), next 2–3 upcoming lectures, latest test result, current fee balance/next due date. One combined endpoint so the landing screen is a single round trip.
- `GET /portal/timetable` — upcoming (and recent past) lectures for the student's current batch: subject, faculty, date/time, cancelled state, test flag.
- `GET /portal/tests` — every `TestResult` for the student (their own marks only — never other students'), joined to `Test` for title/totalMarks/passingMarks, plus scheduled-but-not-yet-held tests for their batch (from `Lecture` where `kind = TEST` and no result yet) shown as "upcoming."
- `GET /portal/attendance` — per-lecture attendance history + rolling attendance-rate stat, reusing the existing attendance-rate calculation already used on staff-facing pages.
- `GET /portal/fees` — `FeeAccount`/`FeeInstallment` status and `Payment` history for the student, same shape as the staff fee-account view, read-only.
- `GET /portal/notifications` + `PATCH /portal/notifications/:id/read` — the student's own `Notification` rows (see reminders section below), newest first, with unread count for a badge.

### Reminders / notifications for students (new requirement — folded into 10.6)

The existing `Notification` model (`notifications` table: `instituteId, userId, type, title, body, metadata, readAt`) already supports exactly this — it's keyed by `userId`, which a `STUDENT` login now has, so no schema change is needed here. This becomes the **in-app** channel for the student portal; WhatsApp to `parentPhone` (via the existing `dispatchMessage()`/`OutboundMessage` pipeline from 10.2) is the **out-of-app** channel for the same events, for institutes without portal adoption yet or for redundancy. Both fire from the same trigger points, so nothing is duplicated in application logic — one notify-call per event, fanning out to whichever channels apply.

Four event types, each hooked into an **existing** write path (no new polling/cron needed for any of these — deferred/scheduled sweeps stay out of scope per the 10.2 decision):

1. **Fee alerts** — hook into the point where an installment becomes overdue and/or a payment is recorded. Reuses `FEE_OVERDUE_REMINDER`'s existing trigger shape (already wired for staff-facing WhatsApp copy in `DefaultersTab`); extend the same dispatch call to also write a `Notification` row for the student's `userId` when one exists, and to target `parentPhone` via WhatsApp when a template is configured. No new scheduled sweep — this fires the same way "reminders" fire today (on overdue detection at read time, or on payment-record). The full automatic overdue *sweep* stays explicitly deferred per the existing 10.2 note; this only rides the same trigger points already agreed on, it doesn't introduce the sweep.
2. **Test results** — hook into `TestResult` creation/bulk-entry (existing marks-entry route). The instant marks are entered for a student, write a `Notification` ("Your marks for {test.title}: {marksObtained}/{totalMarks}") and optionally dispatch WhatsApp to `parentPhone`. Visible to the student going forward via `GET /portal/tests`.
3. **Upcoming lectures** — hook into `Lecture` creation (already dispatches `LECTURE_SCHEDULED` to staff/WhatsApp per the `MessageTemplateType` enum) and cancellation (`LECTURE_CANCELLED`, same). Extend both existing dispatch calls to also notify every enrolled-and-portal-active student in that batch. This reuses the exact trigger that already exists for those two enum values — no new schedule-watching logic.
4. **Test/exam details** — a `Lecture` with `kind = TEST` linked to a `Test` is really "test scheduled," which is already covered by event 3 (`LECTURE_SCHEDULED` firing for a TEST-kind lecture) plus the richer detail (title, totalMarks, instructions, paper if attached) surfaced via `GET /portal/tests`'s "upcoming" list. No separate trigger needed — the notification body for a TEST-kind lecture includes the test title instead of just "lecture," and the portal's Tests screen has all the detail.

This keeps the reminder system a straightforward extension of dispatch points that already exist (`dispatchMessage()` call sites for `LECTURE_SCHEDULED`/`LECTURE_CANCELLED`/`PAYROLL_PAYMENT_RECORDED`, plus the marks-entry route and the existing overdue-read path) rather than a new background job — consistent with 10.2's scope (dispatcher core only, no new sweep).

**`MessageTemplateType` gains one new value:** `TEST_RESULT_ENTERED` (marks-entry trigger, event 2 above) — `FEE_OVERDUE_REMINDER`, `LECTURE_SCHEDULED`, `LECTURE_CANCELLED` are reused as-is with a wider recipient set (student `userId` + `parentPhone`, not just staff-facing copy).

### Frontend — management page

- New page at `/portal-access`, nav item in the Organization section below Settings, `OWNER`/`ADMIN` only (route-guarded the same way `/settings` already is).
- Courses as expandable sections → batches → students, each row with a status badge (Not eligible / Pending / Active) and actions: **Send credentials** (Pending only), **Resend** (Active only), **Edit email** (always, inline). Course-level **"Send to all pending"** bulk action, showing the per-student result list (issued/skipped/failed) after running.
- Fully responsive: collapses to a stacked list below the table breakpoint, matching every other list page in the app (Students, Subscriptions, etc.).

### Frontend — student portal shell

- A distinct, simplified nav shell for the `STUDENT` role, gated on login by the same `authenticate` eligibility check — mobile-first, since a parent/student opens this on a phone far more often than a laptop.
- Sections: **Dashboard** (the combined summary from `GET /portal/dashboard` — attendance %, next lectures, latest result, fee balance, unread notification badge), **Timetable**, **Tests** (past results + upcoming scheduled tests with full detail), **Attendance**, **Fees**, **Notifications** (the reminders feed, mark-as-read).
- Reuses existing display components (attendance-rate stat cards, installment-status badges, `Badge`/`StatCard`) rather than rebuilding them, so it reads as the same product, not a bolted-on portal.
- First-login flow: temp password → forced change via the existing `mustChangePassword` mechanism, no new UI needed there.

### Performance

Every portal read is scoped to one student/batch, same cost shape as existing staff pages. The `authenticate` live-eligibility check for `STUDENT` is one extra `select` folded into the existing user-row query. The four notification hooks each piggyback on a write that already happens (lecture create/cancel, marks entry, overdue read/payment record) — no new polling or scheduled job.

### Risk / build order

1. Schema (`Course.portalEnabled`, `Student.userId`/`portalIssuedForCourseId`, `MessageTemplateType.TEST_RESULT_ENTERED`) + status-derivation helper — testable in isolation, no routes yet.
2. `authenticate` STUDENT-eligibility live check.
3. Credential issuance + resend + email-change + bulk-issue routes — testable with curl against one manually-picked student before any UI exists.
4. Management page (`/portal-access`) UI.
5. Five student-facing read endpoints + notification hooks into the four existing trigger points.
6. Student portal shell UI (Dashboard/Timetable/Tests/Attendance/Fees/Notifications), mobile-first.

Each step is independently testable and shippable — nothing in steps 4–6 blocks on the others being UI-complete.

---

## What I need from you before starting any phase

1. **10.1** — none, this can start immediately whenever you say go.
2. **10.2** — confirm you have (or will have, before testing) a live Meta WABA connected with at least one APPROVED template, or the phase builds correctly but can't be end-to-end verified until that exists.
3. **10.3** — the never-expire-vs-revocable-link decision (default: never-expire, flag if you want revoke).
4. **10.4** — nothing blocking; unpaid-leave payroll deduction is explicitly deferred to a 10.4b once you've decided the policy.
5. **10.5** — confirm the email-first credential delivery is fine to start (per your last message, yes) and whether automatic-login-at-admission is wanted in the first cut or the manual button alone is enough to start with.

Say which phase to start, same as every phase before this one.
