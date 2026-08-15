# TutorGO — Development Plan

> Source spec: [`prd.md`](./prd.md) (target feature set), [`technicalarchitecture.txt`](./technicalarchitecture.txt) (original architecture notes), [`projdesc.txt`](./projdesc.txt) (early design discussion). This file is the **build plan**: what modules exist, what each contains, and the order we build them in.
>
> **Stack:** Next.js (App Router) frontend · Express + TypeScript backend · Prisma 7 ORM · PostgreSQL · JWT auth.
>
> **Status as of this doc:** project folder is empty — nothing has been scaffolded yet. Development proceeds **phase by phase**; each phase is only started when explicitly requested.

---

## 1. System Shape (read this before any module)

TutorGO is a **two-layer multi-tenant SaaS**:

- **Platform layer** — the SuperAdmin (you, the product owner). Global, no `instituteId`. Creates institutes, owns the module catalog, toggles which modules each institute has paid for/enabled.
- **Tenant layer** — each institute (coaching center/school) is a fully isolated workspace. Every table in the tenant layer carries an `instituteId`; a query without that filter is a bug.

Two enforcement mechanisms apply to almost every module below:

1. **RBAC** — roles `SUPERADMIN, OWNER, ADMIN, FACULTY, RECEPTION, STUDENT`. Enforced both in the UI (sidebar visibility) and in the API (middleware guards) — the API guard is the real security boundary, the UI is just convenience.
2. **Module Gateway** — an institute only has access to the modules it has subscribed to (`ENQUIRY, ADMISSION, ATTENDANCE, FEES, PAYROLL, EXPENSE`). A disabled module blocks its entire router with `403`, regardless of role. Academics/Students/Staff/Settings/Dashboard are always available (not gated).

These two pieces (multi-tenancy + RBAC + module gateway) are built in **Phase 0** because every module after that depends on them.

---

## 2. Modules — Full Feature Breakdown

### 2.1 Platform (SuperAdmin) — *not gated, SUPERADMIN only*
Global control plane, separate from any institute.

