# Code Audit — Pass 2: Dead Code, Duplication & Redundancy

**Date:** 2026-08-29
**Scope:** Whole codebase (`backend/src`, `frontend/src`), excluding `backend/src/generated`.
**Method:** All 416 top-level `export` identifiers extracted, then counted repo-wide. Anything appearing exactly once (its own declaration) is dead. Backend endpoints matched against every `apiFetch`/`apiUpload`/raw-`fetch("/api…")` path in the frontend, with `${…}` normalised to a wildcard.

**This pass covers quality only** — no security or correctness findings. Those are Pass 1, tracked separately; H1–H3, M5, M6 and L7–L9 from that pass are already fixed.

> **Caveat on line numbers.** `backend/src/routes/platform.ts`, `fees.ts`, `auth.ts`, `org.ts` and `middleware/auth.ts` were edited during and after this audit (Pass 1 fixes + the plan-snapshot feature). Line numbers in those files may drift by 40–100 lines. Identifiers and file paths are accurate; re-grep before acting on a specific line.

---

## A. Confirmed dead code

### A1 — Safe deletions (nothing references these)

| # | Location | Identifier | Evidence | ~Lines |
|---|---|---|---|---|
| 1 | `frontend/src/components/app-shell/ProfileMenu.tsx` | `ProfileMenu` | The only occurrence of `ProfileMenu` in all of `frontend/src` is its own declaration. `Header.tsx` never renders it, and `Sidebar.tsx:236-242` still has the "Log out" button that this component's own docblock claims it replaces. The replacement never landed. | 155 |
| 2 | `frontend/src/lib/types.ts` | `CreateFeeStructurePayload`, `CreateFeeAccountPayload`, `RecordPaymentPayload`, `UpdateSalaryProfilePayload`, `RecordPayrollPaymentPayload`, `UpdateInstituteEmailConfigPayload` | Each appears exactly once repo-wide. Every mutation call site builds its body as an inline object literal. | ~56 |
| 3 | `frontend/src/lib/types.ts` | `INSTALLMENT_STATUS_LABELS` | Single occurrence. `InstallmentList.tsx:14` has its own `STATUS_TONE` map and renders the raw status string. | 6 |
| 4 | `frontend/src/lib/indianStates.ts` | `type IndianState` | Single occurrence. `INDIAN_STATES` and `INDIAN_STATE_OPTIONS` *are* used — only the derived type is dead. | 1 |
| 5 | `backend/src/middleware/rateLimit.ts` | `__resetRateLimitsForTests` | Single occurrence, and there is **no test directory anywhere in the repo** (`backend/test`, `backend/tests`, `*.test.ts` all absent). | ~5 |
| 6 | `backend/src/services/reminderScheduler.ts` | `stopReminderScheduler` | Single occurrence. `startReminderScheduler` is called from `server.ts`; nothing ever stops it, and the timer is `unref`'d so nothing needs to. | 4 |
| 7 | `backend/src/routes/attendance.ts` | import of `toTimeString` | Imported from `lib/lectureShared.js`, never referenced — `serializeLecture` (also imported) does the conversion. | 1 |
| 8 | `backend/src/routes/payroll.ts` | import of `periodKey` | Imported from `services/payrollSync.js`, never referenced in this file. | 1 |

### A2 — Dead API endpoints (no frontend caller)

Confirmed by full-path matching plus a manual grep for each literal. **Excluded as false positives** (reached via computed template strings): `payroll /runs/:id/approve|reopen`, `students /:id/activate|deactivate`, `platform GET /institutes`, `public /whatsapp/webhook` (Meta callback).

| # | Endpoint | File | Evidence | ~Lines |
|---|---|---|---|---|
| 9 | `GET /api/notifications/vapid-public-key` | `notifications.ts` | `frontend/src/lib/push.ts:31` reads the key from `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY` instead. | 10 |
| 10 | `GET /api/org/modules` | `org.ts` | No frontend request to `/org/modules`. Module state reaches the UI via `/auth/me` and `/organization/institutes/:id`. | 22 |
| 11 | `GET /api/platform/modules` | `platform.ts` | No frontend request to `/platform/modules`. | 19 |
| 12 | `PATCH` + `DELETE /api/expenses/events/:id` | `expenses.ts` | `ExpensesTab.tsx` only does `GET` and `POST /expenses/events`. Events have no edit or delete UI. | 26 |
| 13 | `PATCH /api/distribution/items/:id` | `distribution.ts` | Frontend hits `/distribution/items` (GET/POST) and `…/:id/receipts*` only. | ~20 |
| 14 | `GET` + `PATCH /api/organization/` | `organization.ts` | No frontend call to bare `/organization`. There is no OWNER-facing org-profile editor. | ~50 |
| 15 | `POST /api/organization/institutes/:id/admins` and `…/accountants`, plus the `inviteInstituteStaff` helper they solely call | `organization.ts` | Invites go through `POST /org/team` and `POST /platform/organizations/:orgId/institutes/:instituteId/admins`. | ~72 |

