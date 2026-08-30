# Addendum — Phase 8: Installment settlement, inactive-course guards, reminders, distribution tracking, self-service admission links

> Five independent features requested together; grouped here as one addendum but built and
> shipped as **separate phases (8a–8e)**, each smoke-tested on mobile viewport widths before
> moving to the next. One item (subject-wise fees, §8c) is explicitly a design note only, not
> scheduled for a build order — flagged as deferred per the request.
>
> **Status: 8a, 8b, 8d, 8e and 8f are IMPLEMENTED (2026-08-28).** 8c was **approved for build on
> 2026-08-29** with add-on plans cut from scope and all open questions decided — see the status
> block at the top of its section, which supersedes the older prose beneath it.

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

## 8c. Subject-wise fees (e.g. 12th std) — APPROVED FOR BUILD (revised 2026-08-29)

> **Status 2026-08-29: IMPLEMENTED (stages 1–6).** Schema, academics routes, fees routes, roster
> filtering and the frontend are all in. Stage 1 (`FeeStructure.isDefault`) was already complete
> before this pass. Not yet done: the stage-7 manual test pass against real data.
>
> **Status 2026-08-29: scheduled, scope reduced, approved to build.** The 2026-08-28 design below
> was reviewed against the code a second time and three errors were found in it (see "Corrections"
> immediately below). Add-on plans are **cut from scope**. All previously-open questions are now
> decided. Where this block and the older prose below disagree, **this block wins.**
>
> ### Corrections to the 2026-08-28 design
>
> 1. **`deriveRoster` has six call sites, not four.** The old text says "all four call sites in
>    `attendance.ts`". There are four there (`attendance.ts:410, 448, 477, 515`) **and two in
>    `tests.ts` (`356`, `505`)** that were missed entirely. Test sessions are `Lecture` rows with a
>    `subjectId`, so subject opt-outs must apply to them too — and `tests.ts:358` feeds
>    `expected: roster.length`, so skipping it shows a wrong expected-count on every test session.
> 2. **An all-complementary selection would be rejected.** `fees.ts:270` throws when
>    `finalFee.lte(0)`, so a student taking only ₹0 subjects can't get an account. Resolved by the
>    "at least one paid subject" rule below rather than by relaxing that check.
> 3. **Add-on installments would have disagreed with `seq` ordering.** Moot now that add-ons are cut.
>
> ### Decisions locked 2026-08-29
>
> | Decision | Resolution |
> |---|---|
> | Staging | `FeeStructure.isDefault` ships **standalone first**, subject-wise built on top |
> | Add-on plans (MHT-CET/JEE) | **CUT.** Modeled instead as a priced `Subject` on the course — gives checkbox selection, a `StudentSubject` row, roster filtering for its sessions, and a receipt line, all for free. `CourseAddOnPlan`/`FeeAccountAddOn` are **not** being built. |
> | Fee computation | `courseFee` = **sum of the student's selected subject amounts**, into the existing column. `FeeAccount` does not change shape. |
> | `courseFee` as input | **Rejected** in the request body for a `SUBJECT_WISE` course — the sum is authoritative, or the receipt itemization could contradict the total. Deviations go through `discount`. |
> | Zero-fee accounts | **Blocked** — at least one selected subject must have `amount > 0`. Complementary subjects are riders on a paid enrollment, not standalone products. |
> | Full waiver | Legitimate, and expressed via `discount` (courseFee ₹25,000 − discount ₹25,000), **not** by unchecking every paid subject. Different field, real audit trail. |
> | `RECURRING` + `SUBJECT_WISE` | **Rejected at structure creation.** A sum of subject prices is a term total, so it belongs to `ONE_TIME`. Otherwise `FeeStructureSubjectLine.amount` would mean "total" on one plan type and "per month" on the other — one column, two meanings. |
> | Pricing corrections | New `PATCH /accounts/:studentId/pricing` taking `{ subjectIds?, discount? }`, `STRICT_ROLES`, **rejected once any payment exists** (same idiom as the existing `paidAmount` guards), wrapped in `withFeeAccountLock`. Warn in the UI when it would discard a hand-modified schedule. |
> | Correct vs. drop | **Two separate actions, never one control.** Correct (pre-payment) = the enrollment was always wrong → reprice + regenerate. Drop (any time) = a real mid-term event → `isActive: false`, roster only, fees untouched. Sharing one button would eventually erase a family's outstanding balance. |
> | Drop UI | Subjects section in `StudentProfileModal.tsx` |
> | `feeMode` switch | Blocked once the course has **enrolled students OR fee accounts** — see guard A |
> | `StudentSubject.joinedAt` | **Inherits `StudentBatch.joinedAt`**, never "today" — see guard B |
> | Structure completeness | A `SUBJECT_WISE` structure must carry a line for **every** `CourseSubject` (₹0 allowed) — see guard C |
> | Empty-roster fallback | A student with no `StudentSubject` appears on **no** roster for that course. No "show everyone" safety net. |
>
> ### The three guards — all three have the same failure mode
>
> Each produces **a silently empty roster**, which does not look like a bug. It looks like "nobody
> is enrolled yet": nothing errors, nothing logs, and a teacher just sees a blank list. That shared
> invisibility is why they matter more than their size suggests.
>
> - **Guard A — the `feeMode` flip.** `StudentSubject` rows are written *only* at fee-account
>   creation. A course running as `FLAT` with 40 enrolled students and daily attendance but no fee
>   accounts yet passes a guard that only checks fee accounts — flip it to `SUBJECT_WISE` and every
>   roster for that course empties at once, because nobody has a `StudentSubject` row. The guard
>   must therefore check **enrolled students as well as fee accounts**.
> - **Guard B — `joinedAt`.** `deriveRoster` filters `joinedAt <= date`. A student who joined the
>   batch in June but whose fee account is created in September would, if `joinedAt` were stamped
>   "today", vanish from every June–August roster **while their `AttendanceRecord` rows survive** —
>   attendance records for a student the roster says was never there, corrupting percentages and
>   expected-counts retroactively. `joinedAt` must copy `StudentBatch.joinedAt`.
> - **Guard C — an omitted subject line.** If staff build a structure and forget IT, IT stays linked
>   via `CourseSubject` and IT lectures still schedule — but no student ever gets a `StudentSubject`
>   for it, so **every IT lecture derives an empty roster, forever**, from one omission on a form.
>   Validate at structure save that every `CourseSubject` has a line.
>
> ### Still to settle during the build (not blocking)
>
> - `onDelete` policy on the new `Subject` foreign keys (`StudentSubject.subject`,
>   `FeeStructureSubjectLine.subject`) — they'd default to restrict, so deleting a subject any
>   student ever enrolled in would fail. Also: removing a subject from a course leaves both tables
>   dangling.
> - What happens to `StudentSubject` rows when `Student.courseId` changes (a course transfer leaves
>   rows pointing at the old course's subjects).

### Original 2026-08-28 design (superseded in part — read the block above first)

> **Revised 2026-08-28** at the user's request, into a full design — grounded against the actual
> schema this time (`FeeStructure`/`FeeAccount`/`CourseSubject`/`Lecture`/`deriveRoster` all read
> directly, not assumed). **Still not scheduled** — this is planning only, per the user's own
> "deferred... revisit as its own addendum" framing. Four asks bundled together: (1) per-subject
> pricing with some subjects complementary, (2) fee-account creation defaults to everything
> selected, unselecting a paid subject drops its charge, (3) separately-attachable exam-prep
> add-on plans (MHT-CET, JEE) with their own charges, (4) a student who's opted out of a subject
> must not appear on *that subject's* lecture roster, while still appearing on every subject
> they're actually enrolled in.
>
> **Correction 2026-08-28** (same day, before any of this was built): pricing was originally
> sketched as one mutable field on `CourseSubject` — a single institute-wide price per subject
> that could only ever hold *one* value at a time. The user pointed out this doesn't support
> different batches/intake years coexisting at different prices (a 2026 cohort and a 2027 cohort
> both still active, each locked to their own pricing). Correct fix, and the one below: **prices
> live on `FeeStructure` instead**, the same reusable/versionable template model `FeeAccount`
> already snapshots from today for flat-fee courses — so "12th Science — Batch 2026-27" and
> "12th Science — Batch 2027-28" are simply two different `FeeStructure` rows a course can offer
> side by side, exactly like creating a new named structure already works. `CourseSubject` goes
> back to being a bare join with no price on it.

### Why this is bigger than "add a field" — it touches three modules at once

Confirmed by reading the code directly:

- **Fees**: `FeeStructure`/`FeeAccount` are both flat, course-scoped — one `courseFee` per
  course, no concept of a per-subject line (`schema.prisma:912-967`).
- **Academics**: `CourseSubject` already links subjects to courses (`schema.prisma:578-589`), but
  it's a bare join row — `{ courseId, subjectId }`, no price on it.
- **Attendance**: `Lecture` already carries a `subjectId` (`schema.prisma:762-782` — this part
  isn't new infrastructure). But `deriveRoster(batchId, date)` in `lib/lectureShared.ts:68-79`
  computes a lecture's roster **purely from `StudentBatch`** — it has no idea what subject the
  lecture is even for, and none of its four call sites in `attendance.ts` (roster fetch, mark,
  mark-all-present, daily summary) pass `lecture.subjectId` in. So "exclude a Bio opt-out from
  the Bio roster" doesn't just need a new opt-out table — it needs `deriveRoster` itself extended
  and every call site updated to actually use it.

### Data model

Extends what already exists rather than parallel tables where a field would do:

```
enum CourseFeeMode {
  FLAT          // today's behavior — Course.defaultFee, one FeeStructure per course
  SUBJECT_WISE  // finalFee is the sum of the student's selected CourseSubject fees
}
```

- `Course.feeMode CourseFeeMode @default(FLAT)` — a course declares its mode once; both models
  coexist without migrating every existing course (this was the "biggest open question" flagged
  in the original note — resolved here, not left open).
- `FeeStructure` (already exists) gains `isDefault Boolean @default(false)` — see "Resolved
  2026-08-28" below for the full reasoning; the short version: exactly one structure per course
  can be the default a fresh enrollment pre-selects, and setting a new one flips the old one off.
  Applies to both `FLAT` and `SUBJECT_WISE` structures, not new to this addendum specifically.
- `FeeStructure` also gains child pricing rows for `SUBJECT_WISE` mode — a new
  `FeeStructureSubjectLine` model, **not** a field on `CourseSubject`:
  ```
  model FeeStructureSubjectLine {
    id             String  @id @default(cuid())
    feeStructureId String
    subjectId      String
    /// 0 = complementary (English, IT — "defaultly provided" per the request).
    amount         Decimal @db.Decimal(10, 2) @default(0)
    feeStructure   FeeStructure @relation(fields: [feeStructureId], references: [id], onDelete: Cascade)
    subject        Subject      @relation(fields: [subjectId], references: [id])
    @@unique([feeStructureId, subjectId])
  }
  ```
  This is what actually supports batch/year-specific pricing: staff creates a new named
  `FeeStructure` ("12th Science — Batch 2027-28") with its own subject-line prices whenever a
  cohort needs different rates, and older cohorts stay attached to their original `FeeStructure`
  unaffected — the same reusable-template pattern flat-fee courses already use, just with
  subject-line children instead of one `courseFee` number. `CourseSubject` stays a bare join
  (course ↔ subject only, no price) — it answers "which subjects does this course offer," not
  "what do they cost," and now only `FeeStructure` answers the pricing question, for both modes.
- `StudentSubject` — **new model**, the one genuinely new table, doing double duty as both "what
  this student is paying for" and "what this student should appear on the roster for":
  ```
  model StudentSubject {
    id         String    @id @default(cuid())
    studentId  String
    subjectId  String
    /// Snapshotted from the CHOSEN FeeStructure's FeeStructureSubjectLine at
    /// enrollment time — same principle as FeeAccount.finalFee: a later price
    /// change (even on a still-active FeeStructure) must never silently
    /// reprice a student already paying the old rate. 0 for a complementary
    /// subject.
    amount     Decimal   @db.Decimal(10, 2)
    isActive   Boolean   @default(true)
    joinedAt   DateTime  @db.Date
    leftAt     DateTime? @db.Date
    student    Student   @relation(fields: [studentId], references: [id], onDelete: Cascade)
    subject    Subject   @relation(fields: [subjectId], references: [id])
    @@unique([studentId, subjectId])
  }
  ```
  One row per (student, subject) — paid or complementary, doesn't matter, both live here so
  roster filtering (below) has one uniform source of truth rather than treating free and paid
  subjects as two different kinds of enrollment.
- ~~`CourseAddOnPlan`~~ and ~~`FeeAccountAddOn`~~ — **CUT 2026-08-29, not being built.** Both models
  are dropped from scope. An MHT-CET/JEE program is instead modeled as an ordinary `Subject` linked
  to the course via `CourseSubject` and priced as a `FeeStructureSubjectLine` like any other.
  Rationale: the add-on model carried three of the design's riskiest edge cases (attach/detach after
  creation, `seq`-vs-`dueDate` ordering in the schedule, and overdue reminders firing per add-on),
  all of which touch the installment generator and payment waterfall — the most money-critical code
  in the app. Subject-wise pricing on its own never goes near them. Worse, `FeeAccountAddOn` is
  money only, with no enrollment row behind it, so an add-on had **no roster story at all** — there
  would be no way to filter a crash-course lecture to the students who paid for it. As a priced
  subject it gets selection, pricing, a `StudentSubject` row, roster filtering and a receipt line
  for free. The one thing given up is an add-on with its own independent installment schedule
  (e.g. MHT-CET over 2 payments while the base runs 6) — already declared out of scope below, and a
  clean separate addendum if it ever becomes real.

  Net: this section defines **four** additions, not six — the `CourseFeeMode` enum,
  `FeeStructure.isDefault`, `FeeStructureSubjectLine` and `StudentSubject`.

### Fee-account creation flow for a `SUBJECT_WISE` course

1. Staff picks the course **and which `FeeStructure`** to attach at `POST /accounts` time — same
   as today's flat-fee flow already requires picking a structure, just now the structure carries
   subject lines instead of one `courseFee`. This is the step that resolves batch/year pricing:
   picking "12th Science — Batch 2026-27" vs "...2027-28" picks the whole price list at once.
   The create-account form switches from "enter a course fee" to a **checklist of that
   structure's subjects** (from its `FeeStructureSubjectLine` rows), **every subject checked by
   default — paid and complementary alike** (matches "by default all will be set + the subjects
   without charge," verbatim).
2. Unchecking a *paid* subject removes it from the sum; unchecking a complementary one is
   possible too (a student who, say, doesn't want to attend Hindi at all) but changes nothing
   about the total since it was already ₹0 — this is really an enrollment decision wearing a fee
   UI, which is exactly why `StudentSubject` needs `isActive` independent of `amount`.
3. On submit: create one `StudentSubject` row per checked subject (`amount` snapshotted from that
   `FeeStructureSubjectLine`, `isActive: true`), sum the paid ones into `finalFee`, generate the
   installment schedule from that sum exactly as `generateOneTimeInstallments` already does today
   — no new installment logic needed, subject-wise fees only change *how `finalFee` is computed*,
   not what happens after.
4. ~~Add-on plans...~~ **CUT 2026-08-29** — see the data-model note above. MHT-CET appears in the
   same checklist as an ordinary priced subject.

**Worked example (2026-08-29).** Structure prices Physics/Chemistry/Maths at ₹12,000 each, Biology
at ₹10,000, English and IT at ₹0. Riya takes everything except Biology:
`courseFee` = 12,000 + 12,000 + 12,000 = **₹36,000** → `discount` ₹1,000 → `finalFee` **₹35,000** →
6 installments from the existing generator, untouched. She gets **five** `StudentSubject` rows,
English and IT included at ₹0 — those drive her rosters exactly as much as the paid ones. Only
Biology is absent, so she is off the Biology roster and on every other subject's.

**Validation at submit:** at least one selected subject must have `amount > 0` (a selection of only
complementary subjects is rejected — see the locked decisions). `courseFee` supplied in the request
body is rejected for a `SUBJECT_WISE` course; the sum is authoritative.

### Dropping a subject mid-course — flagged as a policy question, not solved here

If a student stops taking Biology in November, two things need to happen and they are **not**
the same decision:

- **Roster impact** (mechanical, safe to automate): set that `StudentSubject.isActive = false`
  (`leftAt` = today) → they stop appearing on Biology's lecture roster from that date forward,
  automatically, via the `deriveRoster` change below.
- **Fee impact** (a business decision, not a mechanical one): does the family get a refund for
  the dropped subject? A discount on remaining installments? Nothing at all (fee was for the
  whole term regardless of attendance)? This varies by institute policy and even by family
  negotiation — **recommend NOT auto-adjusting any installment when a subject is dropped**.
  Deactivating a `StudentSubject` only ever touches the roster. If the fee should change, staff
  does that explicitly via the *already-existing* `EditAmountControl`/reschedule tools on the fee
  account — same manual, deliberate action as any other fee correction today, not a new
  automated side-effect that could silently under- or over-charge a family.

### Roster/attendance integration — the concrete code change

- `deriveRoster(batchId, date)` → `deriveRoster(batchId, date, subjectId?)`. When `subjectId` is
  given and that lecture's course is `SUBJECT_WISE`, add a filter: only students with an active
  `StudentSubject` row for that `(studentId, subjectId)` pair (joined on `leftAt: null` or
  `leftAt >= date`, same "active on this date" pattern `StudentBatch` filtering already uses).
  For a `FLAT`-mode course, behavior is byte-for-byte unchanged — every batch member stays on
  every roster, exactly as today.
- **Corrected 2026-08-29: there are six call sites, not four.** Four in `attendance.ts` (roster
  fetch `:410`, mark `:448`, mark-all-present `:477`, daily summary `:515`) **and two in `tests.ts`
  (session list `:356`, result entry `:505`)** — the original text missed `tests.ts` entirely. Test
  sessions are `Lecture` rows carrying a `subjectId`, so a subject opt-out must exclude a student
  from that subject's *test sessions* too; `tests.ts:358` feeds `expected: roster.length`, so
  missing it would show a wrong expected-count on every test session. All six already have the
  `Lecture` row in hand, so passing `lecture.subjectId` through is a one-line change each — the
  function signature is the only real surface change.
- Confirm before building: a lecture's roster for a `SUBJECT_WISE` course, when a student was
  never enrolled in *any* subject of that course (shouldn't happen if step 3 above always runs at
  account creation, but worth a defensive check) — should such a student show on *no* roster for
  that course, or fall back to "show everyone" as a safety net? Recommend the former (empty is
  correct, not a bug) but flagging since a silent wrong-roster bug here is worse than most.

### What's explicitly NOT solved here (open questions for whoever builds this)

- **Changing a course's `feeMode` after students already have accounts** — not addressed; existing
  `FLAT` accounts keep working unchanged (nothing about them reads `feeMode`), but there's no
  migration path offered for converting an existing flat-fee course to subject-wise mid-year.
- **Add-on plans with their own installment schedules** (e.g. MHT-CET billed in 2 installments
  while the base course is billed in 6) — the sketch above assumes one lump-sum installment per
  add-on; a full independent schedule per add-on is a bigger change to the installment generator
  than sketched here.
Resolved by the batch/year-pricing correction above, no longer open: pricing that differs by
cohort (create a new `FeeStructure`) and retroactively pricing a subject that was previously
complementary (create a new `FeeStructure` with that subject's line priced — existing students
stay on their original structure's `StudentSubject` snapshot, at whatever they were actually
paying, unaffected).

### Resolved 2026-08-28: which `FeeStructure` is "the current one"

With several structures potentially active on the same course at once (this year's and next
year's, side by side during an admission-cycle transition), something needs to mark which one a
fresh enrollment defaults to — otherwise staff can silently pick the wrong year's pricing.
Considered two shapes and picked the cheaper, more explicit one:

- **Chosen: `FeeStructure.isDefault Boolean @default(false)`**, with "at most one default per
  course" enforced in the app layer rather than a DB constraint (a partial unique index on
  `(courseId, isDefault) WHERE isDefault` is the Postgres-native way, but a plain transactional
  flip — unset the course's current default, set the new one — is simpler and just as correct
  for something staff does once per admission cycle, not a hot path). The fee-account creation
  form pre-selects whichever structure has `isDefault: true` for the chosen course, while still
  letting staff explicitly pick a different one — needed during the transition window itself,
  e.g. re-admitting a repeat student onto last year's plan on purpose. Applies to **both**
  `FLAT` and `SUBJECT_WISE` structures — `FeeStructuresTab.tsx` doesn't have this concept today
  either, so it's one general fix, not something special-cased to subject-wise mode.
- **Rejected: `effectiveFrom`/`effectiveTo` date ranges that auto-resolve "current."** More
  automatic, but not worth the added complexity for a low-frequency, staff-driven decision —
  overlap validation, "what if nothing matches today," and timezone edge cases, all to save one
  click a few times a year.
- API surface: `PATCH /academics/fee-structures/:id` gains `isDefault: boolean`; setting it true
  flips every sibling structure on the same `courseId` to false in the same transaction. `GET
  /academics/fee-structures?courseId=` response includes `isDefault` per row so the frontend can
  visually mark it (a small "Default" badge, same pattern as `Badge` usage elsewhere) and
  pre-select it in the create-account flow.

### Build order — REVISED 2026-08-29 (this supersedes the list that was here)

**Stage 1 — `FeeStructure.isDefault`, shipped standalone and verified before anything else.**
Schema + migration; `PATCH /academics/fee-structures/:id` flipping every sibling on the same
`courseId` to false in one transaction; `isDefault` in list responses; a "Default" badge and
set-default action in `FeeStructuresTab.tsx`; pre-selection in `SetupFeeAccountModal.tsx`. Stands
alone, needs nothing from `SUBJECT_WISE`, and improves today's flat-fee flow. **Stop and verify
here.**

**Stage 2 — remaining schema, one migration.** `CourseFeeMode` enum + `Course.feeMode` (default
`FLAT`), `FeeStructureSubjectLine`, `StudentSubject`. Additive — every existing course stays
`FLAT`, so nothing in today's Fees or Attendance behavior changes until a course is explicitly
switched.

**Stage 3 — `academics.ts`.** Subject-line pricing on structure create/edit when the parent course
is `SUBJECT_WISE`; **guard C** (reject a structure that omits any `CourseSubject`); reject
`SUBJECT_WISE` + `RECURRING`; **guard A** (`feeMode` toggle blocked once the course has enrolled
students *or* fee accounts, disabled in the UI with the reason stated).

**Stage 4 — `fees.ts`.** `POST /accounts` branches on `course.feeMode`: the `SUBJECT_WISE` path
builds one `StudentSubject` per checked subject with **guard B** (`joinedAt` copied from that
student's `StudentBatch.joinedAt`), sums the paid subjects into `courseFee`, rejects a selection
with no paid subject, rejects a client-supplied `courseFee`, then hands off to the existing
installment generator unchanged. Plus the new `PATCH /accounts/:studentId/pricing` behind the
no-payments gate.

**Stage 5 — roster filtering.** `deriveRoster(batchId, date, subjectId?)`, filtering only when the
lecture's course is `SUBJECT_WISE`; update **all six** call sites (see the correction above).
4. `lib/lectureShared.ts`: extend `deriveRoster` with the optional `subjectId` filter; update
   `attendance.ts`'s four call sites to pass `lecture.subjectId`.
5. Frontend: `SetupFeeAccountModal.tsx` gains the subject-checklist mode for `SUBJECT_WISE`
   courses (all checked by default); `CoursesTab.tsx` gains the feeMode toggle + per-subject
   pricing + add-on plan management; receipts/statements show add-ons as distinct line items.
6. Test: create a `SUBJECT_WISE` 12th-Science course with Physics/Chem/Maths/Bio priced and
   Hindi/English/IT complementary → set up a fee account → confirm `finalFee` sums only the paid
   subjects and every subject (paid + free) has a `StudentSubject` row → uncheck Biology at setup
   → confirm it's excluded from both the fee sum and gets no `StudentSubject` row → attach an
   MHT-CET add-on → confirm it appears as a separate installment/line, not blended into the base
   fee → schedule one lecture per subject on the same batch/date → confirm a student who opted
   out of Biology is absent from *only* the Biology roster, present on every other subject's →
   drop a subject mid-course via deactivating its `StudentSubject` → confirm the roster reflects
   it going forward with zero automatic change to any installment → confirm a `FLAT`-mode
   course's rosters and fee flow are completely unaffected by all of the above (regression pass).

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

> **Status: IMPLEMENTED (2026-08-28).** Built per the plan below, with one decision made before
> building: who can access it. Discussed with the user — role-gated `OWNER/ADMIN/RECEPTION`,
> matching Fees' exact gating, **Faculty deliberately excluded** (this is an ops/logistics task,
> not a teaching one — same reasoning as why Faculty can't touch Fees). Not module-gated (no
> `requireModule`, no new `ModuleCode`) — this is a small always-on utility available to every
> institute, not a billable subscription tier; adding a new module would have meant touching the
module catalog, seed data, and the platform's module-management UI for no real benefit here.

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

### What was actually built

Matches the plan above, with received-count added to the items list (not in the original spec,
but needed for a useful "42/58 received" summary without an extra round-trip per item):

- Schema: `DistributionItem`, `DistributionReceipt` exactly as designed, plus back-relations on
  `Institute`/`Course`/`Student`. Additive migration.
- `backend/services/distributionSync.ts` — `createDistributionReceiptsForNewStudent()`, one
  shared function so "who gets a receipt row on admission" is defined once, not duplicated.
  Called from **both** admission paths: the normal `admission.ts` admit flow, and §8f's
  `students.ts` bulk-precreate — both create real `Student` rows, so both needed the hook, not
  just one (caught this while implementing, not left as a gap).
- `distribution.ts` router: `GET/POST /items`, `PATCH /items/:id`, `GET /items/:id/receipts`
  (optional `?batchId=` filter), `PATCH /items/:id/receipts/:studentId` (single toggle),
  `POST /items/:id/receipts/bulk` (idempotent — already-received students in the list are simply
  skipped, matching Attendance's mark-all-present precedent exactly). Items list includes a
  per-item `receivedCount` via one small count query per item (kept off Prisma's filtered
  relation-count to avoid a preview-feature dependency — the item list itself is always small).
- Frontend: `/distribution` page (items list, "New item" modal, active/inactive toggle) +
  `DistributionRosterModal.tsx` (search, batch-derived context, individual toggle, "select all
  pending" + bulk-mark, table on desktop / large-touch-target cards on mobile — the one screen
  staff use one-handed while physically handing out books). New sidebar entry + icon, gated
  `OWNER/ADMIN/RECEPTION` with no `module:` key.

**Testing**: verified end-to-end against a running server — admitted students *before* creating
an item (confirmed they're on the roster immediately), created the item, then admitted a further
student *after* (confirmed the admission hook gave them a pending receipt automatically);
individual toggle both directions; bulk-mark with idempotency confirmed (re-running it over
already-received students updates only the genuinely-still-pending ones); items-list counts
verified against roster reality; deactivation confirmed to hide from the default list while
preserving roster history; institute-wide items (no course scope) confirmed to cover students
from any course. **Role gating verified with a real request, not just code inspection** — created
a temporary FACULTY user, logged in, hit `GET /distribution/items`, confirmed a live 403, then
deleted the test account. `tsc --noEmit`, ESLint, and `next build` all clean on both sides.

---

## 8f. Self-service admission form via shareable link + student ID lookup

> **Status: IMPLEMENTED (2026-08-28).** Built as revised below (4-digit PIN, not phone).
> Full backend + frontend, end-to-end tested against a running server, two real bugs found and
> fixed during that testing (not in the original design) — see "Bugs found during testing" near
> the end of this section. `tsc --noEmit`, ESLint, and `next build` all clean on both sides.

> **Revised before build (2026-08-28).** The original plan below was written before the codebase
> was examined in detail. Five things it left as "confirm before assuming" were checked, and one
> of them turned out to break the design as written. Corrections in this block take precedence
> over the original text that follows; the original is kept because the reasoning is still useful.

### ⚠️ Correction 1 — the second factor doesn't exist yet (breaks the original design)

The original plan says the student proves who they are with "`studentCode` + a second factor like
DOB or phone last-4". **That's circular.** The entire point of bulk pre-create is that we only
have a name and a course — `dob` is null, `phone` is null (`Student.phone`/`dob` are both
optional, `schema.prisma:676-678`). There is nothing on file to check the student against. The
form is what *collects* those fields.

Options considered:

- **(a) Capture phone during bulk pre-create, use it as the second factor.** A class that's
  already running has its students' phone numbers — that's how they were contacted in the first
  place. Costs nothing extra to distribute (the student already knows their own number) and it's
  *not printed on the shared roster*, so it stays secret from classmates.
- **(b) Generate a per-student access code, print it on the roster.** Unguessable, needs no
  pre-existing data — but it lands on the same sheet that gets posted in the class WhatsApp
  group, so every classmate can read every other student's code. It defends against outsiders
  and not at all against the people most likely to actually misuse it.
- **(c) Per-student tokenised links.** Frictionless, but the user explicitly asked for *one*
  link plus a typed ID, and per-student links pasted into a group chat are worse than (b).

**Decision, superseded 2026-08-28 — see "Decisions confirmed with the user" below.** (a) was the
initial call, then reconsidered against (b) once its exact shape was pinned down: a *separate*
random PIN (not the phone, not derived from anything on file) generated at bulk-precreate time,
printed on the roster next to the student ID, needing zero pre-existing data. The "printed
alongside the ID" objection to (b) is real but bounded by making the PIN short and backing it
with a hard per-student lockout rather than rate-limiting alone — see the PIN section below.

### ⚠️ Correction 2 — enumeration risk is worse than assumed

`studentCode` is `{INSTITUTE}-{YY}-{COURSE}-{SEQ}` — e.g. `SP20-25-10-0007`
(`services/studentCode.ts`). The sequence is **plain incrementing** (`0001`, `0002`, …), so
anyone holding a single classmate's code can trivially generate every other code in that course
and year. The original plan called the code "low-entropy and sequential/guessable" — confirmed
exactly, which makes a real second factor (not just rate limiting) non-optional.

**`studentCode`'s generator is explicitly left untouched.** Alternatives considered and rejected
for *this* feature: randomizing the counter's last 4 digits (adds collision-retry logic to a
generator every admission already depends on, for a guarantee the new PIN below already
provides at the point that actually needs it); a keyed 4-digit Feistel permutation over the
counter (bijective, no retries, but adds a per-institute secret to manage and a crypto-shaped
piece of code to get right, for the same marginal gain) — **skipped for now**, on the user's
call. `studentCode` keeps its current shape everywhere it's already used (receipts, staff UI,
biometric IDs); the new PIN carries 100% of this feature's identity-guessing defence instead, so
nothing about the existing generator needs to be correct for 8f to be secure.

### ✅ Confirmation 3 — one link is enough (simplification)

`Student.studentCode` is `@unique` **globally**, not per-institute (`schema.prisma:671`), and it
embeds the institute code anyway. So the code alone resolves the institute — no slug in the URL,
no per-course/per-batch links needed for correctness. Since a student can only ever reach their
*own* record regardless of which link they clicked, scoped links add no security and no
function. **Recommend shipping a single institute-wide link**; per-batch variants can still be
handed out as a cosmetic convenience later, but shouldn't be built as though they gate anything.

### ✅ Confirmation 4 — export needs no new dependency

No PDF/XLSX library exists in `backend/package.json`, but `expenses.ts:457` already hand-rolls
CSV (`csvEscape` + `Content-Type: text/csv`). Reuse that for the Excel-openable export. For the
"PDF print" half, render a print-styled HTML roster page on the frontend and let the browser's
own Print-to-PDF do it — matching the user's "excel or pdf print generated" without adding a
PDF toolchain.

### ✅ Confirmation 5 — the shell-free public page is free

`app/layout.tsx` carries no sidebar; each module adds its own `layout.tsx`. `login/` has none,
which is why it renders bare. A new `app/admission-form/page.tsx` with **no** `layout.tsx`
therefore gets the shell-free treatment automatically — nothing to opt out of.

### Rate limiting + the lookup PIN — the two pieces of genuinely new infrastructure

Confirmed: **no rate limiting exists anywhere in the app** (nothing in `middleware/`, nothing in
`app.ts`). This is the blocking prerequisite the build order already calls out.

**Final design (superseding Correction 1's phone-based decision, 2026-08-28)**: a standalone
`selfFillPin` — a random 4-digit numeric code, generated once at bulk-precreate time, unrelated
to `studentCode`, unrelated to any pre-existing field. It's the *only* thing standing between an
outsider and a student's record, so the defence is layered rather than relying on the PIN's
raw entropy alone:

- **Hard per-student lockout is the primary defence, not rate limiting.** `selfFillAttempts`
  increments on every wrong PIN for a given `studentCode`; at 5 failed attempts the record locks
  (`selfFillLockedAt` set) and the public endpoint refuses it outright — "contact reception" —
  regardless of which IP or device is asking next. This is what actually makes a 4-digit space
  workable: an unlimited attacker gets nowhere without staff intervention, the same trust model
  as an ATM PIN. DB-backed, so it holds even if Render runs multiple instances.
- **Per-IP sliding window** on every `/api/public/*` route, in-memory, as a second, independent
  layer — slows a burst against *many* different `studentCode`s at once, which the per-student
  lock alone doesn't cover. Honest limitation: in-memory means per-instance, so running two
  instances roughly doubles the effective burst allowance — acceptable for this role, noted
  rather than hidden.
- Errors stay generic ("that ID and code don't match") until the lockout threshold — never
  revealing which of the two values was wrong, or the lookup becomes an oracle regardless of how
  good the PIN itself is.
- Staff can reset `selfFillAttempts`/`selfFillLockedAt` for a genuinely locked-out student from
  the authenticated side (a parent mistyping 5 times is the expected failure mode, not an
  attack).

### Revised data model delta

- `Student.profileCompletedAt DateTime?` — null = awaiting self-fill (as originally planned).
- `Student.selfFillPin String?` — the 4-digit code, set at bulk-precreate, cleared once
  `profileCompletedAt` is set (nothing left to protect after that — the public endpoints refuse
  any request for an already-completed profile regardless).
- `Student.selfFillAttempts Int @default(0)`, `Student.selfFillLockedAt DateTime?` — the lockout
  state described above.
- `studentCode`'s generator (`services/studentCode.ts`) is **untouched** — see Correction 2.
- Bulk pre-create reuses `nextStudentCode()` and the existing `${studentCode}@tutorgo.in` email
  fallback from `admission.ts:54`, so pre-created students are ordinary `Student` rows —
  nothing downstream (fees, attendance, payroll) needs to know they arrived differently. `phone`
  is *not* required by this endpoint (dropped along with the phone-based design).
- Student-editable on the public form: `email`, `phone`, `parentPhone`, `dob`, `fatherName`,
  `motherName`, `school`. **Never** `courseId`, `batchId`, `admissionDate`, `studentCode` or
  `fingerprintId` — those are staff-controlled, and accepting them from an unauthenticated form
  would let a student move themselves into another course.

### Decisions confirmed with the user (2026-08-28)

- **Separate 4-digit PIN, not phone.** Printed on the roster next to the student ID; needs no
  pre-existing student data, so it works uniformly for every bulk-precreated student regardless
  of whether a phone number was on file. Security rests on the hard lockout described above, not
  on the PIN's raw entropy.
- **`studentCode`'s generator stays exactly as-is** — no randomized suffix, no keyed permutation.
  Both alternatives were considered and explicitly skipped; the new PIN carries the feature's
  entire identity-guessing defence, so nothing about the existing generator needed to change.
- **Auto-complete on submit.** Submitting sets `profileCompletedAt` and locks further self-edits;
  staff open only the records that need correcting, and can reopen one to let a student resubmit.
  No per-student approval step — it'd mean clicking through every student to gain nothing the
  edit-in-place view doesn't already give.

### Revised build order

1. **Rate-limiting middleware** (`middleware/rateLimit.ts`) — per-IP sliding window, applied to
   `/api/public/*`. Blocking prerequisite; nothing public ships before it. Built generic so it's
   reusable on `/auth/login` and the OTP routes later (both are currently unprotected — noted,
   not fixed in this pass, to keep the change surface honest).
2. **Schema**: `Student.profileCompletedAt`, `selfFillPin`, `selfFillAttempts`,
   `selfFillLockedAt`. One additive migration.
3. **`POST /students/bulk-precreate`** (authenticated, OWNER/ADMIN/RECEPTION) — name rows against
   one course/batch, transactional, reusing `nextStudentCode()`, generating a random 4-digit
   `selfFillPin` per row.
4. **Roster export** — `GET /students/roster.csv` (reusing `expenses.ts`'s `csvEscape`) and a
   print-styled roster page for browser Print-to-PDF. Name + student ID + PIN — the one export
   where the PIN is deliberately included, since printing it is the whole distribution
   mechanism; every other student-facing surface must never expose it.
5. **`routes/public.ts`** — mounted `/api/public`, explicitly *outside* `authenticate`, holding
   only `POST /students/lookup` and `POST /students/complete-profile`. Both re-verify
   code+PIN every call (no trusting a client-held id between requests), both increment/check the
   lockout counter, both return the same generic failure, both behind the IP-level limiter too.
6. **`/admission-form` page** — no `layout.tsx`, two-step (identify → fill), mobile-first. This
   is the one screen to test on a real phone, not a resized browser window.
7. **Staff view** — self-fill status per course/batch (filled vs pending counts), edit-in-place
   via the existing student edit modal, reopen action, a "reset lock" action for a genuinely
   locked-out student, plus the bulk-precreate entry form.
8. **Test**: pre-create → export → look up with correct code+PIN → wrong PIN rejected generically
   → 5th wrong PIN locks the record → locked record refuses even the correct PIN until staff
   reset → submit → confirm locked-for-editing on second attempt → staff reopen → resubmit works
   → cross-institute isolation (institute A's code unusable against institute B) → IP rate-limit
   trips on rapid sequential guessing across many codes → confirm the roster CSV/PDF is the only
   place the PIN ever appears → mobile pass on a real device.

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

### What was actually built

Matches the revised design above (4-digit PIN, not phone; `studentCode` generator untouched):

- `backend/middleware/rateLimit.ts` — generic per-IP sliding-window limiter, `ApiError.tooManyRequests()` (429) added to `lib/http.ts`. Applied to both public routes; written reusable for `/auth/login` and the OTP routes later (both still unprotected — noted, not fixed here).
- `backend/lib/csv.ts` — `toCsv`/`csvEscape` pulled out of `expenses.ts` so the roster export doesn't duplicate it.
- Schema: `Student.selfFillEligible` (permanent — see "Bugs found" below), `profileCompletedAt`, `selfFillPin`, `selfFillAttempts`, `selfFillLockedAt`.
- `students.ts`: `POST /bulk-precreate` (name-only rows, 4-digit PIN generated per row, returned once in the response — never re-servable except via reopen), `GET /roster.csv` + `GET /roster` (pending-only, name+ID+PIN, the one place the PIN is ever exposed again), `GET /self-fill-status` (filled + pending together), `POST /:id/self-fill/reopen`, `POST /:id/self-fill/reset-lock`. The three new GET routes are registered *before* `GET /:id` — Express matches by registration order, and `/roster.csv` etc. would otherwise be swallowed as an `:id` value.
- `routes/public.ts`, mounted outside `authenticate` at `/api/public`: `POST /students/lookup`, `POST /students/complete-profile`. Both re-verify code+PIN from scratch every call, both return the identical generic failure message regardless of *why* (no code, wrong PIN, already completed), both behind the IP limiter, plus the DB-backed per-student lockout (5 wrong attempts).
- Frontend: `app/admission-form/page.tsx` (no `layout.tsx` → no sidebar, two-step, mobile-first), `app/students-roster-print/page.tsx` (also shell-free, print-to-PDF via the browser, deliberately kept *outside* `students/` so it doesn't inherit that route's sidebar), `components/admissions/SelfFillTab.tsx` (status table + bulk-precreate modal + CSV/print export), wired into Admissions as a third tab.

### Bugs found during testing (real, not in the original plan — fixed before calling this done)

1. **Completed profiles vanished from the staff status view.** `self-fill-status` originally filtered on `selfFillPin: { not: null }` — but completing a profile clears the PIN (correct, security-wise), so the row disappeared entirely and staff could never see "who filled it in" or reopen it. Fix: added `Student.selfFillEligible Boolean`, set once at precreate and **never cleared** — a permanent "this row went through self-fill" marker independent of the security-sensitive PIN. `self-fill-status` now filters on this instead and shows filled + pending together; the roster export still filters on `selfFillEligible && profileCompletedAt: null` (pending only, as intended).
2. **Reopen didn't actually let the student back in.** It cleared `profileCompletedAt` but the PIN was already gone (cleared on completion) — so a "reopened" student had no way to authenticate again, making reopen silently mean "permanently locked out" instead of "try again". Fix: reopen now generates a **fresh** 4-digit PIN and returns it in the response; the frontend surfaces it in a dismissible banner ("share this with them") since that's the only moment staff can see it to relay to the student.

Both were caught by end-to-end testing against a running server (not unit-level), then verified fixed with the same test run: bulk-precreate → lock via 5 wrong attempts → staff unlock → complete profile → confirm it still shows in status → confirm PIN cleared → reopen → confirm old PIN rejected, new PIN works → resubmit → confirm status reflects it again. Also verified: wrong-PIN and nonexistent-code return byte-identical error bodies (no oracle), roster CSV never includes a completed student or extra fields, mismatched course/batch on bulk-precreate rejected, IP rate limiter trips under rapid sequential guessing.

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
6. **8c** (subject-wise fees) — **approved for build 2026-08-29**, add-ons cut from scope. Its own
   revised build order (stages 1–5 + frontend + test pass) lives in its section above; stage 1
   (`FeeStructure.isDefault`) ships standalone and is verified before the rest begins.

Each phase: schema migration → backend routes → frontend → mobile pass at 360px/390px → smoke test
per that phase's own "Build order" test checklist above, before starting the next phase — same
discipline as every prior phase in this doc.
