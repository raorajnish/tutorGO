# TutorGO — Progress Tracker

> Living document. Update this file as work is completed or planned. Source of truth for feature scope: [`prd.md`](./prd.md). Tech/system docs: [`technicalarchitecture.txt`](./technicalarchitecture.txt), [`design.md`](./design.md).
>
> **Last updated:** 2026-08-06

---

## 1. Project Overview

TutorGO is a multi-tenant EdTech SaaS ERP for coaching institutes / schools / colleges.

- **Platform layer (SuperAdmin):** provisions institutes, manages module subscriptions, global SMTP, platform stats.
- **Tenant layer (OWNER/ADMIN/FACULTY/RECEPTION/STUDENT):** fully isolated workspaces per institute, covering Enquiries → Admissions → Students → Academics (Courses/Batches/Lectures) → Attendance → Fees → Expenses → Payroll → Staff → Settings.
- **Data isolation:** every tenant row carries `instituteId`; all queries are scoped by the authenticated tenant.
- **Module gateway:** unsubscribed modules return `403 MODULE_DISABLED` regardless of role.

### Stack

| Layer | Tech |
| --- | --- |
| Frontend | Next.js 16.3 (App Router), React 19, Tailwind CSS v4, TypeScript — port **3000** |
| Backend | Node.js, Express 5, TypeScript (ESM), zod 4 — port **4000**, all routes under `/api` |
| Database | PostgreSQL 18, Prisma 7 (driver adapter, ESM client) — `tutorgodb` on `127.0.0.1:5432` |
| Auth | JWT + bcryptjs, role-based access + forced password change |

### Credentials

| Role | Email | Password |
| --- | --- | --- |
| SuperAdmin | `admin@tutorgovers.com` | `SuperAdmin@2026` |
| Owner | `owner@tutorgovers.com` | `Demo@1234` |
| Faculty (Prof. Sharma, FIXED ₹45,000) | `faculty@tutorgovers.com` | `Demo@1234` |
| Faculty (Dr. Mehta, PER_LECTURE ₹800) | `mehta@tutorgovers.com` | temp from invite (console) |
| Reception | `reception@tutorgovers.com` | `Demo@1234` |
| Students (3) | `TGO-*-*-000*@local.in` | `Demo@1234` |

---

## 2. What Has Been Done ✅

### 2.1 Platform & Onboarding (SuperAdmin layer)

- [x] SuperAdmin provisioning of institutes (name, code, owner email, module selection) with invite email + temporary password.
- [x] Module catalog + per-institute subscription toggle (`Platform → Institutes → Manage modules`), also from onboarding wizard and `Settings → Modules`.
- [x] Global SMTP email config (`GET/PUT /email-config`, cached; console fallback when not configured).
- [x] Platform stats + resend-owner-invite.
- [x] Full onboarding wizard API: Profile → Modules → Academics → Team (invite Admin/Reception/Faculty, faculty require salary type+amount) → optional Biometric → Complete.

### 2.2 Core ERP Modules (tenant layer)

- [x] **Auth** — login, `/auth/me`, change-password (forced for temp passwords), forgot-password stub.
- [x] **Academics** — courses, subjects, batches (CRUD, owner/admin/reception).
- [x] **Students** — registration with deterministic student codes (`TGO-YY-CLASS-SEQ`), batch assignment, deactivation.
- [x] **Enquiries** — pipeline (new → contacted → converted → lost), sources.
- [x] **Admissions** — admit students from enquiries, batch assignment.
- [x] **Fees** — fee accounts (`finalFee = courseFee − discount`, one per student), installments (splits fee, monthly gap, last absorbs rounding), payments with auto receipt numbers (`RCT-YYMM-SEQ`), single-transaction reconciliation, manual installment status override (`PENDING/PARTIAL/PAID/OVERDUE`).
- [x] **Attendance** — lectures (scheduled, per-faculty auditable), roster, bulk marking (`PRESENT/ABSENT/LEAVE/HOLIDAY`, manual/biometric), daily summary, optional biometric devices + `POST /attendance/scans` (deviceKey auth).
- [x] **Expenses** — expense CRUD, finance categories, dual-write to `FinanceEntry` ledger.
- [x] **Payroll** — salary settings per faculty (`FIXED` / `PER_LECTURE`), run lifecycle **Draft → Approve → Paid** (`paidAt` stamped), per-period uniqueness, faculty view own payslips, delete only drafts.
- [x] **Staff** — staff management + salary settings (`/payroll/faculty/:id`).
- [x] **Settings** — institute profile, module toggles.

