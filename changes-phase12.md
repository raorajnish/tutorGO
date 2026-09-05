# Phase 12 — Bulk import, MFA, session revocation, multi-institute analytics, study material, help & support

Planning doc, same convention as `changes-phase10/11.md`. Each sub-phase starts only when you say so.

---

## Status (updated as sub-phases are built)

| Phase | Status | Notes |
|---|---|---|
| 12.1 | **Built** | `POST /students/import`, `POST /org/team/import` + `GET .../template.csv` for both. Frontend: icon-only "Import" trigger on Admissions (not Students — the actual single-create action lives there) and on the Team tab, opening a shared `ImportModal` with an upload → preview (`dryRun=true`, nothing written) → confirm step, all in one modal. Verified live: preview writes nothing, confirm creates correctly, re-upload of the same file skips already-created rows. **Bug found and fixed during verification**: a row with no email (which gets an auto-generated address) had no stable key to dedupe on, so re-uploading recreated it — fixed with a `(courseId, phone)` fallback key. Not built: import history (`ImportRun` table) and fee-account setup during import — both were left as the plan's own stated default (report-only, student-record-only for the first cut). No inline cell editing for bad rows in the preview — discussed with the user and deliberately deferred; the CSV round-trip (download error report → fix → re-upload) is idempotent and considered good enough for now. |
| 12.2 | **Built** | `User.tokenVersion`, checked in `authenticate` alongside the existing suspension/portal checks. `POST /auth/logout-everywhere` (self-service) and `POST /platform/users/:id/logout-everywhere` (SuperAdmin lever, audit-logged). `change-password` and `reset-password` bump it automatically; change-password preserves the *current* session via the existing `X-Refreshed-Token` header so you're not logged out of the session that just changed its own password. Frontend: Profile page "Sign out of all devices" card; Platform → institute detail → Team list gets a per-member "Sign out everywhere" action. Verified live at the exact boundary: old token dies immediately on the next request (including the caller's own), fresh token/re-login works, SuperAdmin's lever works on another account. No password re-entry required to trigger self-service logout-everywhere — discussed with the user, deliberate (this is a low-risk, purely-session action, and gating it behind a password is actively counterproductive in the "I think my password leaked" scenario it exists for). |
| 12.3 | **Built** | `SupportTicket`/`SupportTicketMessage` models. `support.ts` (staff: create/list/reply) + additions to `platform.ts` (SuperAdmin: filterable queue, status changes, reply). Frontend: Help icon in the header (next to notifications, hidden for STUDENT/SUPERADMIN) opening a `HelpDrawer` with list → new-ticket → thread views; Platform side gets a "Support" nav entry, filterable queue page, and a per-ticket thread page. Reply on either side auto-transitions status (OPEN→IN_PROGRESS on a SuperAdmin reply, RESOLVED→OPEN on a staff reply) — verified live. **Two corrections to the plan surfaced during implementation**: (1) tickets are scoped by `organizationId`, not `instituteId` — the plan said "own institute's tickets," but an OWNER can file/read tickets before ever entering a specific institute, so institute-scoping breaks for that role; org-wide sharing also means a whole staff team sees the same conversation with the platform, which is the more useful behavior anyway. (2) SuperAdmins can't receive the in-app `Notification` row the plan assumed — that model's `instituteId` column is required and SuperAdmins have none; resolved without a schema change via the triage queue itself (their inbox) plus the email fallback to `SUPERADMIN_EMAIL`, which the plan's own open question had already leaned toward building. |
| 12.4 | Not built | |
| 12.5 | Not built | |
| 12.6 | Not built | |
| 12.7 | **Built** | `GET /platform/audit-log` — filterable (org/institute/action-contains/date range), paginated, actor/org/institute names resolved via one batched lookup per page (since `AuditLog`'s columns are plain strings, not relations, by design). Frontend: new "Audit log" nav entry, filterable table with expandable per-row metadata, desktop table + mobile cards. Verified live against real rows. |
| 12.8 | Not built | The highest-blast-radius item in this phase — explicitly flagged for sign-off before starting (see §6 below), and that sign-off hasn't happened. |
| 12.9 | **Built** | `GET /platform/search` across students/staff/institutes/organizations in parallel. Frontend replaces the previously-inert header search box (it took input but never queried anything) with a working, debounced (250ms), grouped-results dropdown, SuperAdmin-only. Verified live, including the 2-character minimum returning empty rather than querying. |
| 12.10 | **Built** | `InstituteSuspension` model; the existing suspend/reactivate route now requires a `reason` to suspend (verified: 400 without one) and writes one open/closed row per cycle. `GET /platform/institutes/:id/suspensions`. Frontend: suspend flow asks for a reason via its own modal (`ConfirmModal` has no field slot), institute detail page shows the full history. Verified live: reason required, suspension blocks real API access immediately (though `/auth/login` itself still issues a token before the very next request rejects it — pre-existing `authenticate` behavior, not a regression), reactivating correctly closes out the open row with who/when. Also added a working "Institute" dropdown filter on the audit log page (defaults to all institutes/all actions), populated from `GET /platform/institutes`. |
| 12.11 | Not built | Maintenance mode (global or per-institute) — requested after the rest of this phase, planned only. See its own section below for the sketch. |

**Also built, outside this doc's original scope, because it surfaced while wiring 12.2/12.7/12.9/12.10's platform-side UI:** a `/forbidden` (403) and global `/not-found` (404) page, both full-bleed and using the same `tg-mesh` textured brand background as the login screen. While wiring `/forbidden` into `RoleRoute`, found that **most sections had no frontend role gate at all** (only dashboard/platform/portal/ptm/portal-access did) — every other section relied purely on the sidebar hiding links plus the backend 403ing. Added `RoleRoute` to every remaining section layout, matching `navigation.ts`'s role lists exactly.

---

## Findings from reading the code first (these shape the plan)

1. **No CSV/TOTP libraries installed yet.** Bulk import needs a CSV parser (`csv-parse`, no existing dependency); MFA needs a TOTP library (`otplib` or `speakeasy`, also absent). Both are new dependencies, not swaps of something already there.
2. **`User` has no `tokenVersion` or MFA columns.** Session revocation and MFA both need new columns — neither piggybacks on something half-built.
3. **`AuditLog` is written to in four places (`org.ts`, `platform.ts`) but has no read/viewer route anywhere.** SuperAdmin can't currently see the audit trail that's already being recorded — a real, existing gap, not a new idea.
4. **The closest precedent to bulk import is admission's `bulk-precreate`** (`students.ts`) — but that only creates placeholder rows with a self-fill PIN for the student to complete themselves later. It has no field mapping, no validation report, and isn't reusable as-is for "import 200 fully-formed existing students."
5. **No help/support-ticket feature exists at all** — confirmed by search. `ApiError` messages already say "contact support" in a couple of places (suspended institute, void-payment block), but there's genuinely nowhere for that contact to happen inside the product today.
6. **`Organization` already has `institutes: Institute[]`** — the relation the multi-institute rollup needs already exists; this phase is aggregation logic and a new page, not a new relation.

---

## Ordering

| Phase | Feature | Why here |
|---|---|---|
| 12.1 | Bulk CSV import (students, staff) | Highest real-world pain relative to effort — onboarding a 200-student institute one row at a time is the single biggest friction point in the product today. Self-contained: one parser, one validation pass, one route per entity. |
| 12.2 | Session revocation ("log out everywhere") | Small and sharp — one new column, one new check in `authenticate`, one button. Directly completes the sliding-session work from §11.3, which bounded session *length* but left no way to kill one specific token on demand. |
| 12.3 | Help & support (contact SuperAdmin) | Self-contained new domain, no dependency on anything else in this phase. Low complexity, meaningful trust/support value. |
| 12.4 | Multi-institute analytics rollup | Depends on nothing here, but is genuinely more work than it looks — reuses `analytics.ts`'s existing per-institute queries, run N times and combined, rather than a new aggregation engine. |
| 12.5 | Study material / resource sharing | Depends on nothing here. Placed after the rollup because it's a bigger frontend surface (a library UI, not a table) for roughly the same backend effort. |
| 12.6 | MFA for OWNER/ADMIN | Placed last: highest complexity (TOTP secret handling, backup codes, a new step in the login flow that every existing session must handle gracefully), and the one most worth getting right rather than fast. |
| 12.7 | SuperAdmin: audit log viewer | Read-only over data that already exists — the cheapest, highest-value item in this entire phase. |
| 12.8 | SuperAdmin: impersonate / "view as" | The riskiest SuperAdmin item — placed after the audit log viewer specifically so impersonation has a real audit trail to write into from day one, not bolted on after. |
| 12.9 | SuperAdmin: global search | Small, read-only, independent of everything else. |
| 12.10 | SuperAdmin: suspension reasons + history | Small, additive, no behavior change to the suspension check itself. |
| 12.11 | Maintenance mode (global or per-institute) | Added after the rest of this phase — sits on the same `authenticate` choke point as §12.2/§12.10, so it's placed last for the same reason 12.6 was: worth getting the boundary conditions right rather than fast. |

---

## Phase 12.1 — Bulk CSV import (students, staff)

**The flow:** staff download a template CSV (or use their own, matching documented column headers) → upload it → the server validates every row before writing anything → a per-row result report (created / skipped / error, with the reason) → nothing partially applied silently.

### Design decisions, stated up front

- **Validate-then-commit, not row-by-row.** Every row is checked (required fields, valid course/batch codes, no duplicate email/phone/studentCode) before any database write happens. A CSV with 195 good rows and 5 bad ones should not silently create 195 students and leave staff guessing which 5 failed *and why* — the report shows all 200 outcomes from one pass.
- **Never invents data.** A row referencing a course code that doesn't exist is an error for that row, not an auto-created course. Same principle as everywhere else in this codebase (e.g. admission's course/batch validation) — the import surfaces a clear, fixable error rather than silently creating things the CSV writer didn't intend.
- **Idempotent-ish re-upload.** If staff fix the 5 bad rows and re-upload the *same file*, the 195 already-created rows must not duplicate. Matched on the same uniqueness rule the manual create routes already enforce (`email` for students/staff) — an existing email is reported as "already exists, skipped," not a duplicate or a hard failure of the whole batch.
- **Staff never get automatic portal logins from this.** Consistent with §10.6's core rule — bulk-imported students land exactly where a manually-created student would: no login, `Course.portalEnabled` and the Portal Access page decide the rest later.

