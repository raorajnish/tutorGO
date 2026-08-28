# TutorGO — Production Readiness & Feature Roadmap

_Compiled 2026-08-22. Snapshot of the codebase at this point in time — re-verify anything load-bearing before acting on it, since the code moves faster than this document will._

---

## 1. Production-readiness gaps

### Critical — fix before real users touch this

- **No rate limiting anywhere.** Login, OTP request/verify, and password reset are all unthrottled at the network level. The OTP flow has an app-level 30s resend cooldown and a 5-attempt cap per code (`backend/src/routes/auth.ts`), but nothing stops a script from trying different emails/passwords or spinning up fresh OTP requests as fast as the network allows. This is the single highest-priority gap — add `express-rate-limit` (or a Redis-backed limiter) on `/auth/*` at minimum.
- **CORS is wide open** — `app.use(cors())` in `backend/src/app.ts` with no origin allowlist. Any website can call the API from a logged-in user's browser. Needs a locked-down origin list per environment (`FRONTEND_URL` and nothing else in production).
- **No `helmet`** — missing standard security headers (HSTS, X-Frame-Options, Content-Security-Policy, etc.).
- **No tracked database migrations.** The project uses `prisma db push` only — there's no `prisma/migrations` folder. Fine for solo dev; in production this means no rollback path, no reviewable history of schema changes, and real risk of data loss if a schema change conflicts with live data. Move to `prisma migrate dev`/`deploy` before any real customer data exists.
- **Zero automated tests, no CI.** Every feature built this session was verified via manual curl scripts. Nothing runs automatically to catch a regression — e.g., a future change to payroll could silently break the Tests-invigilation-pay behavior that was manually verified today, and nothing would flag it.

### Important — fix soon after launch

- **Logging is `console.log`/`console.error`** — no structured logging (pino/winston), no error tracking (Sentry or equivalent). In production there's no way to know what broke, for whom, or how often, beyond re-reading raw stdout.
- **Shallow health check** — `GET /api/health` returns a static `{ok:true}` without checking DB connectivity. A load balancer or uptime monitor relying on this will report "healthy" even while the database is down.
- **No graceful shutdown** — no `SIGTERM`/`SIGINT` handling to drain in-flight requests before the process exits, which matters for zero-downtime deploys.
- **File uploads validated by MIME type + size only** (`backend/src/services/uploads.ts`) — no magic-byte/content sniffing, no malware scanning. A renamed executable with a spoofed `Content-Type` header would pass.
- **No retry/backoff** around external calls (Cloudinary uploads, SMTP email) — a transient network blip just fails the operation outright.
- **No Prisma connection-pool tuning** — no `connection_limit` on `DATABASE_URL`, no pool config in code. Fine at current scale, will matter once concurrent load rises.
- **No background job/queue system** — no bull/bullmq/agenda/cron. Anything that should run on a schedule (fee-overdue reminders, cleanup jobs, report generation) has no infrastructure to run on yet.
- **No centralized required-env-var validation at boot** — `JWT_SECRET` fails fast (`backend/src/lib/jwt.ts`), but Cloudinary config is only validated lazily on first upload attempt, and there's no single startup check that fails loudly if critical config is missing.

### Deployment — the actual blocker to shipping

- **No Dockerfile, no docker-compose, no CI/CD pipeline, no deployment docs.** Independent of code quality, there is currently no repeatable way to deploy this anywhere. This needs to exist before "production" means anything.

### What's already solid

- **Multi-tenancy isolation is clean.** A spot-check across `attendance.ts`, `fees.ts`, `payroll.ts`, and `expenses.ts` found every query properly scoped by `instituteId`/`req.tenantId`, either directly in `where` clauses or via loader helpers that verify tenant ownership before use. This is the area most likely to cause a catastrophic cross-tenant data leak if done wrong, and it isn't.
- **No SQL injection surface** — no raw `$queryRaw`/`$executeRaw` usage in application code.
- **Secrets aren't committed** — `backend/.env` is gitignored and untracked; `backend/.env.example` (tracked) uses placeholders only. The real `.env` does contain live secrets (Gmail SMTP password, Cloudinary keys, VAPID keys, DB password) — treat that file as sensitive if it's ever shared or backed up anywhere.
- **Password reset OTP design is sound** — hashed codes (never stored plaintext), 10-minute expiry, capped attempts, generic response to avoid account enumeration.

---

## 2. Feature roadmap

### Fills real gaps in what already exists