- **Institute provisioning:** create institute (name, unique code, owner name/email/phone, initial module selection). Auto-creates the `OWNER` user with a temp password and emails credentials (or returns the temp password inline if SMTP isn't configured).
- **Module management:** catalog of all modules; per-institute toggle (subscribe/unsubscribe) from the platform side, independent of what the institute itself does in Settings.
- **Institute directory:** search/list institutes, view details (profile, team, active modules), resend owner invite (regenerates temp password).
- **Global SMTP config:** one mail transport for the whole platform, cached, testable.
- **Platform stats:** institute count, active institutes, total tenant users, total students, modules in catalog, revenue collected (aggregated across institutes).

### 2.2 Auth & Onboarding — *not gated, all roles*
- **Auth:** login (email+password → JWT), `/me` (user + institute profile + active modules), change-password (mandatory on first login for temp passwords), forgot-password (stub now, real reset flow later).
- **Onboarding wizard** (OWNER/ADMIN only, runs once per institute, step position never regresses):
  1. **Profile** — institute name, email, phone, address, city.
  2. **Modules** — pick which modules to subscribe to.
  3. **Academics** — create at least one course, one subject, one batch (single transaction).
  4. **Team** — bulk-invite staff (1–50), each with a role and (if faculty) a salary type + amount.
  5. **Optional — Biometrics** — enable/disable + provision devices.
  6. **Complete** — validates steps 1–3 done, marks onboarding finished.
- Dashboard shows a live "X of 4 steps done" setup checklist until complete.

### 2.3 Organization / Settings — *not gated, OWNER/ADMIN manage*
- **Institute profile** — name, city, email, phone, address (editable post-onboarding).
- **Module toggles** — same catalog as Platform, but self-service from inside the tenant.
- **Biometric attendance toggle** — on/off, reversible; off disables all devices and the scan endpoint.
- **Security** — change password.

### 2.4 Academics — *not gated, manage: OWNER/ADMIN/RECEPTION*
Your "Course module."

- **Courses** — name, duration (months), description. Shows batch count per course.
- **Subjects** — name, short code (used on lecture/attendance labels).
- **Batches** — name, linked course, start date, optional end date (open-ended = "Ongoing"). Shows enrolled-student count and lecture count per batch.

Batches are the pivot everything else (students, lectures, attendance, faculty schedules) hangs off of — this is why Academics is built right after the foundation phase.

### 2.5 Enquiry — *gated by `ENQUIRY`, manage: OWNER/ADMIN/RECEPTION (+ faculty can edit)*
- **Lead capture** — name, phone, course interested, source (Walk-in/Referral/Social/Phone/Other), next follow-up date, notes.
- **Pipeline** — status states `NEW → CONTACTED → CONVERTED | LOST`, tabbed board with counts per stage.
- **Actions per lead** — edit, mark contacted, convert to admission, mark lost, delete.
- Students can view (read-only) if the module is visible to them; they cannot create/edit.

### 2.6 Admission — *gated by `ADMISSION`, manage: OWNER/ADMIN/RECEPTION*
Your "Admission module": enquiry → admission → student generation, in one place.

- **Admit directly** or **admit from an enquiry** (pre-fills name/phone/course; on submit marks the enquiry `CONVERTED`).
- **Student record creation** — name, email (optional, falls back to `{studentcode}@local.in`), phone, parent phone, class/standard, DOB, father's/mother's name, school, admission date, optional batch assignment, optional fingerprint ID.
- **Deterministic student code generation** — `{INSTITUTE_CODE}-{YY}-{CLASS_CODE}-{SEQ}`, sequence per institute+year+class, always 4-digit, gapless.
- **Funnel view** — Pipeline tab (open leads) vs Admitted tab (converted-to-active students).

### 2.7 Students — *gated by `ADMISSION` for create/assign; view otherwise open to managers*
- **Directory** — search/filter (active/inactive/all), stat cards (active students, total on file, active batches, fee book value).
- **Profile drawer** — contact info, parents, school, DOB, admission date; **batch history** (join/leave dates, never overwritten — new assignment closes the old one); **fee account snapshot**; **recent attendance** (last 10 records).
- **Batch reassignment** — moving a student to a new batch closes the current `StudentBatch` row and opens a new one, preserving history.
- **Deactivation** instead of deletion.

### 2.8 Attendance — *gated by `ATTENDANCE`; schedule: OWNER/ADMIN/RECEPTION, mark: staff + assigned faculty*
- **Lecture scheduling** — batch, subject, faculty, date, start/end time. A faculty member scheduling their own lecture can omit the faculty field (auto-resolves to self).
- **Marking** — per-lecture roster, cycle each student through Present/Absent/Leave/Holiday, "mark all present" shortcut, single-transaction upsert.
- **Daily summary** — for staff: per-lecture expected vs present vs absent vs marked, for a chosen date.
- **Student self-view** — "My attendance": lectures tracked, present count, attendance rate %, recent lecture list.
- **Biometric devices** (opt-in, deferred to a later sub-phase) — provision/enable/disable/remove devices; unauthenticated scan endpoint keyed by device key + fingerprint ID; auto-marks `PRESENT`/`BIOMETRIC` if the fingerprint maps to a student currently inside a scheduled lecture window.

### 2.9 Fees — *gated by `FEES`, manage: OWNER/ADMIN/RECEPTION, students view own*
- **Fee accounts** — one per student, `finalFee = courseFee − discount`, split into N installments (monthly spacing, last installment absorbs rounding).
- **Payments** — amount, mode (UPI/Cash/Card/Bank Transfer/Cheque), date, optional target installment (else auto-applies to the earliest open one). Every payment gets a deterministic **receipt number** (`RCT-YYMM-SEQ` per institute).
- **Auto-reconciliation** — installment status (`PENDING/PARTIAL/PAID/OVERDUE`) recomputed transactionally from summed payments after every payment; manual override supported (e.g. waivers).
- **Student self-view** — "My fees": total/paid/balance, installment plan, payment history.

### 2.10 Expenses — *gated by `EXPENSE`, OWNER/ADMIN only*
- **Ledger** — title, category, amount, date, notes; filterable by date range and category.
- **Categories** — manage custom categories, optional income/expense flag.
- Every expense mirrors into a shared `FinanceEntry` table for later ledger/P&L reporting.

### 2.11 Payroll — *gated by `PAYROLL`, manage: OWNER/ADMIN, faculty see own payslips*
- **Salary model per faculty** — `FIXED` (flat monthly) or `PER_LECTURE` (rate × validated lecture count in period).
- **Run lifecycle** — Preview (dry run, nothing saved) → Create draft → Approve → Mark paid → (reversible) Reopen as draft. One run per `YYYY-MM` period.
- **Faculty view** — "My payslips": period, amount, type, status.
- **Last-paid / pending tracking** — per faculty, computed from the latest PAID run plus unpaid periods/lectures since.

### 2.12 Staff — *not gated, OWNER/ADMIN only*
- **Faculty/Admin/Reception directory** — invite (name, email, phone, role; faculty additionally need salary type + amount), edit salary settings, activate/deactivate.
- Shows a degraded state if the Payroll module is off (salary figures hidden).

### 2.13 Dashboard & Ledger
- **Dashboard** — role-specific stat cards, quick actions (e.g. Owner: add student/log attendance/record fee/manage staff), setup checklist until onboarding is complete, biometric device count.
- **Ledger** — combined feed of fee payments (income), expenses, and paid payroll runs, with summary totals (income/expense/payroll/net) and CSV export. OWNER/ADMIN only.

---

## 3. Cross-Cutting Rules (apply to every module)

1. **Every tenant query is scoped by `instituteId`.** No exceptions except SuperAdmin platform routes.
2. **Money operations are transactional.** Fee payment + installment reconciliation, and payroll run creation, use `prisma.$transaction`.
3. **Controller/service split.** Business logic (ID generation, reconciliation, payroll math) lives in a `services/` layer; route handlers only validate input and shape responses.
4. **Module gateway before role checks.** If a module is off, the route 403s before RBAC is even evaluated.
5. **Dates are UTC-normalized** for `@db.Date` columns to avoid IST off-by-one errors; use shared `utcDate`/`utcEndOfDay` helpers for range queries.
6. **Passwords never stored in plaintext**; temp passwords force a change on next login.
7. **High-value mutations are audit-logged** (student created, enquiry converted, institute created, module toggled, biometric enabled/disabled, onboarding steps).

---

## 4. Phase-Wise Build Plan

Each phase is a self-contained, demoable slice. We do **not** start a phase until you say go.

### Phase 0 — Foundation
- Monorepo layout: `backend/` (Express + TS + Prisma 7), `frontend/` (Next.js App Router + TS + Tailwind).
- Prisma schema: `Institute`, `Module`, `InstituteModule`, `User`, enums (`Role`, `ModuleCode`).
- JWT auth (login, `/me`, change-password), password hashing.
- Middleware: `authenticate`, `requireRoles`, `requireInstitute`, `requireModule`, `requireSuperAdmin`.
- Base frontend shell: theme system (see `design.md`), app layout, login page, protected routing.
- Seed script skeleton (module catalog + one SuperAdmin).

### Phase 1 — Platform + Onboarding
- Platform routes: institute CRUD, module toggle, stats, resend invite, SMTP config.
- Onboarding wizard (Profile → Modules → Academics → Team → optional Biometrics → Complete).
- Dashboard setup checklist.

### Phase 2 — Academics (Course module)
- Courses, Subjects, Batches — full CRUD + list views.
- Frontend pages with tabs (Courses/Subjects) and Batches table.

### Phase 3 — Admission module (Enquiry → Admission → Student)
- Enquiry pipeline (CRUD, status transitions).
- Admission funnel (admit directly / admit from enquiry).
- Student code generator service.
- Students directory + profile drawer + batch assignment/reassignment.

### Phase 4 — Attendance
- Lecture scheduling, roster, marking, daily summary.
- Student self-view.
- Biometric devices as a follow-up sub-phase once core marking is solid.

### Phase 5 — Fees
- Fee accounts, installment generation, payments, receipts, reconciliation.
- Student self-view ("My fees").

### Phase 6 — Staff + Payroll
- Staff directory/invite/salary settings.
- Payroll preview/run/approve/pay lifecycle, faculty payslip view, last-paid/pending logic.

### Phase 7 — Expenses + Ledger/Reporting
- Expense CRUD + categories.
- Combined Ledger view with CSV export.

### Phase 8 — Dashboard polish, Settings, Notifications
- Full role-specific dashboards and quick actions.
- Settings page (profile, modules, biometrics, security) tying earlier phases together.
- Notifications center plumbing (real events, not just UI shell).

### Phase 9 — Hardening
- Receipt/payslip PDF generation.
- Automated tests (backend integration, frontend).
- Security hardening: rate limiting, refresh tokens, session revocation, MFA.
- Expanded P&L reporting.

---

## 5. How We'll Work Phase-by-Phase

- You tell me which phase to start ("start phase 2").
- I scaffold backend (schema + migration + routes + services) and frontend (pages + components) for that phase only, wired end-to-end (no mock data).
- Each phase ends with a working, demoable slice before moving to the next.
