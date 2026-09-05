# Phase 14 — Platform health dashboard + institute data export/deletion

Planning doc, same convention as `changes-phase10–13.md`.

**Scope note, decided before writing anything:** you asked to plan four things; only two are actually buildable right now. See below.

---

## Status

| Phase | Status | Notes |
|---|---|---|
| 14.1 | **Built** | `GET /platform/health` — pure aggregation over `OutboundMessage` (WhatsApp) and `MessageLog` (email), both already written on every send attempt elsewhere in the app; no new tracking, no new writes. Date range (defaults to last 30 days), overall failure/bounce rate, and a per-institute breakdown sorted worst-first by whichever channel is worse for that institute. Frontend: new "Health" entry under Platform nav, stat cards + a table (desktop) / card list (mobile), reusing the same conventions as the audit log and support queue pages. Storage-usage question from the plan left unresolved as scoped — deliberately not built into v1. Verified live: real data returns correctly against the dev database, an empty date range returns cleanly zeroed data rather than erroring, and non-SuperAdmin access is rejected by the same standing `requireSuperAdmin` middleware every other platform route uses. |
| 14.2 | **Export built; deletion not built** | `services/instituteExport.ts` — a zip of five CSVs (students, fee installments, payments, attendance, payroll payments) streamed directly to the response via `archiver` (installed fresh; note its v8 API dropped the classic `archiver("zip", opts)` factory in favor of a `ZipArchive` class — worth knowing if this dependency is ever touched again). `GET /org/export` (OWNER/ADMIN, self-service, in Settings → Institute Details) and `GET /platform/institutes/:id/export` (SuperAdmin, audit-logged, placed in the institute detail page's Access card alongside suspend/reactivate — the actual use case is "this institute is being suspended/wound down, get a copy first"). Both a real loading state (spinner + "Preparing…"), not just a disabled button — a whole-institute zip can take a few seconds. Deliberately skipped 13.2 (share-from-GPay) as part of this same conversation — discussed the real cost (this app's localStorage-JWT auth means a share hand-off needs new server-side temporary-storage plumbing purely to bridge an unauthenticated POST to an authenticated upload) against the narrow payoff (saves two form fields, Android-only, depends on GPay's undocumented share format) and judged it not worth building versus the export feature. Deletion still not sketched into code — still needs an answer to "what does deleted mean" (§14.2's open question 2) before any code. Verified live: real zip downloads and opens correctly with real data in all five CSVs for both the self-service and SuperAdmin routes, the audit log entry is written correctly, a nonexistent institute 404s, and a non-SuperAdmin caller is rejected by the same standing `requireSuperAdmin` middleware every other platform route uses. |

---

## Why billing/invoicing and bulk institute operations are not in this phase

- **Billing/invoicing view** — there is currently no mechanism for the platform to charge institutes at all. `Institute.planId` is a label, not a payment relationship; the UPI/QR feature (§13.1) is institute → student, not institute → platform. A billing view built now would be a screen with nothing real to show — this is blocked on a business decision (how institutes actually get charged), not on engineering. Worth returning to once that decision exists, not before.
- **Bulk institute operations** — the motivating example ("extend every trial-plan institute by 7 days") needs a self-serve trial/signup flow to mean anything. Every institute today is manually onboarded by you, one at a time, so there is no real "many institutes at once" case yet to build a tool for.

Both stay in the "Further ideas" list rather than becoming phase items — flagging this now so it's a decision, not a silent drop.

---

## Findings from reading the code first