- **Refresh tokens / session revocation.** A JWT is valid for 7 days with no explicit "log out everywhere" action. Deactivating a user does block them on their *next* request (since `authenticate` re-checks `isActive`), but there's no way to immediately kill an already-issued token for, say, a compromised account.
- **Parent/guardian portal.** The entire system is staff-facing today. Parents have no way to see attendance, fees due, or test results without asking staff directly. A lightweight read-only view (attendance %, fee balance, test scores) is a natural extension of the printable/WhatsApp test report built this session.
- **Bulk import (CSV)** for students, staff, and fee structures. Currently everything is one-at-a-time creation — a real pain point when onboarding an institute that already has 200+ existing students.
- **Receipt/payslip PDF generation** — flagged in the project's own `developmentplan.md` Phase 9 as not yet built. Today a fee receipt is just a DB row with a receipt number, no actual printable document — unlike the Test result sheet, which already has a print/PDF flow to copy the pattern from.
- **Self-service data export/backup** for institute owners — no current way for an owner to export their own data (students, fees, attendance history) for their own records or in case they leave the platform. Both a trust feature and, depending on jurisdiction, an increasingly expected legal capability (e.g. India's DPDP Act).
- **Scheduled fee-overdue reminders.** A `FEE_OVERDUE_REMINDER` message template already exists — worth confirming whether it's actually triggered automatically on a schedule or only ever sent manually. A daily job that reminds parents of overdue installments is one of the highest-ROI features for this kind of business, and needs the background-job infrastructure above to exist first.

### Genuinely differentiating

- **WhatsApp Business API integration.** The app has now leaned on "copy this message, paste into WhatsApp yourself" three separate times (lecture scheduled, attendance marked, test results). Direct WhatsApp Business API sending — skipping the copy-paste step entirely — would be a strong differentiator, since WhatsApp is the dominant parent-communication channel for Indian coaching institutes specifically.
- **Online fee payment gateway** (Razorpay/Stripe/PayU) instead of manually recording a payment after the fact. Lets parents pay directly through a link and have the payment auto-reconcile against the installment ledger.
- **Multi-institute analytics rollup for Owners.** An OWNER with several institutes under one Organization has no cross-institute dashboard today — no combined revenue, attendance trend, or headcount view across branches.
- **Biometric device integration, for real.** `PRESENT_BIOMETRIC` exists as a manually-settable attendance status, but there's no actual device/webhook integration behind it — right now it's a label, not a hardware integration, despite biometric attendance likely being part of the pitch to institutes.
- **Study material / resource sharing.** A simple per-course/batch document library (notes, recorded lecture links, assignment PDFs) — a natural sibling to the Cloudinary upload infrastructure already built for test papers.
- **Video lecture linking.** Attach a Zoom/Google Meet link to a scheduled lecture, so online and offline institutes both fit the same scheduling model.

### Additional ideas worth considering

- **Two-factor authentication (MFA)** for OWNER/ADMIN accounts specifically — these are the highest-value targets for account takeover (they control money and staff), and MFA is already flagged in `developmentplan.md` Phase 9 as planned but not built.
- **Granular custom roles/permissions**, beyond the current fixed role set (OWNER/ADMIN/ACCOUNTANT/FACULTY/RECEPTION/STUDENT). Larger institutes often want e.g. a "Faculty who can also see fees" or "Accountant who can't see payroll" — fixed roles will eventually feel limiting.
- **Idle session timeout** for staff accounts, particularly on shared front-desk computers (RECEPTION role) — a forgotten logged-in session on a public terminal is a real exposure in a school-office setting.
- **In-app messaging** between staff and parents (or staff-to-staff), rather than relying entirely on external channels like WhatsApp/email.
- **Admission/enquiry funnel analytics** — conversion rate from enquiry → admission, drop-off points, source effectiveness (walk-in vs. referral vs. social) — the `Enquiry`/`EnquiryActivity` data already exists to support this, it's just not surfaced as analytics yet.
- **Document vault per student** — report cards, ID proof, certificates — attached to the student record, reusing the Cloudinary upload pattern.
- **Renewal reminders for RECURRING fee plans** — a monthly-billing student whose plan is about to lapse doesn't currently get proactively flagged.
- **Regional language support (i18n)** — Hindi/regional-language UI toggle, meaningful for reaching smaller-city coaching institutes beyond English-first metros.
- **Webhooks for third-party integrations** — let an institute wire TutorGO events (new admission, fee paid, test scheduled) into their own tools (Zapier, a CRM, etc.) without needing a bespoke integration built by you each time.
- **Institute branding / white-label** — custom logo and color accent per institute on parent-facing surfaces (receipts, the eventual parent portal, WhatsApp messages) — a natural upsell for a higher-tier plan.
- **Platform-side audit log viewer** — an audit trail already exists for some actions (payroll rate changes, reminders); worth extending consistently across all sensitive actions (plan changes, module toggles, user deactivation) and giving the SuperAdmin a searchable view of it, both for support and for compliance.

---

## Suggested next step

Given the two genuinely urgent security items (rate limiting + CORS lockdown) can be done in isolation without touching business logic, that's the natural place to start if you want to move on this list next.