### 2.3 Frontend (fully API-wired — no mock data)

- [x] Landing page, auth screens (login w/ demo quick-fill, register, forgot password), app shell + dark/light theme system.
- [x] All 22 app pages call the real API (`apiFetch`); role-based sidebar from `frontend/src/lib/navigation.ts`.

### 2.4 Dashboard & Analytics

- [x] Dashboard with stat cards + role-specific quick actions:
  - owner: Dashboard, View ledger
  - admin: Run payroll, View ledger
  - others: module-scoped shortcuts.
- [x] Analytics derive from real data (fees paid/outstanding, expenses, payroll, attendance, students).

### 2.5 Ledger (NEW — Financials for the CA)

- [x] `GET /ledger?from&to&type` (OWNER/ADMIN) — pulls fee payments (income), expenses, and **PAID payroll runs** into one feed with a summary (`totalIncome / totalExpense / totalPayroll / net / count`).
- [x] Ledger page (`/ledger`) — stat cards (income/expenses/payroll/net), from/to/type filters, DataTable, **CSV export** with header + totals + net.
- [x] `/ledger` added to owner/admin navigation + Finance section.

### 2.6 Recent Session Work (2026-08-06)

- [x] **Fee payments now auto-reconcile** — `recordPayment()` in `backend/src/services/fee.ts` auto-attaches an installment-less payment to the earliest open installment, so `totalPaid` / `balance` and the ledger stay consistent.
- [x] **Installment status editing** — owner/admin can set each installment `PENDING/PARTIAL/PAID/OVERDUE` from the fees account drawer (dashboard stats refresh after).
- [x] **Payroll: last-paid + pending per faculty** — new `getFacultyPayrollStatus()` in `backend/src/services/payroll.ts`:
  - `lastPaidPeriod` / `lastPaidAt` from the latest PAID run.
  - **FIXED** → pending = unpaid calendar months × salary.
  - **PER_LECTURE** → pending = lectures taken **after** the last paid period × rate.
- [x] `GET /payroll/faculty` now returns `id`, `lastPaidPeriod`, `lastPaidAt`, `pendingLectures`, `pendingAmount`.
- [x] Payroll UI: faculty cards show **"Last paid {period}"** + a **pending badge** (`₹ · N lectures pending`) or **"Up to date"**; runs table has a **"Paid on"** column; "Mark paid" flow clarified.
- [x] Bug fix — React "unique key" warning on PayrollPage (payload was missing `id`; verified with a jsdom repro).
- [x] Bug fix — orphaned fee payment (installment not attached) removed from demo data; payments re-recorded cleanly through the fixed API.

### 2.7 Verification / Quality Gates

- [x] `npm run typecheck` (backend) — clean.
- [x] `npm run lint` + `npm run build` (frontend) — clean.
- [x] Backend integration tests (`npm test`) — green.
- [x] Live E2E verified against running servers:
  - `POST /fees/payments` (₹27,500 UPI, no installment) → receipt `RCT-2608-0001`, auto-PAID inst#1 → `totalPaid=27500`, `balance=82500`.
  - July 2026 payroll run (Dr. Mehta ₹800) → created → approved → **paid**; pending Aug lecture ₹800 now surfaces.
  - `GET /ledger` → `income=27500, expense=0, payroll=800, net=26700`.

---

## 3. Current Demo Data State

