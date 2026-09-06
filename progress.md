# TutorGO — Progress Tracker

> Living document. Rewritten in full on 2026-09-05 — the previous version predated phases 8 through 14 entirely (wrong credentials, wrong page count, described the app as it was in early August). For the full end-to-end feature list, see [`FEATURES.md`](./FEATURES.md). For the detailed plan-and-build history of each phase, see `changes-phase8.md` through `changes-phase14.md` (each has its own status table) and `handoff.md` (the operating manual — architectural rules, conventions, things a fresh session gets wrong).
>
> **Last updated:** 2026-09-05

---

## 1. Project overview

TutorGO is a multi-tenant SaaS ERP for coaching institutes, schools, and colleges — enquiry through admission, attendance, fees, payroll, and now a student portal, a platform-side SuperAdmin console, and a support/ops layer on top.

- **Platform layer (SuperAdmin)** — provisions organizations/institutes, manages plans and module subscriptions, sees platform-wide delivery health, runs a global search, reviews the audit trail, triages support tickets, schedules maintenance windows, and holds the escape hatches (force logout, disable a stuck MFA, suspend an institute) for accounts and institutes that get stuck.
- **Tenant layer (OWNER/ADMIN/ACCOUNTANT/FACULTY/RECEPTION)** — fully isolated per-institute workspaces: Enquiries → Admissions → Students → Academics → Attendance → Tests → Fees → Expenses → Payroll → Distribution → PTM → Study material → Settings.
- **Student layer (STUDENT)** — a separate portal (`/portal/*`), not a cut-down staff view: their own timetable, tests/marks, attendance, fees (with a self-serve UPI QR + payment-proof submission), study material, and notifications.
- **Tenant isolation** — every operational query is scoped by `instituteId`/`req.tenantId` from the authenticated JWT, never from the request body or params.
- **Module gateway** — an institute without a module subscribed gets `403 MODULE_DISABLED` on that module's routes regardless of role.

### Stack

| Layer | Tech |
| --- | --- |
| Frontend | Next.js (App Router), React, Tailwind CSS v4, TypeScript — port **3000** |
| Backend | Node.js, Express, TypeScript (ESM), Zod — port **4000**, all routes under `/api` |
| Database | PostgreSQL, Prisma (driver adapter, ESM client) — tracked migrations as of 2026-09-06 (`npm run prisma:migrate` in dev, `prisma:deploy` for a fresh clone/production) |
| Auth | JWT (bearer token in `localStorage`, not cookies) + bcrypt, role-based access, sliding-expiry sessions with a hard cap, per-session revocation, optional TOTP MFA |
| File storage | Cloudinary, via one shared upload service (magic-byte validated, public-vs-authenticated visibility decided per file type) |
| PWA | Installable, push notifications, offline app-shell caching |

### Dev credentials

These are the seeded/known test accounts as of this update — check `handoff.md` if any of these stop working, since it's the doc that gets updated when a session changes one.

| Role | Email | Password | Notes |
| --- | --- | --- | --- |
| SuperAdmin | `superadmin@gmail.com` | `superadmin@2026` | Platform-seeded, not invited |
| Owner/Admin (demo institute) | `demo.admin@tutorgo.local` | `E2eTest!2345` | "Demo Main Campus" under "Demo Academy" |

### How to run

```bash
# Backend (port 4000)
cd backend; npm install; npx prisma db push; npm run dev

# Frontend (port 3000)
cd frontend; npm install; npm run dev
```

Verification convention for this codebase (see `handoff.md` §5): typecheck both sides (`npx tsc --noEmit`), lint the frontend (`npx next lint --dir src`), then verify anything auth- or money-adjacent with real HTTP requests against the running dev server and a real (test) database state — not just a passing typecheck. `next build`/`next start` share a `.next` cache with the dev server and can corrupt each other if run concurrently; default to `tsc --noEmit` instead.

---

## 2. What's built

Full detail lives in `FEATURES.md` and the individual `changes-phaseN.md` files. Headline summary:

- **Phases 1–11** (core ERP through PWA/push) — enquiries, admissions, students, academics, attendance (incl. biometric device scans), tests, fees (waterfall payment engine, receipts, defaulters, UPI/QR self-serve collection, payment-proof approval), payroll (fixed + per-lecture, runs, ledgers), expenses, distribution tracking, PTM, WhatsApp + email dispatch, document storage, the student portal, and PWA installability with push notifications. All verified live during their own build passes.
- **Phase 12** — bulk CSV import (students/staff), session revocation ("log out everywhere" + a SuperAdmin force-logout lever), Help & Support (staff-to-SuperAdmin tickets), study material (course-scoped resource library), MFA (TOTP, opt-in, every staff role), an audit log viewer, global search, institute suspension reasons + history, and maintenance mode (global or per-institute scheduled downtime). Not built: multi-institute analytics rollup (12.4, nothing blocking, just not requested) and impersonation/"view as" (12.8, deliberately gated on explicit sign-off — the single highest-blast-radius item in the product).
- **Phase 13** — the UPI payment QR is now generated client-side from the institute's UPI ID rather than uploaded as a static image, so it can never fall out of sync with a changed UPI ID. The "share a GPay screenshot into the app" idea (13.2) was discussed and deliberately not built — narrow payoff (Android-only, depends on undocumented share-text formats) against real new plumbing this app's `localStorage`-JWT auth would require; the manual screenshot-upload path already covers every device.
- **Phase 14** — a platform-wide health dashboard (WhatsApp/email delivery failure rates, worst-institute-first) and institute data export (an OWNER's own CSV bundle, plus a SuperAdmin-side equivalent for offboarding). Deletion was deliberately not built — this codebase has never had a real delete anywhere (every suspend flow keeps history forever on purpose), and a real purge needs an explicit answer to "what does deleted mean" before any code.
- **Also done outside any single phase's original scope**: a redesigned, shared document layout for receipts and (newly built from scratch) payslips — there was no real payslip document before this, only a WhatsApp-style text confirmation; `/forbidden` (403) and a global `/not-found` (404) page; `RoleRoute` added to every section that was missing frontend role gating (previously only the sidebar hid the link, with no page-level check); an app-wide thinner, auto-hiding scrollbar; the dark-mode toggle moved from the header into the profile dropdown.

---

## 3. Pending / explicitly deferred

Not gaps found by accident — each of these was raised, discussed, and deliberately left for later:

| Item | Why it's waiting |
| --- | --- |
| Multi-institute analytics rollup (12.4) | Nothing blocking; only useful once an org actually has 2+ institutes to view together. |
| Impersonate / "view as" (12.8) | Highest-blast-radius item in the product — a compromised SuperAdmin account plus impersonation is a compromise of every institute. Needs explicit sign-off on the read-only-by-default design before any code. |
| Web Share Target for payment proofs (13.2) | Android-only, best-effort text parsing of an undocumented GPay share format, and would need new server-side hand-off plumbing solely because this app authenticates via `localStorage` rather than cookies. Judged not worth it versus the manual upload path that already works everywhere. |
| Institute data deletion (14.2) | This codebase has never had a real delete anywhere. Needs an actual policy answer — hard-delete, anonymize-but-keep-financial-history, or export-then-purge — before any schema/route work. |
| Two older policy questions (from Phase 10) | Automatic fee-overdue sweeps, and whether unpaid leave should deduct from a FIXED salary — both need a business decision, not code. |
| Billing/invoicing view, bulk institute operations | Blocked on things that don't exist yet: the platform has no mechanism to actually charge institutes, and there's no self-serve trial/signup flow to make "bulk" mean anything. |
| Smaller, explicitly parked ideas | Audit log CSV export (currently view-only), a stale-ticket SLA notification for the support queue, a platform-wide health/error-monitoring tool beyond the messaging-delivery dashboard that exists today. |

---

## 4. Known caveats

- `changes-phase12.md`'s own status table had drifted from the code before this update (12.11 maintenance mode was fully built without that table being updated) — corrected as part of this pass. Treat any phase doc's status table as a claim to spot-check against the actual code before fully trusting it, per `handoff.md`'s own warning that "this file rots the moment code moves."
- `PRODUCTION_READINESS.md` (dated 2026-08-22) is explicitly known-stale in multiple places (claims no rate limiting and no upload validation, both of which exist) — don't cite it without re-checking each claim.
- `developmentplan.md` and the pre-2026-09-05 version of this file predate Phase 8 and are historical context only.