**Estimated Section A saving: ~450 lines.**

> **Judgement call on #14 and #15.** These are OWNER-scoped routes a not-yet-built "organization settings" page would plausibly want. If that page is on the roadmap, **keep #14** and delete only #15, which is genuinely superseded by `/org/team`.

---

## B. Duplication worth consolidating

### B1 — `fmtDate` / `formatDate`: 22 byte-identical copies

`new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })` is defined locally in:

`app/admissions/page.tsx`, `app/distribution/page.tsx`, `app/enquiries/page.tsx`, `app/platform/subscriptions/page.tsx`, `app/students/page.tsx`, `app/tests/page.tsx`, `app/tests/[id]/page.tsx`, `app/tests/[id]/sessions/[lectureId]/report/page.tsx`, `components/academics/BatchesTab.tsx`, `components/admissions/SelfFillTab.tsx`, `components/attendance/MarkAttendanceModal.tsx`, `components/distribution/DistributionRosterModal.tsx`, `components/enquiries/ActivityTimeline.tsx`, `components/expenses/ExpensesTab.tsx`, `components/expenses/LedgerTab.tsx`, `components/fees/DefaultersTab.tsx`, `components/fees/FeeAccountModal.tsx`, `components/fees/InstallmentList.tsx`, `components/fees/ReceiptModal.tsx`, `components/fees/ReceiptsTab.tsx`, `components/payroll/EditSalaryProfileModal.tsx`, `components/payroll/StaffLedgerModal.tsx`, `components/payroll/StaffTab.tsx`, `components/settings/RemindersTab.tsx`, `components/students/StudentProfileModal.tsx`

Near-variants that fold into the same helper with an options arg: `FacultyLecturesView.tsx` and `UpcomingLecturesWidget.tsx` (add `weekday`), `DistributionRosterModal.tsx` (drops `year`), `tests/page.tsx` and `StudentProfileModal.tsx` (nullable, return `"—"`), `ActivityTimeline.tsx` (`fmtDateTime`).

**Fix:** `formatDate(iso, opts?)` and `formatDateTime(iso)` in a new `frontend/src/lib/format.ts`; delete 25 local definitions. Pure functions, mechanical replace, zero semantic risk. **~75 lines.**

### B2 — `todayInput()`: 11 identical copies

`app/admission-form/page.tsx`, `app/attendance/page.tsx` (local `pad`, otherwise identical), `components/attendance/EditLectureModal.tsx`, `components/attendance/FacultyLecturesView.tsx`, `components/attendance/ScheduleLectureModal.tsx`, `components/fees/AddInstallmentRow.tsx`, `components/fees/RecordPaymentModal.tsx`, `components/fees/SetupFeeAccountModal.tsx`, `components/payroll/PayrollLedgerView.tsx`, `components/settings/RemindersTab.tsx`, `components/tests/ScheduleTestModal.tsx`

Also `fmtTime12` duplicated verbatim in `app/attendance/page.tsx` and `components/attendance/FacultyLecturesView.tsx`.

**Fix:** one `todayInput()` in `lib/format.ts`. **~40 lines.**

### B3 — Backend `todayDateOnly()`: 4 implementations, **two different semantics**

| File | Semantics |
|---|---|
| `backend/src/lib/dateOnly.ts` | Canonical — UTC getters, takes an optional `now` |
| `backend/src/lib/lectureShared.ts` | **Local**-time getters wrapped in `Date.UTC` |
| `backend/src/routes/fees.ts` | Private copy (UTC) |
| `backend/src/services/payrollSync.ts` | Private copy (UTC) |

`attendance.ts` imports the `lectureShared` one; `reminders.ts` and `reminderScheduler.ts` import the `dateOnly` one; `fees.ts` and `payrollSync.ts` use their own.

**Fix:** delete the three copies, import `lib/dateOnly.ts` everywhere. ⚠️ **Resolve the local-vs-UTC difference in `lectureShared` first** — that is the one place the two versions can disagree by a whole day on a non-UTC server. This is a latent bug, not just duplication.

### B4 — The "invite a staff user" flow, written 5 times

`org.ts` (POST /team), `organization.ts` (`inviteInstituteStaff`), `platform.ts` (institute admins), plus two more variants inside `platform.ts` at `POST /organizations` and `POST /organizations/:id/owner`.