1. **Two delivery-tracking models already exist and already carry the signal a health dashboard needs.** `OutboundMessage` (WhatsApp) has `status` (`QUEUED`/`SENT`/`FAILED`, presumably) and `error`; `MessageLog` (email) has `delivered: Boolean` and `error`. Neither is aggregated or surfaced anywhere today — `/platform/stats` only counts organizations/institutes/users. This phase is aggregation over data that already exists, not a new tracking system.
2. **Cloudinary storage usage per institute is *not* derivable from anything stored today.** `uploadAsset()` receives a `bytes` count back from Cloudinary on every upload but never persists it — there's no column anywhere recording how large an asset is. Getting real per-institute storage numbers means either (a) calling Cloudinary's own Admin API and aggregating by folder/tag at read time, which is live and always accurate but is a live third-party call on every dashboard load, or (b) adding a `sizeBytes` column going forward, which would need a backfill call to Cloudinary for every existing asset to be complete. Flagging this now rather than assuming it's free — see the open question below.
3. **`PRODUCTION_READINESS.md` already flags data export as a gap**, and frames it as **self-service for institute owners** ("no current way for an owner to export their own data... for their own records or in case they leave the platform"), not as a SuperAdmin-only tool. My earlier note in `changes-phase12.md` framed it as SuperAdmin-side. These are different features with different audiences — worth deciding which one (or both) this phase actually builds.
4. **There is no delete anywhere in this platform, by design** (`platform.ts`'s own suspend-route comment: "there is deliberately no delete endpoint, here or anywhere else"). A real "purge org X" capability would be the first exception to that rule in the entire codebase — worth being deliberate about, not treating as a routine CRUD addition.

---

## Phase 14.1 — Platform-wide health dashboard

**What it answers that `/platform/stats` doesn't:** is anything actually broken right now — WhatsApp messages failing to send, emails bouncing — and where.

### Design decisions, stated up front

- **Aggregation over existing rows, not a new tracking system.** `OutboundMessage` and `MessageLog` already record every attempt; this reads them, it doesn't add a new write path.
- **Per-organization/institute breakdown, not just a platform-wide number.** A 2% platform-wide WhatsApp failure rate is meaningless without knowing it's actually one institute's misconfigured template failing 100% of the time — the dashboard needs to point at the *specific* institute, not just report an aggregate.
- **Storage usage deferred to its own decision** (see open questions) — it's real, but it's the one piece here that isn't a free read over existing data.

### Backend

- `GET /platform/health` — for a date range: WhatsApp send/fail counts and rate (overall + grouped by institute, worst-first), email delivered/bounced counts and rate (same grouping), both drawing from `OutboundMessage`/`MessageLog` with a straightforward `groupBy`.
- No new model, no new write path.

### Frontend

- New "Health" page under Platform nav — headline failure-rate numbers, then a table of institutes sorted by worst delivery rate first (the "which institute needs a call" view), reusing the dataviz conventions already established on the Analytics pages (StatCard, TrendChart).

### Risk

Low — read-only, same shape as the audit log viewer (§12.7).

### Open questions

1. **Storage usage — include it or not?** If yes: live Cloudinary Admin API call (accurate, adds latency and an external dependency to a dashboard load) vs. a stored `sizeBytes` column added going forward (fast, but incomplete for every asset uploaded before the column existed, and existing assets would need a one-off backfill call per asset to be complete). Leaning toward leaving storage out of v1 and adding it once it's actually the number you're chasing — flagging rather than deciding.
2. **Error-rate/logging integration** — `PRODUCTION_READINESS.md` separately flags that there's no application error monitoring at all (Sentry or equivalent). This dashboard can show WhatsApp/email failures today; it can't show "the app threw a 500 fifty times an hour" until that separate gap is closed. Worth knowing this dashboard answers "is messaging broken," not "is the app broken."

---

## Phase 14.2 — Institute data export / deletion

**Two different features bundled under one heading in the earlier note — worth splitting them explicitly, since they have different audiences and different risk profiles.**

### Design decisions, stated up front

- **Export and delete are separate capabilities, not one "offboard" button.** An owner wanting their own records for peace of mind is a completely different event from an institute actually leaving the platform — conflating them means either over-gating the harmless one or under-gating the dangerous one.
- **Export can be self-service (OWNER-triggered) as `PRODUCTION_READINESS.md` frames it.** There's no reason an owner needs to ask a SuperAdmin for a copy of their own institute's data.
- **Deletion is the one place this platform would deliberately break its own "no delete" rule.** Every other suspend/reactivate flow in this codebase treats `isActive: false` as the terminal state specifically so financial and attendance history stays intact forever. A real purge is a one-way door and should be treated with at least the ceremony session revocation (§12.2) and suspension (§12.10) got — SuperAdmin-only, a mandatory reason, audit-logged, and very likely a time-delayed "confirm again in 7 days" step rather than an immediate irreversible action from a single click.

### Data model

None new for export (it's a read). For deletion: reuse the `InstituteSuspension`-style pattern — a `DELETE` is preceded by suspending the institute first (already reversible, already audited), and only a second, explicit, delayed confirmation actually purges. No new model is strictly required if deletion is scoped to "soft-delete via existing suspension + a hard-delete script run manually by you" rather than a self-service button — see open question 2.

### Backend

- `GET /org/export` (OWNER/ADMIN) — a full dump of the institute's own data (students, fee accounts, attendance, payroll, distribution) as a downloadable archive (CSV per table, zipped, reusing `lib/csv.ts`'s existing `toCsv()` — no new export format invented).
- `GET /platform/organizations/:id/export` (SuperAdmin) — the same capability, for support/offboarding cases where the owner can't or won't do it themselves.
- Deletion: **not sketched into a route yet** — see open question 2. This is the one piece of this phase genuinely worth a design conversation before any schema/route work starts, given it's a first-of-its-kind capability in this codebase.

### Frontend

- Settings → a new "Export my data" action for OWNER/ADMIN, plain and low-ceremony (it's read-only and reversible-by-nature — nothing is deleted).
- Platform → institute detail → an equivalent SuperAdmin-side export action.
- Deletion UI intentionally not planned until the backend design is settled.

### Risk

Export: low — read-only, no new write path, same risk class as any other CSV export already in the product. Deletion: **high** — this is a genuinely new class of operation for this codebase (the first real delete), and deserves explicit sign-off the same way impersonation (§12.8) does, before any code.

### Open questions

1. **Is export enough for now, with deletion left unbuilt until an institute actually asks to leave?** Given every institute today is active and manually onboarded, building export first and treating deletion as "designed properly when the first real request arrives" avoids building a high-risk, low-certainty feature speculatively.
2. **If deletion does get built, what should "deleted" mean?** Options: (a) permanent hard-delete of every row (the literal ask, but irreversible and in tension with the fee/attendance-history-forever principle this codebase has held everywhere else); (b) an extended suspension that also anonymizes personally-identifying fields (names, phone numbers, emails) while keeping aggregate financial/attendance history intact — closer to what data-protection law usually actually requires (erase personal data, not necessarily every record of a transaction); (c) export-then-hard-delete, where the export in 14.2 is the institute's copy and the platform's own copy is what gets purged. These have very different implementation shapes — worth answering before any schema work, not deciding by default.

---

## What I need from you before starting

1. **14.1** — decide the storage-usage question (leave out of v1, or take on either the live-Cloudinary-call or backfill approach). Otherwise nothing blocking.
2. **14.2 export** — nothing blocking; low risk, can start any time.
3. **14.2 deletion** — needs an actual answer to "what does deleted mean" (open question 2) before any code — this is the one item in this whole phase I'd treat the way MFA (§12.6) and impersonation (§12.8) were treated: plan fully, get explicit sign-off, then build carefully rather than fast.
