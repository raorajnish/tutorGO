# Addendum — Phase 8: Installment settlement, inactive-course guards, reminders, distribution tracking, self-service admission links

> Five independent features requested together; grouped here as one addendum but built and
> shipped as **separate phases (8a–8e)**, each smoke-tested on mobile viewport widths before
> moving to the next. One item (subject-wise fees, §8c) is explicitly a design note only, not
> scheduled for a build order — flagged as deferred per the request.
>
> **Status: 8a, 8b and 8d are IMPLEMENTED (2026-08-28).** 8c, 8e, 8f are still planning only.

## Status: 8a — Installment settlement — DONE

Went through two design revisions before landing (both driven by real testing, not upfront
guesswork):

1. First pass: a toggle-based "settle and carry forward" option layered on top of the existing
   multi-installment waterfall allocator.
2. Simplified to: carry-forward unconditional, no toggle, but still using the waterfall allocator
   underneath — so one payment could still span and close *multiple* installments in a single
   request.
3. **Final design, after a real payment (₹14,000 against a student named Aditya's plan) exposed
   that (2) was wrong**: a single payment closing two installments in one shot didn't match "pay
   ₹14,000, see it as one ₹14,000 installment" — it produced two separate closed rows instead. Per
   explicit user decision, rebuilt around **"one payment always closes exactly one
   installment"**:
   - A payment targets only the earliest open (unwaived, `paidAmount < amount`) installment.
   - Whatever the payment amount is becomes that installment's final `amount` **and**
     `paidAmount` — it always closes at exactly what was paid, whether that's less or more than
     originally quoted. Never left "PARTIAL."
   - The difference vs. the installment's original quoted amount shifts to what comes after it:
     - **Underpaid** (diff < 0): the shortfall is added to the next installment's `amount`
       (`adjustedFromPrevious: true`), or a new installment is auto-created if none is left
       (`dueDate` one billing cycle after the last one, via `account.billingDay` or the last
       installment's day-of-month).
     - **Overpaid** (diff > 0): the excess is deducted from later installments in `seq` order,
       cascading across as many as needed — an installment fully absorbed is **deleted outright**
       (not left as a misleading `amount: 0, status: PAID` ghost row), the next one takes the
       remainder. Upfront validation (`payment ≤ totalOutstanding` across the whole plan)
       guarantees the cascade always has enough later installments to absorb the excess.
   - A payment now always produces exactly **one** `PaymentAllocation` row (previously could be
     several, one per installment the waterfall touched).
   - `services/waterfallAllocation.ts` (used by Payroll) is untouched — Fees no longer uses it at
     all; the multi-target waterfall was the wrong shape for what Fees actually needed.
   - `backend/prisma/schema.prisma`: `FeeInstallment.adjustedFromPrevious Boolean @default(false)`
     — display-only hint, never read for any calculation.
   - `backend/src/routes/fees.ts` `POST /payments` response includes an optional `carryForward`
     object: `{ direction: "shortfall" | "overpay", amount, entries: [{ installmentId, seq,
     dueDate, amount, created, removed }] }`.
   - Frontend: `RecordPaymentModal.tsx` shows a one-time confirmation banner describing what
     happened (grown/shrunk/created/removed) before closing; `InstallmentList.tsx` shows a
     neutral "Adjusted" badge (table + mobile card view, tooltip is direction-neutral) on any
     installment whose amount changed as a side effect of a neighboring installment's settlement.

**Voiding a payment is temporarily disabled** (`POST /payments/:id/void` now always returns 400,
and the frontend hides the action entirely). Reason: a payment's settlement can now grow, shrink,
create, or delete *other* installments beyond the one it directly allocates to, and none of that
is currently reversible — the old void logic only ever reversed `paidAmount` on the allocations it
knew about, which would leave the plan's amounts corrupted (referencing deleted installments,
wrong amounts) once carry-forward is in the picture. Re-enabling needs a stored snapshot of every
side effect a payment caused so void can replay it in reverse — not built this pass, flagged as
follow-up work if voiding needs to come back.

**Also fixed, found during 8a testing (unrelated pre-existing bug)**: `Payment.receiptNumber` was
`@unique` **globally** across all institutes, while `ReceiptCounter` (the thing that generates it)
was always scoped `[instituteId, yearMonth]` — so two *different* institutes' first payment in the
same month collided on the same receipt number and the second one failed with a 500. Changed to
`@@unique([instituteId, receiptNumber])`, matching the counter's actual scope. Applied to the dev
DB with explicit user consent (Prisma's dangerous-migration guard requires it); confirmed no
existing rows shared a `(instituteId, receiptNumber)` pair, so nothing was lost. Verified at the
Postgres index level post-migration (`payments_instituteId_receiptNumber_key` on
`(instituteId, receiptNumber)`, the old global index gone).

**Testing**: verified end-to-end against a running server (demo institute, real HTTP calls, not
mocked, no shortcuts) — including an exact reproduction of the real Aditya scenario that exposed
the design flaw (9,000/9,000/9,000 plan, pay 5,000 then 14,000 → installment 1 closes at 5,000,
installment 2 closes at exactly 14,000 in one allocation, installment 3 absorbs the 1,000 overpay
down to 8,000, total stays 27,000). Also covered: underpay onto an existing next installment;
underpay on the last installment (auto-creates one); exact payment (no-op); overpay cascading
across *multiple* later installments including one fully absorbed and removed; paying beyond the
total plan balance (still rejected outright); void refusing with a clear message. In every
scenario the **sum of installment amounts on the plan was confirmed unchanged** — settlement only
ever redistributes, never inflates total fees owed. `tsc --noEmit` clean on both frontend and
backend; ESLint clean on every file touched.

## Status: 8b — Inactive-course guards — DONE

Audited every course-fetching call site in the frontend (12 total). Backend: `GET
/academics/courses` gained `?active=true` (filters `isActive: true`; omitted = unfiltered,
unchanged default). Applied per-site based on what the fetch is actually for:

**Filtered to `active=true`** (picking a course to create something new against):
`EnquiryModal.tsx` (via `enquiries/page.tsx`), `AdmitModal.tsx` (via `admissions/page.tsx`),
`FeeStructuresTab.tsx`, `ScheduleLectureModal.tsx`, `ScheduleTestModal.tsx`.

**Left unfiltered — genuinely need inactive courses visible**:
- `CoursesTab.tsx` (management view) — already showed an Active/Inactive badge and an
  editable `isActive` checkbox that doubles as reactivate; nothing to change.
- `fees/page.tsx`'s course filter — filtering the *existing* student list by course; a
  student already enrolled in a since-deactivated course must stay findable.
- `BatchesTab.tsx` and `SubjectsTab.tsx`'s top-level "filter by course" dropdowns — same
  reasoning, existing batches/subjects linked to an inactive course must stay filterable.
- `FacultyAssignmentModal.tsx`'s course fetch — same list backs both new assignments and
  showing existing ones.

**The tricky bit — editing something that already references an inactive course**: several of
these components support both "pick a course for something new" and "show/edit something that
already has a course picked," and those two need different course lists from the very same
fetch. Two patterns used, both new:

- `frontend/src/lib/courses.ts` — `courseOptions(courses, current)`: for single-select
  `Dropdown`s. Builds options from the (already active-filtered) list, and if the
  currently-selected course (an `editing` record's course) isn't in that list, appends it
  labeled "— inactive" so the dropdown never silently blanks out a valid existing selection.
  Used in `EnquiryModal.tsx` (editing an enquiry), `AdmitModal.tsx` (admitting from an
  enquiry whose course may have since been deactivated).
- Inline `pickableCourses = courses.filter(c => c.isActive || <currently linked/assigned>)`
  — for multi-select checkbox grids, where the "current" state isn't one value but a set.
  Used in `SubjectsTab.tsx`'s course-linking checkboxes, `BatchesTab.tsx`'s single course
  `Dropdown` (same idea, inline rather than via the helper since it also needed a distinct
  "— inactive" label style), and `FacultyAssignmentModal.tsx`'s per-course assignment
  checkboxes (critical here specifically — filtering the fetch itself would have silently
  *unassigned* a faculty member from a deactivated course on next save, not just hidden it).

**Testing**: verified end-to-end against a running server — created a course (defaults
active), confirmed it appears in both `GET /academics/courses` and `?active=true`; deactivated
it, confirmed it still appears unfiltered (marked inactive) but disappears from `?active=true`;
reactivated it, confirmed it reappears. `tsc --noEmit` clean on both frontend and backend,
`next build` production build clean, ESLint clean on every file touched.

---

## Status: 8d — Scheduled reminders — DONE

Built as `ScheduledReminder` + `services/reminderScheduler.ts` + `routes/reminders.ts` +
a **Reminders** tab under Settings. Diverged from the original plan in several ways, all
driven by things found while building:

**Naming — there was already a "reminder".** `POST /org/reminders` (backing
`SendReminderModal.tsx`) broadcasts an ad-hoc message to team roles *immediately* and stores
nothing, using notification `type: "REMINDER"`. That's a different concept from a dated
obligation with lead times, so the new one is `ScheduledReminder` end-to-end and emits
`type: "SCHEDULED_REMINDER"`. The two never collide.

**Multiple lead times per reminder, not one.** Requested mid-build: a single reminder nudges at
90 / 30 / 15 / 7 / 1 days (any subset, plus custom values), so `leadDays` is `Int[]`, stored
sorted descending. Crossing several thresholds at once — a reminder created five days before a
deadline that has 90/30/7 configured — sends **one** notification, not a burst of stale ones.
`WEEKLY` was added to `ReminderRepeat` alongside MONTHLY/QUARTERLY/YEARLY.

**Audience, because "what if the admin wants a reminder for themselves?"** `ReminderAudience`
is `PRIVATE` (default) or `ADMINS`. PRIVATE reaches only its creator and is invisible to
everyone else — including the OWNER, who gets a 404 rather than a 403 when touching one, so the
API never confirms it exists. ADMINS reaches the creator, every active ADMIN, and the
organization OWNER — fetched via `institute.organization.ownerId`, because an OWNER's
`User.instituteId` is null by design and filtering users by institute would silently miss them.
PRIVATE is the default deliberately: a reminder someone sets for themselves must not silently
notify their boss.

**Scheduler: an in-process ticker, no new dependency.** Deploy target is Render or a VPS —
both long-running Node processes — so `startReminderScheduler()` runs from `server.ts` (not
`app.ts`, so importing the app in tests/scripts never starts background work). It's a
`setInterval` that re-asks "what's due?" rather than a cron firing at a fixed instant:
a cron silently misses everything if the process is restarting or asleep at that moment, which
is exactly what Render does. Hourly by default (reminders resolve to whole days, so firing
within an hour of midnight is indistinguishable to a user, at a quarter the polling cost of
15-minute ticks); `REMINDER_SCHEDULER=off` and `REMINDER_SCHEDULER_INTERVAL_MINUTES` override.

**Performance — the part that needed the most care**, since this runs forever on a timer and
its cost must stay flat as institutes are added:
- The natural predicate (`dueDate - leadDays <= today`) is a per-row computation no index can
  serve — a first cut table-scanned every active reminder in every institute on every tick.
  Fixed by storing the scheduler cursor: `nextNotifyOn` (the next unfired notification's date)
  and `nextNotifyLead`, both always rewritten alongside `dueDate`/`leadDays` via
  `reminderNotifyFields`, so they can't drift from what they're derived from.
- Because lead times fire largest-first, the pending one implies the rest — every larger lead
  has fired, every smaller one hasn't — so a single cursor replaces any per-lead history.
- `nextNotifyOn` goes NULL once a cycle is fully notified, which drops finished reminders out
  of the index range entirely. Without that, every long-past one-off reminder would stay in the
  result set forever and eventually crowd genuinely-due rows out of the query's row limit.
- `@@index([isActive, nextNotifyOn])` covers the hot query end-to-end; verified with `EXPLAIN`
  (`Index Cond` on both columns, index order satisfying the sort, no Sort node). `take: 500`
  bounds a pathological backlog across passes.

**Concurrency.** Render can run more than one instance, so firing is an atomic compare-and-set:
the UPDATE only matches while the cursor still holds the value that was read, so exactly one
instance claims each fire and the others no-op. Claiming *before* delivering means a crash
mid-delivery can drop a notification — the right trade against notifying everyone twice.
Verified by running three passes concurrently and asserting exactly one notification.

**Other decisions**: not module-gated (`requireModule` is a closed union of six billable
modules; reminders aren't one, and every institute has bills) — role-gated `OWNER`/`ADMIN`
instead, matching the Expenses precedent. `DELETE` is a hard delete, unlike
Course/Subject/Batch's soft delete: nothing references a reminder, so no history becomes
unreadable, and `isActive` already covers "pause without losing it". Firing order is
fire-then-roll-forward, so a reminder whose date passed during downtime still notifies late
rather than being silently advanced past. `NotificationDrawer` needed no changes — it renders
`title`/`body` generically.

**Testing**: two suites, both against the real database, then deleted.
- Scheduler logic with simulated time (`runDueReminders(now)` takes the clock as a parameter):
  lead-day normalisation; cursor arming/advancing/clearing; a 4-lead reminder firing exactly
  once at each of 90/30/7/1 and not re-firing in between; catch-up sending one notification for
  three missed thresholds; weekly rollover re-arming the next occurrence; a 100-day-stale
  weekly reminder advancing to a future date without spinning; paused reminders never firing;
  PRIVATE vs ADMINS recipients (including the OWNER whose `instituteId` is null); three
  concurrent passes producing exactly one notification; send-now consuming the pending lead so
  the scheduler doesn't duplicate it an hour later; and the `EXPLAIN` index check.
- API: create/validate/edit/pause/delete, lead-day de-duplication and sorting, `includeInactive`
  filtering, send-now delivery landing in the notifications feed, paused reminders refusing
  send-now, and cross-user isolation (OWNER can neither see nor edit another user's PRIVATE
  reminder, and gets a 404 rather than a 403).

`tsc --noEmit` clean both sides, `next build` clean, ESLint clean on every file touched.

**Renamed alongside this**: the pre-existing broadcast (`POST /org/reminders`, Settings → Team)
is now labelled **"Send announcement"** rather than "Send reminder", so the two features stop
reading as the same thing. User-facing copy only — no API, route or data changes. The two are
deliberately kept separate: the announcement is *you* messaging staff now (any roles, free-text
body, nothing stored); a reminder is *a date* messaging you later (scheduled, recurring,
persistent). Rule of thumb: if you initiate it, it's an announcement; if the calendar initiates
it, it's a reminder.

**Not built** (flagged, not silently skipped):
- A `CRON_SECRET`-guarded HTTP endpoint for the scheduler. Only needed on a serverless host,
  which Render/VPS isn't — on record if the deploy target ever changes.
- **Role targeting on reminders (deliberate non-goal).** Reminders can go to "Only me" or "Me,
  the owner & all admins" — they cannot target faculty/reception. This was considered and
  explicitly rejected: reminders exist so *one person* doesn't forget their own obligations
  (electricity, rent, AMC, painting), and adding a role picker would put a staff-broadcast
  decision in front of someone every time they note down a bill. Scheduling a message *to
  staff* is a genuinely different feature — announcements already do the role targeting, just
  not on a schedule. If "remind all faculty the day before a meeting" ever actually comes up,
  build it then; don't pre-emptively widen `audience`.

---

## Cross-cutting: mobile responsiveness

Most users are on phones, so every new screen in 8a–8e is designed mobile-first, not adapted
after the fact:

- Any new modal follows the existing `ui/Modal.tsx` pattern (already full-bleed sheet on narrow
  viewports) — no new modal component invents its own breakpoint behavior.
- Any new table (distribution rosters, reminder lists) needs a card-list fallback below `sm`
  (640px), matching how `DefaultersTab.tsx`/`ReceiptsTab.tsx` already collapse — reuse that
  pattern rather than a new one.
- Forms with many fields (admission form, reminder setup) are single-column, large touch targets
  (44px min), and split across steps rather than one long scroll where the existing patterns
  (`AdmitModal`, `SetupFeeAccountModal`) already do this.
- The one genuinely new surface — the **public admission form** (§8e) — has no sidebar/app-shell
  at all and must be tested on an actual phone browser (not just devtools) since it's the one
  screen used directly by students/parents, not staff.
- Each phase's "Build order" ends with an explicit mobile pass at 360px/390px widths (common
  Android/iOS widths) in addition to the usual desktop smoke test.

---

## 8a. Installment settlement — carry partial payment forward instead of tracking "partial"

### The problem

Today, paying ₹10,000 against a ₹15,000 installment leaves that installment sitting at
`paidAmount=10000, amount=15000` forever — derived status shows "partial," and the ₹5,000 keeps
being owed *against that same installment* until topped up. The ask: treat the ₹10,000 as a
**closed installment in its own right** (for that due date), and push the ₹5,000 shortfall onto
the *next* installment (creating one if none exists), rather than leaving the original one
half-paid indefinitely.

### Design decision needed before building (flagging, not deciding silently)

A partial payment is ambiguous — it could mean "I'll top this same installment up later" (today's
behavior, still legitimate for a student who pays in two trips to the same due date) or "just
settle what I've got now as done, roll the rest forward" (the new ask). Recommend **not**
changing the default behavior of `POST /payments` silently, since that would make every
already-recorded partial payment retroactively ambiguous and would surprise anyone relying on
"partial today, topped up tomorrow, same installment" for legitimate short-term catch-up. Instead:

- Add an explicit action at payment-recording time — a checkbox/toggle in `RecordPaymentModal`,
  **"Treat as full settlement for this due date — carry the balance to the next installment"**
  (off by default). Recommend defaulting it **on** for amounts that don't exactly cover the
  targeted installment, since that matches what was asked for as the *normal* case — but that's
  the one call worth confirming before coding, since it changes existing partial-payment behavior
  for everyone, not just this new flow.
- When toggled: after the waterfall allocation settles as much of the targeted installment as the
  payment covers, the *shortfall* (`installment.amount - paidAmount`) is subtracted from that
  installment's `amount` (closing it exactly at what was actually paid — `paidAmount === amount`,
  so it now reads "paid" under the existing derived-status logic, no schema change needed there)
  and **added onto the next unpaid installment's `amount`** (by `seq` order, first one with
  `paidAmount < amount` and not `waived`). If none exists, auto-create a new one: `seq = max(seq)
  + 1`, `dueDate` = last installment's `dueDate` plus the account's installment interval (reuse
  whatever cadence `POST /accounts` used to generate the original schedule — monthly by default
  per `FeeStructure.planType`), `amount` = the shortfall.
- This is a pure extension of the waterfall allocator, so do it as part of the extraction already
  flagged as owed work in the Payroll addendum (§9, "extract to `services/waterfallAllocation.ts`
  before building on top of it") — this is the first real consumer that needs that extraction, so
  do the extraction as step 1 of this phase rather than deferring it further.

### Data model

No new tables. `FeeInstallment.amount` becomes mutable after creation in this one new case
(previously only touched by explicit reschedule/edit-amount actions) — record the adjustment
transparently: reuse the existing edit-amount audit path if one exists in `fees.ts` (check before
building; if amount edits aren't already audited anywhere, don't add new audit infrastructure just
for this — the `Payment`/`PaymentAllocation` rows already provide the paper trail for *why* an
installment's amount changed, since the shortfall is traceable to the specific payment that caused
the split).

### API surface

- `POST /payments` gains an optional `settleAndCarryForward: boolean` (or similar) input,
  validated only when the payment doesn't fully cover the targeted installment(s) — a no-op flag
  otherwise.
- No new endpoints. `GET /accounts/:studentId` response is unchanged in shape (installments list
  already reflects whatever `amount`/`paidAmount` currently are).

### Frontend

- `RecordPaymentModal.tsx`: add the toggle, with inline copy explaining the effect ("₹5,000 will
  be added to the next installment due <date>, or a new installment will be created").
- `InstallmentList.tsx`: no structural change — it already renders whatever installments exist;
  a carried-forward installment just shows a slightly larger `amount` than originally scheduled.
  Worth a small visual cue (badge: "adjusted") so staff aren't confused later about why an
  installment's amount doesn't match what was quoted at signup — check whether `FeeInstallment`
  needs a boolean like `adjustedFromPrevious` for this badge, or whether comparing against
  `FeeStructure`'s per-installment default is enough; lean toward adding the boolean since the
  fee-structure default may itself have been edited independently and isn't a reliable diff base.

### Build order

1. Extract `services/waterfallAllocation.ts` out of `fees.ts` (owed from the Payroll addendum),
   confirm existing Fees behavior is unchanged (regression pass on current partial-payment flow).
2. Add `adjustedFromPrevious Boolean @default(false)` to `FeeInstallment`, additive migration.
3. Implement the carry-forward branch in the allocator: close targeted installment at paid amount,
   locate-or-create the next installment, mark it `adjustedFromPrevious`.
4. `POST /payments` accepts and validates the new flag; transactional, same guarantees as today
   (sum of allocations still ties out, cross-institute checks unchanged).
5. `RecordPaymentModal` toggle + copy; `InstallmentList` "adjusted" badge.
6. Test: pay less than an installment with the toggle on → confirm installment closes at the paid
   amount, next installment's amount increases by the shortfall (or a new one is created if it was
   the last); pay with the toggle off → confirm today's behavior (partial, unchanged) still works;
   pay more than an installment (existing overpay-rollover path) → confirm it's untouched by this
   change; mobile pass on `RecordPaymentModal` at 360px.

---

## 8b. Hide inactive courses from enquiry/subject/fee-structure creation, everywhere

### The problem

`Course.isActive` already exists (`schema.prisma:438`) and is already the pattern used by
`Subject`/`Batch`, but it isn't consistently *enforced* at every course-picking surface — an
inactive course can still be selected when creating an enquiry, adding a subject, or building a
fee structure.

### Scope — every course `<select>`/picker in the app

Audit and fix each of these (confirm current filtering state first, since some may already filter
correctly per the Explore pass's note that this wasn't fully verified):

- `EnquiryModal.tsx` — course dropdown for a new/edited enquiry.
- `AdmitModal.tsx` — course dropdown at admission time.
- `academics/FeeStructuresTab.tsx` — course selector for building a fee-structure template.
- `academics/CoursesTab.tsx` itself — the management screen should still show inactive courses
  (with a clear "inactive" badge and a reactivate action), since this is the one place staff need
  to *find* an inactive course, not hide it.
- Any subject-creation flow that's scoped to a course (`CourseSubject` linkage) — subjects
  shouldn't be addable to an inactive course.
- `students/` filters, `attendance/` batch pickers, `fees/` account setup — anywhere a course list
  is fetched for *picking one to act on going forward* should exclude inactive; anywhere it's used
  to *filter/report on existing records* (e.g. "show all students in Course X" for a course that
  was later deactivated) should still include inactive courses, since those students/records still
  exist and need to stay visible.

### Design

Prefer a single source of truth over repeating `.filter(c => c.isActive)` at each call site:
either (a) the backend course-list endpoint gains an `?active=true` query param used by every
"pick a course to create something new against" call site, or (b) a small shared frontend hook
(`useActiveCourses()`) wrapping the existing course fetch. Recommend (a) — cheaper at scale, keeps
the filtering logic in one place server-side, and matches how `isActive` filtering likely already
works for `Subject`/`Batch` pickers (confirm and reuse the same convention rather than inventing a
second one).

### Build order

1. Audit every course-fetch call site listed above; note which already filter correctly.
2. Add `?active=true` support to the course-list endpoint (if not already present) — check
   `Subject`/`Batch` list endpoints for the existing convention first and match it exactly.
3. Fix each non-conforming call site to pass `active=true` for "create new" contexts, leave
   report/filter contexts unchanged.
4. Confirm `CoursesTab.tsx` management view is unaffected (still shows inactive + badge).
5. Test: deactivate a course → confirm it disappears from Enquiry/Admit/FeeStructure/Subject
   pickers immediately, still appears (badged) in Courses management, still appears in
   student/report filters for students already enrolled in it. Mobile pass on the affected
   dropdowns (native `<select>` on mobile already handles this fine, but confirm the "inactive"
   badge in `CoursesTab` renders legibly at narrow widths).

---

## 8c. Subject-wise fees (e.g. 12th std) — design note only, not building this pass

Flagged explicitly as **not in this build's scope**, per the request. Recording the shape of the
problem now so it isn't re-derived from scratch later:

- Today `FeeStructure` is course-scoped (one fee template per `Course`). A course like "12th
  Std — Science" may need per-subject fee lines instead (Physics ₹8,000, Chemistry ₹8,000, Maths
  ₹6,000) where a student picks a subset of subjects rather than paying one course-wide fee.
- This intersects with `CourseSubject` (already links subjects to courses for Academics) and would
  need: a `FeeStructure` variant scoped to `(courseId, subjectId)` instead of just `courseId`, a
  student's `FeeAccount` generation logic that sums the selected subjects' fee lines instead of
  reading one flat `defaultFee`, and admission-time UI for picking which subjects a student is
  enrolling in (which may already partially exist via `CourseSubject` — check `AdmitModal.tsx`
  before assuming this needs new UI from scratch).
- Biggest open question: can a course be *either* flat-fee or subject-wise, or does every course
  need to declare which mode it uses? Recommend adding a `feeMode: FLAT | PER_SUBJECT` enum on
  `Course` when this is actually built, so both models can coexist without a hard migration of
  every existing course.
- Not scheduled — revisit as its own addendum when ready to build.

---

## 8d. Configurable reminders/notifications (not just system-generated ones)

### The problem

Notifications today (`Notification` model, `schema.prisma:404-421`) are only created synchronously
by other routes reacting to events (e.g. an overdue fee). There's no way for an admin to set up
their *own* reminder — "remind me 15 days before the electricity bill is due," "remind me a week
before rent," "remind me 30 days before the annual maintenance contract renews" — with a
configurable lead time.

### Data model

New model, e.g. `Reminder`:

```
model Reminder {
  id              String       @id @default(cuid())
  instituteId     String
  createdByUserId String
  title           String        // "Electricity bill", "Shop rent", "AMC renewal"
  category        ReminderCategory  // enum: UTILITY, RENT, MAINTENANCE, CUSTOM, ... — open-ended via CUSTOM + free-text `title`
  dueDate         DateTime     @db.Date       // the actual event date
  leadDays        Int          // how many days before dueDate to notify — 1, 7, 15, 30, or custom
  repeat          ReminderRepeat  // enum: NONE, MONTHLY, YEARLY — for recurring bills like rent/electricity
  notes           String?
  lastFiredAt     DateTime?    // last time a notification was actually created for this reminder+cycle
  isActive        Boolean      @default(true)
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  institute Institute @relation(fields: [instituteId], references: [id], onDelete: Cascade)

  @@index([instituteId, dueDate])
  @@map("reminders")
}
```

`leadDays` as a plain `Int` rather than an enum keeps "a day, a week, 15 days, 30 days, or
anything else" all representable without special-casing — frontend just offers the common presets
(1/7/15/30) plus a free-entry field.

For `repeat != NONE`, `dueDate` represents the *next* occurrence; once fired, a background job
advances it to the next cycle (+1 month / +1 year) rather than creating a new row each time —
keeps history simple (one row per recurring obligation, not one per year).

### Scheduler — the one genuinely new piece of infrastructure

Nothing in the codebase currently runs on a schedule (confirmed — notifications are all
synchronous). This needs an actual cron/background job:

- A daily job (`node-cron` or platform-native scheduled task, whichever the deploy target already
  supports — check hosting setup before picking a library) that, once a day, finds every active
  `Reminder` where `dueDate - leadDays <= today` and `lastFiredAt` isn't already within the current
  cycle, creates a `Notification` row (reusing the existing model — `type: "REMINDER"`, `metadata:
  { reminderId }`), and updates `lastFiredAt` (and advances `dueDate` for recurring ones once the
  *due date itself* has passed, not at fire time).
- Idempotency matters here more than anywhere else in the app so far — a job that double-fires
  sends duplicate push notifications. Guard with the `lastFiredAt`-within-cycle check plus running
  the job inside a transaction per reminder (not a bulk update), so a crash mid-run doesn't leave
  reminders in a partially-fired state.

### API surface

New `reminders.ts` router, `requireModule` gated appropriately (recommend `ADMIN`/`OWNER` only to
start, matching the Expenses precedent, since reminders are an admin/ops concern not a
teaching-staff one — confirm against who actually asked for this, "class admin," which matches):

- `GET /reminders` — list, filterable by category/upcoming.
- `POST /reminders`, `PATCH /reminders/:id`, `DELETE /reminders/:id` (or deactivate, matching the
  soft-delete convention used for `Course`/`Subject`/`Batch` rather than hard delete).
- No dedicated "fire" endpoint — the scheduler is the only writer of `Notification` rows from this
  feature; a manual "send now" action (optional nice-to-have) could reuse the same creation logic
  directly rather than going through the scheduler.

### Frontend

- New `/settings` tab or a dedicated `/reminders` module (check `navigation.ts` conventions — likely
  fits better as a Settings tab given it's low-frequency admin config, matching `TeamTab.tsx`'s
  placement) — list view (upcoming first, overdue flagged), "Add reminder" modal: title, category,
  due date, lead-time preset buttons (1d/7d/15d/30d/custom), repeat toggle.
- Fired reminders surface through the existing `NotificationDrawer.tsx` — no new notification UI
  needed, just a new `type` value it already knows how to render generically (confirm
  `NotificationDrawer` doesn't hardcode a fixed set of types before assuming this is free).

### Build order

1. Schema: `Reminder`, `ReminderCategory`, `ReminderRepeat` enums/model. Additive migration.
2. `reminders.ts` router — CRUD, gated `ADMIN/OWNER`.
3. Scheduler job — pick the library/mechanism based on actual hosting (flag this as a decision
   point requiring a look at how the app is deployed, since a serverless host needs a different
   approach — e.g. hosted cron hitting an endpoint — than a long-running Node process with
   `node-cron` built in).
4. Confirm `NotificationDrawer` renders the new `REMINDER` type without changes; add a small icon
   per category if the drawer supports per-type icons already.
5. Frontend CRUD screen + lead-time presets.
6. Test: create a reminder due in 20 days with `leadDays=15` → confirm nothing fires for 5 days,
   then fires (simulate by adjusting `dueDate` in a test DB row, don't wait 5 real days) → confirm
   `lastFiredAt` set, no duplicate fire the next day; recurring monthly reminder → confirm
   `dueDate` advances after firing and it fires again next cycle; mobile pass on the Add-reminder
   modal and drawer rendering.

---

## 8e. Distribution tracking (books, bags, T-shirts, digests, any item)

### The problem

No inventory/distribution concept exists at all (confirmed). Need a generic "we hand out N kinds
of items to students, track who's received what, per batch/course" system — not hardcoded to
"digests," since the same shape covers books, bags, T-shirts, stationery kits, etc.

### Data model

Generic item + per-student receipt, not a bespoke model per item type:

```
model DistributionItem {
  id          String   @id @default(cuid())
  instituteId String
  name        String        // "Chemistry digest", "Class T-shirt (M)", "Welcome kit bag"
  courseId    String?       // optional: scope to one course, or null = institute-wide
  totalSets   Int?          // optional stock count, if tracking quantity matters
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())

  institute Institute @relation(fields: [instituteId], references: [id], onDelete: Cascade)
  course    Course?   @relation(fields: [courseId], references: [id], onDelete: SetNull)
  receipts  DistributionReceipt[]

  @@index([instituteId])
  @@map("distribution_items")
}

model DistributionReceipt {
  id                 String    @id @default(cuid())
  distributionItemId String
  studentId          String
  receivedAt         DateTime? @db.Date   // null = still pending
  notes              String?
  updatedByUserId    String?
  updatedAt          DateTime  @updatedAt

  item    DistributionItem @relation(fields: [distributionItemId], references: [id], onDelete: Cascade)
  student Student          @relation(fields: [studentId], references: [id], onDelete: Cascade)

  @@unique([distributionItemId, studentId])
  @@map("distribution_receipts")
}
```

`receivedAt: null` = pending, matching the codebase's preference for deriving status from facts
rather than a stored status enum (same pattern as `FeeInstallment`). One `DistributionReceipt` row
per (item, student) pair is created lazily — either eagerly for every student in the item's scoped
course when the item is created, or created on first toggle (recommend eager creation, since "who
hasn't received it yet" is the whole point of the feature and needs every student represented from
day one, not just the ones already marked).

### API surface

New `distribution.ts` router:

- `GET /items` — list distribution items (with course filter).
- `POST /items` — create ("Chemistry digest" for Course X) → eagerly creates a pending
  `DistributionReceipt` for every currently-enrolled student in that course (or all students if
  institute-wide).
- `PATCH /items/:id` — rename/deactivate/adjust `totalSets`.
- `GET /items/:id/receipts` — roster view: every student, `receivedAt` or pending, filterable
  by batch.
- `PATCH /items/:id/receipts/:studentId` — toggle received/pending, optional `receivedAt`/notes.
- `POST /items/:id/receipts/bulk` — mark a list of student IDs received in one call (roster-style
  bulk action, matching Attendance's "mark all present" pattern) — worth reusing that UX directly
  since staff already know it.
- New student enrolling into a course after the item was created — needs a receipt row created
  lazily at admission time for any active `DistributionItem` scoped to that course (hook into the
  existing admission flow, `admission.ts`), so nobody's silently missing from a roster created
  after they joined.

### Frontend

New `/distribution` module (or a tab under an existing "Academics"/"Students" area — check
`navigation.ts` for where this best fits given it's cross-cutting, not tied to one existing module):

- Items list (+ "Add item" — name, optional course scope, optional total sets).
- Per-item roster view: student list with received/pending toggle, search/filter by batch,
  received-count summary ("42/58 received"), bulk "mark selected received" action — same
  card-list-on-mobile / table-on-desktop pattern as `DefaultersTab`.

### Build order

1. Schema: `DistributionItem`, `DistributionReceipt`. Additive migration.
2. `distribution.ts` router — items CRUD, roster fetch, single + bulk receipt toggle.
3. Hook into `admission.ts` — new student admitted into a scoped course gets pending receipt rows
   for that course's active items.
4. `/distribution` frontend — items list, roster view with bulk-mark, mobile card-list.
5. `navigation.ts`/`Sidebar` entry, module-gated the same way other optional modules are (check
   whether this needs its own module flag on `Institute` or can ride under an existing one — likely
   deserves its own, since not every institute distributes physical items).
6. Test: create an item scoped to a course → confirm every currently-enrolled student in that
   course gets a pending receipt; admit a new student into that course afterward → confirm they
   get one too; bulk-mark half a batch received → confirm roster counts update, unmarked students
   still show pending; deactivate the item → confirm it drops off the active list but roster
   history is preserved; mobile pass on the roster view at 360px (this is the one screen staff will
   realistically use while physically standing in a room handing out books, so it needs to work
   one-handed on a phone).

---

## 8f. Self-service admission form via shareable link + student ID lookup

### The problem

Classes already run with students attending lectures before their admission paperwork is filled
in. Today, filling in a `Student`'s full details is entirely a staff/reception task via
`AdmitModal.tsx`. The ask: generate student records with just names + auto-assigned `studentCode`
first (bulk, from an export), circulate a link (whole-institute or per course/batch), have each
student self-identify by their `studentCode` and fill in their own remaining details, and let staff
review/edit afterward.

### Flow

1. **Bulk pre-create** — staff enters just names (and course/batch assignment) for a set of
   students already attending, in bulk (paste/CSV-style entry, or one-by-one quick-add) — this
   creates `Student` rows with `studentCode` auto-assigned (existing `StudentCodeCounter` logic)
   but the rest of the profile fields empty/unfilled. Needs a way to distinguish "admitted, profile
   complete" from "pre-created, awaiting self-fill" — add `profileCompletedAt DateTime?` to
   `Student` (null = still pending self-fill).
2. **Export** — a "Print/export roster" action (per course/batch or whole institute) producing a
   PDF/Excel of name + `studentCode`, for physical handout or sharing in a class group.
3. **Circulate a link** — one link per scope (institute-wide, or per course/batch — recommend
   per-course/batch since that's what was actually asked, "single link for students or separate
   for each course/batch"). The link itself carries no student-specific token (unlike the
   `PasswordResetOtp` pattern, which is per-user) — it's a shared entry point; the student
   self-identifies by typing their own `studentCode` once they land on it.
4. **Public lookup + form** — unauthenticated page: student enters `studentCode` (+ maybe a second
   factor like DOB or phone last-4, to prevent someone guessing another student's code and editing
   their record — recommend requiring one such secondary field, since `studentCode` alone is
   low-entropy and sequential/guessable). On match, and only if `profileCompletedAt` is still null
   *or* the institute allows self-edit after completion (recommend: allow re-edit only before
   `profileCompletedAt` is set by staff-lock, not indefinitely — see below), show the admission
   form pre-filled with whatever's already known (name, course), student fills the rest (DOB,
   parent details, school, phone, etc. — whatever `Student`/admission fields exist today per
   `AdmitModal.tsx`), submits.
5. **Staff review** — a new view (or an extension of the existing Admissions/Students screen)
   showing, per course/batch, which students have self-filled vs. still pending, with the ability
   to open and edit any submitted record (correcting mistakes) and to lock it (`profileCompletedAt`
   set) once verified.

### Security considerations (this is the one new *public* surface in the app)

- Rate-limit the lookup endpoint hard (per-IP) — it's an unauthenticated enumeration target
  otherwise (trying `studentCode`s sequentially). Check whether any rate-limiting middleware
  already exists in `app.ts`; if not, this is the first thing that needs it and should probably be
  added generally, not just bolted onto this one route.
- Require the secondary field (DOB or phone) before allowing *any* read or write of the record —
  never resolve just off `studentCode`.
- Once `profileCompletedAt` is set by staff, the public form should refuse further self-edits
  (return a "your details are locked, contact reception for changes" message) — prevents a
  student from silently altering verified data after review. Staff can always reopen it from the
  authenticated side if a correction is genuinely needed.
- Public form endpoints live in their own small section of a router (or a new `public.ts` router)
  clearly marked unauthenticated, following the one existing precedent (`auth.ts`'s public routes)
  rather than scattering unauthenticated exceptions into `students.ts`/`admission.ts` alongside
  authenticated ones — keeps the "what's public" surface auditable at a glance.
- No institute-scoping header/token is available on this route (student doesn't log in), so the
  lookup must resolve institute purely from `studentCode` + secondary factor — fine, since
  `studentCode` is already unique institute-wide (confirm this — check `StudentCodeCounter`'s
  scope before assuming).

### Data model

- `Student` gains `profileCompletedAt DateTime?` (null = pending self-fill; also doubles as "was
  this student bulk-pre-created or admitted the normal way" — a normally-admitted student would
  have it set at creation time).
- Possibly a lightweight scope table isn't needed at all — the "link" is just a URL like
  `/admission-form?course=<courseId>` or `/admission-form?batch=<batchId>` or `/admission-form`
  (institute-wide, if the institute is resolvable from the domain/subdomain — check how
  multi-institute routing currently resolves institute for public pages, since the authenticated
  app likely resolves institute from a logged-in session which doesn't exist here). Confirm how
  the frontend currently determines "which institute" for any page before assuming a bare
  `/admission-form` link is resolvable — may need an institute slug in the URL if there's no other
  way to know which institute's `studentCode` namespace to search.

### API surface

New public section (in `public.ts` or clearly marked within an existing router):

- `POST /public/students/lookup` — body: `{ studentCode, dob (or phone) }` → returns minimal
  pre-fill data (name, course) if matched and not locked, generic error otherwise (never reveal
  *which* field was wrong — same care as login error messages).
- `POST /public/students/:id/complete-profile` — body: full profile fields → validates against
  the same lookup credentials again (don't trust a client-held ID across requests without
  re-proving identity), writes the fields, does **not** set `profileCompletedAt` itself (that's a
  staff action after review) — or does, if the decision is "self-submission completes it and staff
  only edits exceptions" (flagging as a call to make: auto-complete-on-submit is simpler and
  probably matches "so I can see who's filled" better than requiring a manual staff lock step for
  every student — recommend auto-complete-on-submit, with staff able to re-open individual ones).

Authenticated additions:

- `POST /students/bulk-precreate` — names + course/batch → creates `Student` rows with only
  `studentCode` assigned.
- `GET /students/export?courseId=&batchId=` — PDF/Excel of name + `studentCode` for the scoped
  group (check if any existing PDF-export utility exists in the codebase — receipts likely
  generate PDFs already, `ReceiptModal.tsx`/`GET /payments/:id/receipt` — reuse that same
  PDF-generation library rather than adding a second one for this).
- `GET /students/self-fill-status?courseId=&batchId=` — roster with `profileCompletedAt` per
  student, for the staff review screen.

### Frontend

- New public route, e.g. `frontend/src/app/admission-form/page.tsx` — **no app-shell/sidebar**,
  standalone page (check how `login/page.tsx` avoids the shell, likely a route-group layout
  exception, reuse that same mechanism). Two-step: enter `studentCode` + secondary factor → show
  form. Must be fast and simple on a phone — this is filled by parents/students on their own
  phones, one-handed, possibly on a slow connection, so keep the bundle light and avoid pulling in
  the full authenticated app's JS if the routing structure allows splitting it out.
- Staff side: extend `admissions/page.tsx` or `students/page.tsx` with a "Self-fill status" view
  (per course/batch, filled vs pending count, list with edit-in-place using the existing
  `AdmitModal.tsx`/student-edit modal), plus the bulk-precreate entry form and the export action.

### Build order

1. Schema: `Student.profileCompletedAt`. Additive migration.
2. `POST /students/bulk-precreate` (authenticated) + roster/export endpoints.
3. New `public.ts` router: rate-limited lookup + complete-profile endpoints, with the secondary-
   factor check and locked-after-completion guard.
4. Confirm/add rate-limiting middleware if none exists yet (blocking dependency for step 3 going
   live safely).
5. Public `/admission-form` page — no app-shell, two-step flow, mobile-first (this is the one
   screen to literally test on a real phone, not just resize a browser window).
6. Staff-side self-fill status view + edit-in-place + bulk-precreate form + export action.
7. Test: bulk-precreate 5 students for a course → export roster → confirm PDF/Excel has names +
   codes → hit the public link, look up one by code + DOB → confirm correct pre-fill, wrong DOB
   → confirm generic rejection, no field-specific hint → submit full profile → confirm staff-side
   view shows it as filled → attempt a second lookup+edit on the same student after completion →
   confirm it's refused with the "locked" message → staff reopens it from the authenticated side
   → confirm edit succeeds → cross-institute isolation (student code from institute A can't be
   looked up in a link scoped to institute B, if the URL scoping ends up being permissive) →
   rate-limit check (rapid sequential lookups from one IP get throttled) → mobile pass on an actual
   phone browser for the public form specifically.

---

## Overall recommended build order across 8a–8f

1. **8a** (installment settlement) — highest-frequency pain point, touches only Fees, no new
   public surface, lowest risk.
2. **8b** (inactive-course guards) — small, low-risk, cleans up an existing gap before more
   features get layered on top of course pickers.
3. **8d** (reminders) — introduces the scheduler infrastructure, self-contained, no dependency on
   the others.
4. **8e** (distribution tracking) — self-contained new module, no dependency on the others.
5. **8f** (self-service admission links) — last, since it's the highest-risk item (the only new
   unauthenticated public surface) and benefits from the rate-limiting groundwork being a settled
   pattern rather than invented under time pressure.
6. **8c** (subject-wise fees) — deferred, design note only, revisit as its own addendum later.

Each phase: schema migration → backend routes → frontend → mobile pass at 360px/390px → smoke test
per that phase's own "Build order" test checklist above, before starting the next phase — same
discipline as every prior phase in this doc.