All five do: lowercase email → `findUnique` duplicate check → `assertRoleCapacity` → `generateTempPassword` + `hashPassword` → `user.create` → `auditLog` → `sendMail(inviteEmailHtml)` → return `{ emailDelivered, tempPassword? }`.

**Fix:** extract `services/inviteUser.ts` exporting `inviteStaffUser({ instituteId, organizationId, actorUserId, role, fullName, email, phone, purpose })` → `{ user, emailDelivered, tempPassword }`. **~150 lines — the highest-value backend consolidation, and the riskiest.** Five call sites plus the invite-email path. Do it last.

### B5 — Module-code enum literal, 5 copies

`organization.ts` (×2), `platform.ts` (`MODULE_CODE_ENUM`), `platform.ts` (×1 more), `frontend/src/lib/types.ts` (`MODULE_CODES`).
**Fix:** one exported `MODULE_CODE_ENUM` in a backend lib; the others import it.

### B6 — `toggle-module` handler duplicated wholesale

`organization.ts` and `platform.ts` contain the same handler modulo how the institute is resolved.
**Fix:** shared `toggleInstituteModule(instituteId, moduleCode, isActive, actor)` service; each route keeps only its own institute-resolution guard.

### B7 — CSV escaping, duplicated despite an existing shared helper

`backend/src/lib/csv.ts` exists *specifically* to prevent this, and its own docblock names the offender — yet `expenses.ts` still defines a private `csvEscape` and hand-rolls the join.
**Fix:** delete both, use `toCsv` from `lib/csv.js` as `students.ts` already does. **~6 lines, zero risk.**

### B8 — Blob-download hand-rolled twice, neither in `lib/api.ts`

`components/admissions/SelfFillTab.tsx` (`downloadFile`) and `components/expenses/LedgerTab.tsx` (inline raw `fetch` + manual `getToken()`, bypassing `apiFetch` entirely).
**Fix:** add `apiDownload(path, filename)` to `lib/api.ts` next to `apiUpload`. ⚠️ `LedgerTab` **never checks `res.ok`**, so a 403 silently downloads the error JSON as `ledger.csv`.

---

## C. Redundant steps, N+1 queries, needless re-fetches

### C1 — Backend

| # | Location | Problem | Cheaper form |
|---|---|---|---|
| 1 | `fees.ts` (installment reschedule) | `findUnique` on the row the transaction just updated. | Capture the return of `tx.feeInstallment.update`. Its own sibling already does exactly this — see D1. |
| 2 | `payroll.ts` (run finalise) | `findUnique` on the `payrollRun` right after `tx.payrollRun.update`. | Return the update's result out of the `$transaction` callback. |
| 3 | `payroll.ts` | `loadProfile(...)` inside `for (const salaryProfileId of paidProfileIds)` — one query per paid staff member, purely to build a notification. | One `findMany({ where: { id: { in: paidProfileIds } } })` before the loop, into a Map. |
| 4 | `payroll.ts` | Per-item `payrollPaymentAllocation.create` + `payrollLineItem.update` in a nested loop — 2 round-trips per line item per profile. | `createMany` for allocations; `Promise.all` the updates inside the tx. |
| 5 | `attendance.ts` | `courseSubject.findMany` per assignment inside `for (const a of body.assignments)`. | One `findMany({ where: { courseId: { in: courseIds } } })`, group by `courseId`, validate in memory. |
| 6 | `attendance.ts` | `facultyAssignment.create` per assignment in one branch, `createMany` in the other. | Flatten to one row array, single `createMany`. |
| 7 | `tests.ts` | `batch.findUnique` per session in the pre-validation loop, plus `assertValidInvigilator` (another query per session). | One `batch.findMany` and one invigilator `findMany` before the loop; validate against Maps. |
| 8 | `students.ts` (bulk pre-create) | `nextStudentCode` + `student.create` + `studentBatch.create` + `createDistributionReceiptsForNewStudent` **per name** — a 60-name paste is ~240 sequential round-trips in one transaction. | Allocate the code block once, then `createMany` ×2. ⚠️ Higher risk (`nextStudentCode` sequencing) — not first. |
| 9 | `expenses.ts` | `from`/`to` query parsing copy-pasted between `/ledger` and `/ledger/export.csv`. | `parseDateRange(req)` helper — 6 lines. |

### C2 — Frontend