| Area | State |
| --- | --- |
| Fee accounts | Aarav (₹110,000, 4×₹27,500), Ananya, Rohan — all ₹110,000/4 installments. |
| Payments | 1 payment: Aarav ₹27,500 UPI → `RCT-2608-0001` (inst#1 PAID). inst#2/3/4 PENDING. |
| Payroll runs | 1 run: **2026-07 — PAID** (Dr. Mehta, 1 lecture, ₹800, `paidAt` 2026-08-05). |
| Faculty | Prof. Sharma FIXED ₹45,000 (no payout yet); Dr. Mehta PER_LECTURE ₹800 (last paid 2026-07, **₹800 pending** for 1 lecture on 2026-08-03). |
| Lectures | Biology — Prof. Sharma (2026-08-05) + Dr. Mehta (2026-07-20, 2026-08-03). |
| Expenses | E2E test expenses deleted. |
| Ledger | income 27500 / expense 0 / payroll 800 / net 26700. |

---

## 4. Pending / To Be Implemented ⬜

> Extracted from `prd.md §10 (Future Work)`, `README.md §7 (Not started)`, and gaps found while building. Ordered roughly by business value.
>
> **Phase 2 priority (owner-selected, 2026-08-06):** Receipt PDF generation · Fix stale docs (README/PRD) · Payroll per-faculty payouts · Expanded P&L reporting · Notifications center. Everything else below is Phase 3+.

### 4.1 Fees / Finance
- [ ] **Receipt PDF generation** — receipts are JSON only today; export printable PDF (HTML→PDF) for student/parent + CA.
- [ ] **Fee overpayment spillover** — if a payment exceeds the selected/oldest installment, optionally apply the surplus to the next open installment instead of stopping at one.
- [ ] **Student self-service receipts** — students can view/download their own payment history & receipts.
- [ ] **Payroll export to ledger detail** — currently the ledger shows payroll as one line per paid run; consider per-payee lines for the CA export.

### 4.2 Payroll / HR
- [ ] **Per-faculty payouts** — today a whole run flips to PAID; consider marking individual payees paid/part-paid so a run can be paid out in parts.
- [ ] **Payslip PDF** + printable payslip view (period, breakdown, net).
- [ ] **Leave management for staff** — leave/absence request workflow for faculty.
- [ ] **Auto-schedule payroll** — remember last paid period and pre-fill the next run's dates.

### 4.3 Attendance
- [ ] **Student leave/absence request workflow** (parent-notified absence).
- [ ] **Attendance report exports** (per student/batch monthly CSV/PDF).

### 4.4 Communications & Notifications
- [ ] **Notifications center plumbing** — UI shell exists in the header; wire real events (fee due, payment received, attendance marked, payroll run status).
- [ ] **Student/parent email + SMS templates** — SMTP wiring exists; templates stubbed.

### 4.5 Platform / Security / Hardening
- [ ] **Forgot-password reset token + email flow** (currently a stub that always succeeds).
- [ ] **Platform institute deletion cascade** (safe teardown of a tenant).
- [ ] **Production security hardening** — rate limiting, refresh tokens, per-device session revocation, multi-factor auth, audit of failed logins.

### 4.6 Reporting / Dashboards
- [ ] **Expanded ledger & P&L reporting** across `FinanceEntry` (monthly P&L view, category breakdowns, chart export).
- [ ] **Per-module dashboards** — more charts (revenue trend, attendance %, enquiry conversion funnel, top batches).
- [ ] **Export center** — consistent CSV/PDF exports across fees, expenses, attendance, payroll (ledger already has CSV).

### 4.7 Testing & Quality
- [ ] **Frontend tests** (no JS test setup yet; backend uses `node:test` + supertest).
- [ ] **Expand backend test coverage** for fees reconciliation, ledger, and payroll last-paid/pending logic.

### 4.8 Documentation / Housekeeping
- [ ] **README `§7` is stale** — it still says the frontend runs on mock data (it is now fully API-wired); `§6` API table and `prd.md §3.3` sidebar table are missing `/ledger`.
- [ ] Add a demo faculty seed for **PER_LECTURE** so `TUTORGO_SEED=demo` matches the current manual demo state (Dr. Mehta was created live, not via seed).

---

## 5. Known Bugs / Caveats (open)

| # | Area | Description | Priority |
| --- | --- | --- | --- |
| 1 | Fees | Overpayment does not spill to the next installment (surplus stays on one installment). | Medium |
| 2 | Payroll | Deleting a payment/paid run does not roll back fees or ledger entries — data is append-only by design today; verify expectations. | Low |
| 3 | Demo | `Dr. Mehta` + July run + extra lectures were created live (not via seed) — a fresh `TUTORGO_SEED=demo` reseed will not reproduce them. | Low |

---

## 6. How to Run & Verify

```powershell
# Backend (port 4000)
cd backend; npm install; npx prisma migrate deploy; npx prisma db seed; npm run dev

# Frontend (port 3000)
cd frontend; npm install; npm run dev
```

Quick smoke checks (backend typecheck, tests, frontend lint/build):

```powershell
cd backend;  npm run typecheck; npm test
cd frontend; npm run lint;      npm run build
```

Playbook: log in as `owner@tutorgovers.com` → check **Finance → Ledger** (stat cards + CSV export), **Finance → Payroll** (faculty cards show last-paid + pending, runs table shows "Paid on"), **Finance → Fees** (installment status dropdown).