### Data model

No new persisted model — an import run's report is generated and returned in the response, not stored. (If you want import history later, that's a one-table addition — flagged as an open question below, not built by default.)

### Backend

- `POST /students/import` (OWNER/ADMIN/RECEPTION — same bar as manual student creation) — multipart CSV upload, `csv-parse` for parsing, Zod-validated per row against the same shape `POST /students` already expects (course code → resolved to `courseId`, batch name → resolved to `batchId`, scoped to the institute).
- `POST /org/team/import` (OWNER/ADMIN) — same shape for staff (ADMIN/ACCOUNTANT/FACULTY/RECEPTION), reusing `assertRoleCapacity` per row so a bulk import can't silently blow through the plan's headcount limits.
- `GET /students/import/template.csv` / `GET /org/team/import/template.csv` — a downloadable CSV with the exact expected headers and one example row, so "what columns do I need" is never a guessing game.
- Both import routes return `{ created: number, skipped: number, errors: number, rows: [{ line, status: "CREATED"|"SKIPPED"|"ERROR", reason?, name? }] }` — every row accounted for, never a bare success count.
- File size cap and row cap (propose 2,000 rows) to keep one request bounded — a larger one-off migration is a "talk to us" case, not a self-serve upload.

### Frontend

- A new "Import" button next to the existing "Add student" / "Invite" actions on Students and Team pages, opening a modal: download-template link → file picker → upload → results table (scrollable, colour-coded by status) with a "Download error report" (CSV of just the failed rows plus their reasons, so staff don't have to eyeball a long list to find what to fix).

### Risk

The real risk is a badly-formed CSV silently doing the wrong thing. Mitigated by validate-then-commit and a full per-row report — nothing here is riskier than the manual single-row create routes already in production, just run N times behind one confirmation step.

### Open questions

1. **Import history** — worth a `ImportRun` table (who imported what, when, how many rows) for audit purposes, or is the per-request report enough since nothing else in the app keeps a log of bulk actions today?
2. **Fee accounts on import** — should a bulk student import also accept fee-plan columns (course fee, discount, installment count) to set up a `FeeAccount` in the same pass, or is fee setup always a separate manual step afterward? Doing both in one row raises the validation surface a lot; I'd lean toward student-record-only for the first cut, fee setup as a deliberate follow-on action per student (same as today).

---

## Phase 12.2 — Session revocation ("log out everywhere")

**Completes what §11.3 started.** Sliding expiry with a 14-day cap bounds how *long* a session can live; this adds the ability to kill one specific already-issued token *right now* — the piece that was still missing when a password is changed, an account is suspected compromised, or someone just wants "sign me out of all my devices."

### Data model

```prisma
// User
tokenVersion Int @default(0)
```

One integer. Every JWT gains a `tokenVersion` claim, stamped at sign time from the user's current value. `authenticate` compares the token's `tokenVersion` against the live column — a mismatch means "this token was issued before the last revocation" and is rejected exactly like an expired one. Bumping the column is the entire revocation mechanism: no token blocklist table, no per-token bookkeeping, no cleanup job — one column, one comparison, on the same user-row read `authenticate` already does every request.

### Backend

- `signToken()` gains a `tokenVersion` field (same treatment as `sessionStart` in §11.3 — read the live value at sign time, embed it in the payload).
- `authenticate` adds one more check alongside the existing suspension/portal-eligibility ones: `payload.tokenVersion !== user.tokenVersion` → `401`, same "sign in again" message pattern already used for a moved/suspended account.
- `POST /auth/logout-everywhere` (any authenticated role) — increments `tokenVersion` by 1. Immediately invalidates every token issued before this moment, including the one making the request (the caller gets logged out too — the confirm dialog says so).
- Changing a password (`POST /auth/change-password`, the reset-password flow) should also bump `tokenVersion` automatically — the standard reason to want this is exactly "my password leaked," so the two should always travel together rather than requiring a second explicit action.
- SuperAdmin gets the same lever for any user (`POST /platform/users/:id/logout-everywhere`) — the actual "kill a compromised account's session right now" tool, usable without waiting for the user to do it themselves.

### Frontend

- Profile page: "Sign out of all devices" button with a confirm dialog explaining it logs the current session out too.
- Platform → user detail: the same action, framed as an admin/security tool.

### Risk

Very low — this is one column and one extra equality check on a query that already runs. The only behavioural change users will notice is the one they asked for.

---

## Phase 12.3 — Help & support (contact SuperAdmin)

**The flow:** any staff user sees a "Help & support" entry → writes a message (optionally categorised: billing, bug, feature request, urgent) → SuperAdmin sees a triage queue across every organization, can reply, and can mark resolved. The submitter sees the reply and thread in-app (reusing the existing `Notification` model for "you got a reply" the same way every other in-app alert works).

### Data model

```prisma
enum SupportTicketStatus { OPEN IN_PROGRESS RESOLVED }
enum SupportTicketCategory { BILLING BUG FEATURE_REQUEST OTHER }

model SupportTicket {
  id             String                @id @default(cuid())
  organizationId String
  instituteId    String?
  createdByUserId String
  category       SupportTicketCategory @default(OTHER)
  subject        String
  status         SupportTicketStatus   @default(OPEN)
  createdAt      DateTime              @default(now())
  updatedAt      DateTime              @updatedAt

  messages SupportTicketMessage[]
}

model SupportTicketMessage {
  id             String   @id @default(cuid())
  ticketId       String
  authorUserId   String
  /// True when written by a SuperAdmin — lets the thread render "You" vs
  /// "Support" without a second lookup.
  isFromPlatform Boolean
  body           String
  createdAt      DateTime @default(now())
}
```

One ticket, many messages — a real thread, not a fire-and-forget contact form, so a back-and-forth ("can you send a screenshot?") is possible without opening a second ticket.

### Backend

- `POST /support/tickets` (any staff role) — creates a ticket + its first message.
- `GET /support/tickets` (own institute's tickets, any staff role) / `GET /support/tickets/:id` + `POST /support/tickets/:id/messages` (reply on your own ticket).
- `GET /platform/support/tickets` (SuperAdmin, filterable by status/category, across every organization) — the triage queue.
- `PATCH /platform/support/tickets/:id` (SuperAdmin) — status changes, plus replying via the same `POST .../messages` route (role-gated to allow either the ticket's own org or a SuperAdmin).
- A reply on either side fires the existing `notify()`/`sendPush()` pair — this reuses infrastructure, it doesn't invent a second notification system.

### Frontend

- New "Help & support" nav entry (staff side) — ticket list + a simple threaded view, matching the visual language of the existing Notifications drawer.
- Platform side: a new "Support" section in the SuperAdmin nav — queue view with status/category filters, unread-first ordering, the same thread UI reused.

### Risk

Low — this is a self-contained new domain with no interaction with money, auth, or existing data models beyond linking to `Institute`/`Organization`/`User` for context.

### Open question

**Email fallback?** Should a new ticket also email the platform's own support address (via the existing `sendMail` plumbing) so it's not exclusively real-time-in-app, in case a SuperAdmin isn't watching the dashboard? I'd lean yes — cheap to add, and matches how every other important event in this app already has both an in-app and an out-of-band channel.

---

## Phase 12.4 — Multi-institute analytics rollup

**For an OWNER with more than one Institute under their Organization** — a combined view (revenue, attendance, headcount, enrollment trend) across every branch, not just the per-institute dashboards that exist today.

### Design decision

**Reuses `analytics.ts`'s existing per-institute query logic, run once per institute and combined in memory — not a new aggregation engine.** Every number already has a correct, tested single-institute query; the rollup's job is fetching N of them in parallel and summing/comparing, which is far lower risk than re-deriving the same figures a second way.

### Backend

- `GET /analytics/organization-rollup` (OWNER only, and only meaningful with `organizationId` set — i.e. not while "inside" one institute) — for every active institute under the caller's organization, runs the same institute-analytics query `GET /analytics/institute` already answers, then returns both the per-institute breakdown and the summed total.
- Guarded behind institute count: an OWNER with exactly one institute doesn't need this page at all — the route can 400 with a clear message ("Your organization has only one institute — see its own Analytics page.") rather than showing an empty rollup.

### Frontend

- New page, OWNER-only, reachable only when `organization.institutes.length > 1` (nav item conditionally shown — same pattern the codebase already uses for module-gated nav items).
- Top: combined stat cards (total revenue, total active students, blended attendance %). Below: one row per institute with its own numbers, sortable, so an OWNER can spot which branch is lagging at a glance.

### Risk

Low on correctness (reusing proven queries), moderate on performance if an organization has many institutes — N sequential per-institute queries would be slow; running them with `Promise.all` (already the pattern used everywhere else in this codebase for independent lookups) keeps it to the cost of the slowest single institute's query, not the sum.

---

## Phase 12.5 — Study material / resource sharing (per batch)

**A simple per-batch document library** — notes, recorded-lecture links, assignment PDFs — the natural sibling to the Cloudinary upload infrastructure already built for test papers and payment proofs.

### Data model

```prisma
enum ResourceKind { FILE LINK }

model StudyResource {
  id              String       @id @default(cuid())
  instituteId     String
  batchId         String
  subjectId       String?
  title           String
  kind            ResourceKind
  /// Set for kind=FILE — Cloudinary asset (services/uploads.ts), reusing
  /// the exact pattern from test papers: public visibility (course
  /// material, not a financial document), a stored publicId so it can be
  /// deleted later.
  assetUrl        String?
  assetName       String?
  assetPublicId   String?
  /// Set for kind=LINK — a Zoom recording, a YouTube link, a Drive folder.
  externalUrl     String?
  uploadedByUserId String
  createdAt       DateTime     @default(now())
}
```

### Backend

- `POST /study-resources` (OWNER/ADMIN/FACULTY — teaching staff, matching who can already schedule lectures/tests for a batch) — either a file upload (through `uploadAsset`, `visibility: "public"`, same as test papers) or a link.
- `GET /study-resources?batchId=` (staff) and `GET /portal/study-resources` (student, scoped to their own current batch — same `currentBatchId()` helper §10.6 already built for the portal's timetable/tests routes).
- `DELETE /study-resources/:id` — deletes the Cloudinary asset (`deleteAsset`) alongside the row, same discipline as everywhere else uploads are removed.
- A `RESOURCE_UPLOADED` notification, dispatched through the existing `notifyBatch()` — reuses §10.6/§11.2's machinery rather than inventing a fifth notification path.

### Frontend

- Staff: a new tab on the batch detail view (or its own page filtered by batch/subject) — upload a file or paste a link, a simple list with delete.
- Student portal: a new "Resources" section — grouped by subject, files open the Cloudinary URL directly (public asset, no signing needed, same as test papers today), links open in a new tab.

### Risk

Low — this is the same upload pattern already proven twice (test papers, payment proofs), applied to a third, lower-stakes kind of file.

---

## Phase 12.6 — MFA for OWNER/ADMIN

**The highest-value accounts to protect** — OWNER and ADMIN can move money and issue staff/student logins, making them the accounts an attacker most wants. TOTP (Google Authenticator / Authy style, not SMS) — no per-message cost, no carrier dependency, works offline once set up.

### Data model

```prisma
// User
mfaSecret         String?   // encrypted at rest, same pattern as InstituteWhatsAppConfig.accessToken (lib/crypto.ts)
mfaEnabledAt      DateTime?
mfaBackupCodes    String[]  // hashed, one-time-use — lost-device recovery without a support ticket
```

### Backend

- `POST /auth/mfa/setup` (authenticated OWNER/ADMIN) — generates a TOTP secret + QR code payload (`otplib`), returns it for the user to scan; not yet enabled until confirmed.
- `POST /auth/mfa/confirm` — verifies a code against the pending secret, sets `mfaEnabledAt`, generates and returns 10 backup codes **once** (never retrievable again, same principle as a temp password).
- `POST /auth/mfa/disable` — requires the current password, not just being logged in (the standard "prove you're still you" pattern for turning off a security feature).
- **Login flow change**: `POST /auth/login` returns a `mfaRequired: true` + a short-lived challenge token when the account has MFA enabled, instead of a full session token. A new `POST /auth/mfa/verify` exchanges the challenge + a 6-digit code (or a backup code) for the real session token.
- Every existing session for that user survives unaffected — MFA gates new logins, not already-issued tokens (that's what §12.2's revocation is for, separately, if ever needed together).

### Frontend

- Settings → a new "Security" section: enable/disable MFA, QR code display during setup, backup codes shown once with a clear "save these somewhere safe" warning.
- Login page: a second step (6-digit code input) appears only for accounts that have it enabled — invisible to everyone else.

### Risk

The highest-complexity item in this phase, and the one most worth building carefully rather than fast: a bug here can lock an owner out of their own institute. Mitigations: backup codes from day one (not a follow-up), and a SuperAdmin-side "disable MFA for this account" escape hatch (with a mandatory audit-logged reason) for the genuine "I lost my phone and my backup codes" case — otherwise a real institute owner has no recovery path at all.

### Open questions

1. **Mandatory or optional?** Opt-in for now (a Security-tab toggle), or do you want it required for every OWNER/ADMIN going forward? I'd start opt-in — forcing it retroactively on existing accounts mid-session is disruptive, and adoption pressure can come later (e.g. a dashboard banner) once it's proven out.
2. **Does the SuperAdmin "disable MFA" escape hatch worry you** as its own attack surface (a SuperAdmin account takeover could disable any owner's MFA)? Worth weighing against the alternative of a genuinely un-recoverable lockout — flagging rather than deciding for you.

---

## Phase 12.7 — Audit log viewer

**The cheapest, highest-value SuperAdmin addition here.** `AuditLog` rows are already written in four places (`org.ts`, `platform.ts`) and are currently invisible to everyone — this is a read-only viewer over data that already exists, not a new write path.

### Backend

- `GET /platform/audit-log` — filterable by `organizationId`, `instituteId`, `action`, and a date range; paginated (this table only grows). No new model, no new writes — purely a `findMany` over what's already there.

### Frontend

- New "Audit log" page under Platform nav — a filterable table (action, target, actor, timestamp), each row's `metadata` expandable for detail.

### Risk

Minimal — read-only, additive, touches nothing else.

---

## Phase 12.8 — Impersonate / "view as"

**SuperAdmin temporarily sees the product exactly as a specific OWNER/ADMIN does** — for support debugging ("show me what you're seeing") without asking a customer to screen-share.

### Design decisions

- **Read-only by default.** The impersonation token is scoped so mutating routes are refused unless explicitly escalated (a second, separate confirmation to go from "view" to "act as") — a support session accidentally recording a payment or deleting a student is the failure mode this guards against.
- **Always visible.** A persistent, unmissable banner ("Viewing as {name} at {institute} — Exit") — impersonation must never be mistakable for the SuperAdmin's own session.
- **Fully audited.** Every action taken while impersonating is logged with *both* identities (the SuperAdmin and the user being viewed as) — `AuditLog.metadata` carries the real actor, not just the apparent one.

### Backend

- `POST /platform/institutes/:id/impersonate` (SuperAdmin) — issues a short-lived, clearly-scoped token carrying an `impersonatedBy` claim alongside the normal payload. `authenticate` recognizes this claim and (a) enforces read-only unless escalated, (b) stamps `impersonatedBy` onto every `auditLog()` call made during the session.
- A short natural expiry (propose 30 minutes) independent of the normal session TTL — impersonation sessions should be short by construction, not rely on someone remembering to exit.

### Frontend

- Platform → institute detail: an "View as" action opening the normal app shell, banner-wrapped, with the target institute's data.

### Risk

The genuinely risky item in this phase — a SuperAdmin account takeover with impersonation is a takeover of *every* institute. Mitigations above (read-only default, short expiry, dual-identity audit trail) are the minimum bar, not optional extras.

---

## Phase 12.9 — Global search

**Find "which institute is this phone number in" without guessing which organization to open.**

### Backend

- `GET /platform/search?q=` (SuperAdmin) — searches `Student.name/email/phone/parentPhone`, `User.fullName/email`, `Institute.name/code`, `Organization.name/code` in parallel, each result tagged with its type and the organization/institute it belongs to (reusing the same "so a support request can be resolved" framing already noted in `platform.ts`'s existing `/users` endpoint).

### Frontend

- A search box in the Platform header, results grouped by type, each linking straight to the relevant institute/organization detail page.

### Risk

Low — read-only, no new model.

---

## Phase 12.10 — Suspension reasons + history

**`Institute.isActive` toggles today with no record of why or when — this turns "why is this institute suspended" from tribal knowledge into a real answer.**

### Data model

```prisma
model InstituteSuspension {
  id            String    @id @default(cuid())
  instituteId   String
  reason        String
  suspendedByUserId String
  suspendedAt   DateTime  @default(now())
  liftedAt      DateTime?
  liftedByUserId String?
}
```

### Backend

- The existing institute-suspend route gains a required `reason` field, writing one `InstituteSuspension` row per suspend/lift cycle rather than just flipping the boolean.
- `GET /platform/institutes/:id/suspensions` — the full history for one institute.

### Frontend

- Institute detail page: a "Suspend" action now asks for a reason; a small history list shows every past suspension with who/when/why/how long.

### Risk

Minimal — additive, no behavior change to the suspension check itself (`authenticate` already enforces `isActive`).

---

## Phase 12.11 — Maintenance mode (global or per-institute)

**Not built — planning only, for later.** Requested alongside 12.7/12.9/12.10 but deliberately not started yet.

**The distinction from suspension (§12.10):** suspension is administrative/punitive and open-ended (non-payment, policy violation) and is logged as a permanent mark against that institute. Maintenance mode is the opposite in spirit — "we're deploying or migrating, back shortly" — self-inflicted by the platform, expected to be short, and should say so to whoever hits it rather than looking like a suspension.

### Design decisions, stated up front

- **Two independent scopes, one mechanism.** Global (the whole platform, e.g. during a schema migration) and per-institute (e.g. a data-fix for one customer) both need to exist, and both should reuse the same check rather than being two unrelated features.
- **SuperAdmin always bypasses it.** Maintenance mode has to be toggle-able and verifiable by the person who turned it on, from inside the product, while it's active — a global flag that locks out its own operator would be self-defeating.
- **A message and (optional) expected-back time are part of the flag, not an afterthought.** Whoever hits it — staff or student — should see why and roughly when, not a generic error.

### Data model (sketch, not final)

```prisma
model MaintenanceWindow {
  id            String    @id @default(cuid())
  /// Null = global (every institute). Set = just this one.
  instituteId   String?
  message       String
  expectedUntil DateTime?
  startedAt     DateTime  @default(now())
  endedAt       DateTime?
  startedByUserId String
  endedByUserId   String?
}
```
One open row (`endedAt: null`) at a time per scope — same "at most one open row" shape as `InstituteSuspension`.

### Backend (sketch)

- `authenticate` gains one more check, same place as the suspension/tokenVersion ones: is there an open global `MaintenanceWindow`, or one scoped to `payload.instituteId`? If so and the caller isn't SUPERADMIN, reject with a distinct error code (`MAINTENANCE_MODE`, not `UNAUTHORIZED`) carrying the message/expectedUntil so the frontend can render it specifically rather than as a generic auth failure.
- `POST /platform/maintenance` (start, global or scoped) / `DELETE /platform/maintenance/:id` (end) — SuperAdmin only, audit-logged like suspension.
- Worth deciding at build time: does starting global maintenance also force-logout everyone currently active (reusing §12.2's `tokenVersion` bump), or just block new requests from this point forward? Leaning toward the latter — less disruptive, and anyone mid-action doesn't lose work mid-keystroke — but flagging it as an open question rather than deciding now.

### Frontend (sketch)

- Platform: a simple on/off control (global) plus a per-institute toggle on the institute detail page, both asking for a message.
- Staff/student side: a dedicated full-page state (reusing the `StatusPage` component built for 403/404) shown instead of the app when `MAINTENANCE_MODE` comes back from any request, with the message and expected-back time.

### Risk

Low in isolation, but it sits directly on the request-auth path (`authenticate`), so it deserves the same "verify at the exact boundary" treatment §12.2 got — a hand-crafted request just before/after a window opens and closes — before being marked done.

---

## Open policy decisions carried over from earlier phases

Not new gaps — both were already raised, built as far as they could be without an answer, and explicitly deferred in `handoff.md` §3. Restated here so they're tracked in the same place as everything else in this phase, not just in a prior-session handoff note:

- **Automatic fee-overdue sweeps.** The mechanics exist; whether (and on what schedule/threshold) overdue fees should auto-trigger a reminder or escalation was never decided. Needs a policy answer, not more code.
- **Unpaid-leave payroll deduction.** Same shape — full-pay-regardless-of-leave vs. a per-day deduction for FIXED-salary staff was never picked (`changes-phase10.md` §10.4b). PER_LECTURE pay is unaffected either way since it's already zero for a day nothing was taught.

---

## Further SuperAdmin ideas — not yet planned as phases

Lower priority, or only worth building once the platform is at a different scale than it is today. Listed here so they're not forgotten, not because they're scheduled:

**Operational visibility:**
- **Platform-wide health dashboard** — beyond the existing `/platform/stats`, real signal: WhatsApp delivery failure rates, email bounce rates, Cloudinary storage usage per organization (relevant once you're paying for it), error rates if logging/monitoring ever gets built (flagged as a separate production-readiness gap).
- **Billing/invoicing view** — if institutes are ever actually charged through the platform rather than tracked as a plan label, SuperAdmin needs to see who's paid, who's overdue, and be able to generate/send an invoice. Out of scope until there's a real payment-collection story for institute subscriptions themselves (separate from the UPI/QR feature, which is institute → student, not institute → platform).
- **Bulk institute operations** — e.g. "extend every trial-plan institute by 7 days," useful once there's a self-serve trial/signup flow; not urgent while every institute is manually onboarded by you.
- **Audit log export** — §12.7 is view-only (a filtered table, paginated); there's no download-as-CSV. Fine today, but worth building before the first time someone actually needs the audit trail for a compliance or legal request rather than a quick "who did this" check — at that point "screenshot the table" isn't a real answer.
- **Support ticket SLA / stale-ticket notification** — §12.3's queue shows every open ticket, but nothing pings anyone if one sits unanswered for days; it only surfaces by a SuperAdmin actively checking the page. A daily digest or an age-based flag on the queue itself would close that.

**Configuration reach:**
- **Feature-flag / module rollout control** — stage a new module (or a whole phase like the ones we've built) to specific organizations before making it generally available, rather than every institute getting every module the moment it ships.
- **Plan template versioning** — right now editing a `Plan`'s limits doesn't affect institutes already on it (deliberately, per the existing design), but there's no view of "which institutes are on plan v1 vs v2" if the plan's definition itself changes shape over time.

**Lower priority / only matters at real scale:**
- **Data export/deletion tooling** for an organization that leaves the platform (ties to the DPDP-Act point already flagged in `PRODUCTION_READINESS.md`) — a SuperAdmin-side "export everything for org X" and "purge org X" pair, with strong confirmation. This is also the answer to "an institute churns and asks for their data" — not urgent while every institute is still active and manually onboarded, but the kind of request that becomes urgent fast the first time it's actually asked for.
- **A/B or staged rollout tooling** — genuinely not worth building until there are enough institutes for it to mean anything statistically.

---

## What I need from you before starting any phase

1. **12.1** — decide the two open questions (import history table? fee-plan columns in the same pass?), otherwise nothing blocking.
2. **12.2** — nothing blocking; this is small and I'd suggest doing it early regardless of what else you pick.
3. **12.3** — decide the email-fallback question; otherwise nothing blocking.
4. **12.4** — nothing blocking, but only useful to you if you actually have an organization with 2+ institutes to test against.
5. **12.5** — nothing blocking.
6. **12.6** — decide opt-in-vs-mandatory and whether the SuperAdmin disable-MFA escape hatch is acceptable; this is the one phase I'd want explicit sign-off on before writing a line of code, given the lockout risk.
7. **12.7** — nothing blocking; do this one anytime, it has no dependencies.
8. **12.8** — confirm the read-only-by-default + escalation design is acceptable before building; this is the second phase (after 12.6) I'd want explicit sign-off on given the blast radius of a SuperAdmin account compromise combined with impersonation.
9. **12.9** — nothing blocking.
10. **12.10** — nothing blocking.
11. **Order** — I've ranked by effort-vs-value above; say if you want to reorder (e.g. MFA first despite its complexity, if account security is the priority over onboarding convenience).

Nothing here starts until you pick.