| # | Location | Problem | Cheaper form |
|---|---|---|---|
| 10 | `app/enquiries/page.tsx` | `load()` fetches `/academics/courses?active=true` alongside the enquiry list, and `load` is the body of a 250 ms-debounced effect on `[search]`. **Every keystroke re-fetches the full course list**, as does every `await load()` after `markLost` and `handleDelete`. | Split: courses in `useEffect(…, [])`, enquiries in the debounced one. `ExpensesTab.tsx` already has this shape — see D2. |
| 11 | `app/distribution/page.tsx` | Same shape — `/academics/courses` re-fetched on every `includeInactive` toggle and after every mutation. | Same split. |
| 12 | `app/admissions/page.tsx` | Inside a `Promise.all`, one branch awaits `/enquiries?status=NEW` and *then* awaits `?status=CONTACTED` — serialised for no reason. | Both as top-level `Promise.all` members and concat, or add multi-status support to `GET /enquiries`. |
| 13 | `components/expenses/ExpensesTab.tsx` | Two `apiFetch` calls fired as separate un-awaited statements; `loadLookups` returns before either settles, and one has no `.catch`. | `Promise.all([...])`. |
| 14 | Repo-wide (49 sites) | `await apiFetch(mutation); await load();` — the mutation usually already returns the updated object. | Not worth chasing everywhere. On a list page a full reload is defensible; **in a modal that already holds the row, splice the returned object into state.** Low priority. |

---

## D. Consistency drift

| # | Pair | Drift |
|---|---|---|
| D1 | `fees.ts` returns `serializeInstallment(updated)` straight from the `update` in one route; re-`findUnique`s the just-updated row in its sibling. | Same file, same resource, two idioms. |
| D2 | `ExpensesTab.tsx` separates `useEffect(loadLookups, [])` from `useEffect(loadExpenses, [filters])`; `enquiries` and `distribution` pages bundle static lookups into the filtered load. | Adopt the `ExpensesTab` shape (this is C10/C11). |
| D3 | `notifications.ts` `POST /:id/read` returns `{ id, read: true }`; `POST /read-all` returns `204`. `org.ts` `DELETE /message-templates/:type` returns a full object while **every other `DELETE` in the codebase returns 204** (attendance, enquiry, expenses ×3, fees ×2, payroll, platform, reminders, tests). | Three different "mutation succeeded" contracts. The message-template one arguably *should* return the default it reverts to — but then say so in a comment; right now it's the lone exception with no explanation. |
| D4 | `auth.ts` (×2) and `public.ts` return `res.json({ ok: true })`. | A fourth ack shape. Pick one rule and document it. |
| D5 | ~~`org.ts GET /plan` built its response from `institute.plan.*` while `assertRoleCapacity` enforced the institute snapshot.~~ | ✅ **Already fixed** during the plan-snapshot work — `GET /plan`, `GET /subscriptions` and the institute detail endpoint all route through `effectiveLimits()` now. |
| D6 | `SelfFillTab.tsx` downloads via a local `downloadFile`; `LedgerTab.tsx` inlines a raw `fetch` with a manual `Authorization` header and no `res.ok` check. | Two download idioms, neither in `lib/api.ts` (see B8). |
| D7 | `lib/money.ts` exports `formatMoney` with `en-IN` grouping, but ~8 display sites interpolate the raw Decimal string: `students/page.tsx`, `LedgerTab.tsx` (×2), `ExpensesTab.tsx`, `SetupFeeAccountModal.tsx`, `EditAmountControl.tsx`. | Renders `₹125000.00` instead of `₹1,25,000.00` **next to correctly-formatted values on the same screen**. |
| D8 | `lib/lectureShared.ts` `todayDateOnly()` uses local getters; `lib/dateOnly.ts` uses UTC. | Same name, same file tree, off-by-one-day disagreement on a non-UTC server. Duplicate of B3, listed here because the name collision makes importing the wrong one easy. |

---

# Phased fixing plan

Ordered by **payoff ÷ risk**. Each phase is independently shippable; run `npm run typecheck` in both `backend/` and `frontend/` at the end of every phase.

## Phase 1 — Pure deletions *(no behaviour change possible)*
**Effort:** ~1 hour · **Saves:** ~230 lines · **Risk:** none

- [ ] A1/1 — delete `ProfileMenu.tsx`
- [ ] A1/2 — delete the 6 unused payload interfaces in `lib/types.ts`
- [ ] A1/3 — delete `INSTALLMENT_STATUS_LABELS`
- [ ] A1/4 — delete `type IndianState`
- [ ] A1/5 — delete `__resetRateLimitsForTests` *(or keep it with a comment noting no suite exists yet — see Phase 7)*
- [ ] A1/6 — delete `stopReminderScheduler`
- [ ] A1/7, A1/8 — drop the two unused imports

**Verify:** both typechecks pass. Nothing else needed — if any of these were live, the compiler fails.

## Phase 2 — One-file mechanical fixes
**Effort:** ~1 hour · **Saves:** ~30 lines · **Risk:** very low

- [ ] B7 — `expenses.ts` uses `toCsv` from `lib/csv.js`
- [ ] C9 — extract `parseDateRange(req)` in `expenses.ts`
- [ ] C1/1, C1/2 — return the row the transaction already produced (`fees.ts`, `payroll.ts`); also closes D1
- [ ] B8 — add `apiDownload()` to `lib/api.ts`; **include the missing `res.ok` check**, which is a real bug

**Verify:** export a CSV from both the expenses ledger and the self-fill tab; reschedule an installment; finalise a payroll run.

## Phase 3 — Dead endpoints
**Effort:** ~1 hour · **Saves:** ~100 lines · **Risk:** low, but irreversible-ish

- [ ] A2/9–13 — remove the six dead endpoints
- [ ] **Decide on A2/14 and A2/15 first.** If an organization-settings page is planned, keep #14. Delete #15 either way.

**Verify:** grep the frontend once more for each path before deleting. Smoke-test push notifications (A2/9 touches the VAPID route) and the expenses events tab.

## Phase 4 — Shared frontend formatters
**Effort:** ~2 hours · **Saves:** ~120 lines · **Risk:** low, but a large diff

- [ ] Create `frontend/src/lib/format.ts` with `formatDate(iso, opts?)`, `formatDateTime(iso)`, `todayInput()`, `fmtTime12()`
- [ ] B1 — replace 25 local date formatters
- [ ] B2 — replace 11 `todayInput()` copies and 2 `fmtTime12` copies
- [ ] D7 — route the ~8 raw-Decimal display sites through `formatMoney`

Do this as **one commit per concern** (dates, then today-input, then money) so a regression is easy to bisect.

**Verify:** visually check one screen per module — dates should look unchanged, money should gain `1,25,000`-style grouping.

## Phase 5 — Query and fetch efficiency
**Effort:** ~3 hours · **Risk:** low–moderate

- [ ] C10, C11 — split static lookups out of debounced load effects (enquiries, distribution); also closes D2
- [ ] C12 — parallelise the two enquiry status fetches
- [ ] C13 — `Promise.all` + error handling in `ExpensesTab`
- [ ] C1/3 — batch the payroll notification profile lookups
- [ ] C1/5, C1/6 — batch attendance assignment validation and creation
- [ ] C1/7 — batch the tests session pre-validation

**Verify:** these are the first changes that alter query shape. Exercise each flow end-to-end: schedule a lecture with assignments, create a multi-session test, finalise a payroll run with several staff.

## Phase 6 — Convention sweep
**Effort:** ~1 hour · **Risk:** low, but touches API contracts

- [ ] D3, D4 — pick one rule (suggested: **`204` for deletes, the updated object for updates, and never a bare `{ ok: true }`**), document it in `CLAUDE.md` or a route-conventions comment, then align the outliers
- [ ] ⚠️ Changing a response shape means updating its frontend caller in the same commit

## Phase 7 — Structural refactors *(last, deliberately)*
**Effort:** ~1 day · **Saves:** ~250 lines · **Risk:** moderate–high

- [ ] **B3 first, and treat it as a bug fix, not a cleanup** — resolve the local-vs-UTC `todayDateOnly` discrepancy, then collapse the four copies onto `lib/dateOnly.ts`
- [ ] B5 — single `MODULE_CODE_ENUM`
- [ ] B6 — shared `toggleInstituteModule` service
- [ ] A2/14–15 — remove the organization-scoped invite routes (if Phase 3 deferred them)
- [ ] **B4 last** — extract `services/inviteUser.ts` and migrate all five call sites

**Verify:** B4 touches every invite path *and* the email that goes with it. Test: create an organization (owner + admin invite), invite an institute admin from the platform, invite a team member from institute settings, add an owner to an existing org. Confirm the temp password and the delivered email in each.

---

## Suggested sequencing note

Phases 1–4 are safe to do back-to-back in a single sitting and account for ~480 of the ~700 recoverable lines. Phase 7 is the only one that warrants its own branch and review.

Two items in this report are **latent bugs rather than cleanups** and should be pulled forward if they're ever hit in practice:

1. **B3 / D8** — the local-vs-UTC `todayDateOnly` split can silently produce off-by-one-day attendance and fee-overdue behaviour on a non-UTC server.
2. **B8** — `LedgerTab.tsx` downloads the error JSON as `ledger.csv` when the request fails.
