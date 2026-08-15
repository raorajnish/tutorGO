# Product Requirements Document (PRD): TutorGO — EdTech SaaS ERP

**Product Name:** TutorGO
**Target Audience:** Coaching centers, educational institutes, schools, and colleges.
**Core Objective:** Deliver a centralized, modular, and multi-tenant ERP platform that handles the full student lifecycle, finances, academics, and HR operations in fully isolated workspaces — with a pay-per-module SaaS model.

This document describes **what has been built** and the **rules that govern it**. It is the source of truth for the current implementation.

---

## 1. Executive Summary

TutorGO is a two-layer SaaS:

- **Platform layer (SuperAdmin):** global provisioning, institute management, module subscription control, platform-wide analytics.
- **Tenant layer (institutes):** each institute runs in a fully isolated data silo and gets an ERP covering **Enquiries → Admissions → Students → Academics (Courses/Batches/Lectures) → Attendance → Fees → Expenses → Payroll → Staff → Settings**.

Every role in the system sees only the modules it is allowed to see (via the sidebar) and only the actions it is allowed to perform (via API guards). A **module gateway** blocks any request to a module the institute has not subscribed to, independent of the user's role.

Demo accounts and seed data ship with the product so the entire flow can be exercised end-to-end (see §12).

---

## 2. Multi-Tenancy & Platform Architecture

### 2.1 Two strictly separated layers

- **Platform Layer (Global):** managed exclusively by the SuperAdmin (role `SUPERADMIN`, no `instituteId`). It provisions institutes, creates the first **Owner** user, manages the module catalog, toggles module subscriptions per institute, resets owner invitations, configures the global SMTP transport, and reads platform-wide stats. This layer is entirely unaware of students, batches, fees, etc.
- **Tenant Layer (Institute-Specific):** every operational record natively binds to an `instituteId`. Each institute is its own data silo; no cross-tenant reads are possible because every query filters by the authenticated tenant.

### 2.2 Data isolation

- Every tenant-scoped model (`Course`, `Batch`, `Student`, `Faculty`, `Lecture`, `Attendance`, `Enquiry`, `FeeAccount`, `FeeInstallment`, `FeePayment`, `Expense`, `PayrollRun`, `Device`, `FinanceEntry`, …) carries an `instituteId`.
- The `authenticate` middleware resolves the JWT to a user and populates `req.user` + `req.tenantId`. Route handlers **always** scope reads/writes by `instituteId` (see §10 rules).
- Cross-tenant referential checks are enforced manually: assigning a student to a batch, a lecture to a faculty member, or a fee account to a student first verifies the referenced record belongs to the same institute (returns 400 otherwise).

### 2.3 The Module Gateway

An **active subscription gate**. Every module-scoped API router mounts `requireModule(code)` which checks the `InstituteModule` join table (institute × module × `isActive`). If the institute lacks an active subscription for the requested module, the middleware returns `403 ModuleDisabled` — regardless of role. Modules (catalog codes):

| Code | Label | Routers that require it |
| --- | --- | --- |
| `ENQUIRY` | Enquiries | `/enquiries` |
| `ADMISSION` | Admissions | `/students` (POST, batch assign) |
| `ATTENDANCE` | Attendance | `/attendance/*`, plus the device scan endpoint |
| `FEES` | Fees | `/fees/*` |
| `PAYROLL` | Payroll | `/payroll/*` |
| `EXPENSE` | Expenses | `/expenses/*` |

Institutes subscribe/unsubscribe in the onboarding wizard (step 2), in **Settings → Modules**, and remotely by the SuperAdmin (Platform → Institutes → Manage modules). When a module is turned off, every route under it is immediately blocked.

### 2.4 Biometrics (owner opt-in)

Biometric attendance is **opt-in per institute** (`Institute.biometricEnabled`, default off). When off, the scan endpoint rejects all scans and devices cannot be provisioned. When on:

- Devices are provisioned with a `deviceKey` (`DEV-<10-hex>`).
- The **device scan endpoint** (`POST /attendance/scans`) is authenticated by `deviceKey` + `fingerprintId` only (no user token). It logs a `DeviceScanLog` (MATCHED / UNKNOWN_FINGERPRINT), and if the fingerprint maps to an active student who is currently inside a scheduled lecture window, it upserts `Attendance` as `PRESENT` with `method: BIOMETRIC`.
- Owners can always turn it back off (deactivates all devices).

---

## 3. Roles, Access, and the RBAC Matrix

### 3.1 Role definitions

| Role | Meaning | `instituteId` |
| --- | --- | --- |
| `SUPERADMIN` | Platform owner; global control only | null |
| `OWNER` | Institute owner; full control of its tenant | set |
| `ADMIN` | Institute administrator | set |
| `FACULTY` | Teaching staff; sees own schedule/payroll | set |
| `RECEPTION` | Front desk; admissions + fee collection | set |
| `STUDENT` | Enrolled student; sees own attendance/fees | set |

### 3.2 RBAC summary matrix

| Area | SuperAdmin | Owner | Admin | Faculty | Reception | Student |
| --- | --- | --- | --- | --- | --- | --- |
| Platform (institutes/modules) | **Full** | None | None | None | None | None |
| Settings / onboarding | None | **Full** | **Full** | None | None | None |
| Staff management + salaries | None | **Full** | **Full** | None | None | None |
| Enquiries pipeline | None | **Full** | **Full** | Edit† | **Full** | View only‡ |
| Admissions (admit students) | None | **Full** | **Full** | None | **Full** | None |
| Academics (courses/subjects/batches) | None | **Full** | **Full** | View | Manage* | None |
| Lecture scheduling | None | **Full** | **Full** | None | **Full** | None |
| Attendance marking | None | **Full** | **Full** | Mark own batch | **Full** | None |
| Attendance daily summary | None | **Full** | **Full** | View | **Full** | View own |
| Fees (accounts/payments) | None | **Full** | **Full** | None | Collect | View own |
| Expenses | None | **Full** | **Full** | None | None | None |
| Payroll (run/approve/pay) | None | **Full** | **Full** | View own payslips | None | None |
| Dashboard | Global | Full | Full | Full | Full | Own |

† The Enquiries UI gates on `role !== "student"`, so faculty/admins/reception/owners can all edit leads.
‡ Students can open the page but the create/edit/delete UI is hidden (read-only fallback; backend denies non-OWNER/ADMIN/RECEPTION).

*Reception can create/edit courses, subjects, and batches at the API level (`requireRoles("OWNER","ADMIN","RECEPTION")`).

### 3.3 Sidebar tab visibility (exact, from `frontend/src/lib/navigation.ts`)

The sidebar groups items into sections (**Admissions**, **Academics**, **Finance**, **Organization**, **Platform**); sections with zero allowed routes are dropped for that role.

| Role | Routes visible in the sidebar |
| --- | --- |
| **owner** | `/dashboard`, `/enquiries`, `/admissions`, `/students`, `/academics/courses`, `/academics/batches`, `/attendance/lectures`, `/attendance`, `/fees`, `/expenses`, `/payroll`, `/staff`, `/settings` |
| **admin** | (identical to owner — all 13 routes) |
| **faculty** | `/dashboard`, `/attendance/lectures`, `/attendance`, `/academics/batches`, `/payroll` |
| **reception** | `/dashboard`, `/enquiries`, `/admissions`, `/students`, `/fees` |
| **student** | `/dashboard`, `/attendance`, `/fees` |
| **superadmin** | `/dashboard`, `/platform`, `/platform/institutes`, `/platform/modules` |

**Effective rendered sections per role:**

- **owner / admin:** Dashboard · Admissions (Enquiries, Admissions, Students) · Academics (Courses, Batches, Lectures, Attendance) · Finance (Fees, Expenses, Payroll) · Organization (Staff, Settings)
- **faculty:** Dashboard · Academics (Batches, Lectures, Attendance) · Finance (Payroll)
- **reception:** Dashboard · Admissions (Enquiries, Admissions, Students) · Finance (Fees)
- **student:** Dashboard · Academics (Attendance) · Finance (Fees)
- **superadmin:** Dashboard · Platform (Overview, Institutes, Modules)

> Note: sidebar visibility and backend guards are two independent layers. A route hidden from the sidebar is still enforced at the API.

---

## 4. Module-by-Module Feature Breakdown

For each module: **what it shows on load** and **the actions available on it**, plus any role gating.

### 4.1 ⚙️ Platform (SuperAdmin only) — `/platform`, `/platform/institutes`, `/platform/modules`

**Overview (`/platform`)**
- Shows 6 stat cards: Institutes, Active institutes, Tenant users, Students, Available modules, Collected revenue (₹).
- Table **"Institutes"**: name + code · city, active module badges (or "None"), Students, Users, Plan, Status (Active/Inactive), Created.
- **Actions:** "New institute" (opens Create Institute modal), "Manage institutes" → `/platform/institutes`, Refresh.

**Institutes (`/platform/institutes`)**
- Stat cards: Total institutes, Active, Students (sum), Users (sum). Search box (name/code/city/email).
- Table **"All institutes"**: name + code · city + email, module badges, Students, Users, Status, Plan, Actions.
- **Actions:** "New institute" (Create Institute modal), Refresh, per-row ⋯: **View details** (drawer with profile, team list incl. "Temp" badges for `mustChangePassword`, active modules), **Manage modules** (checkbox toggles per module, persisted via toggle-module; "The gateway blocks everything unsubscribed."), **Resend invite** (resets the owner's temporary password and re-emails it).

**Modules (`/platform/modules`)**
- Stat cards: Available modules, Modules in use, Active subscriptions.
- Module cards: name, uppercase code, description, "{N} active" or "Unused" badge.
- Table **"Where modules are active"**: module → subscribed institutes. Read-only + Refresh.

**Create Institute modal (shared)** fields: Institute name (required), Institute code (required, uppercase, max 10), Owner name (required), Owner email (required), Phone, module checkboxes (Enquiries, Admissions, Attendance, Fees, Payroll, Expenses). On submit the backend creates the institute + `OWNER` user (temp password) + module subscriptions, and emails credentials (when SMTP configured; otherwise the temp password is returned inline for handover).

### 4.2 🔐 Auth & Onboarding

**Auth**
- `POST /auth/login` — email/password; rejects inactive users; records `lastLoginAt`; returns JWT + user + `mustChangePassword`.
- `GET /auth/me` — returns the user, institute profile (code/name/plan), student/faculty linkage, and the list of active module codes.
- `POST /auth/change-password` — requires current password; clears `mustChangePassword`.
- `POST /auth/forgot-password` — intentionally generic response to avoid user enumeration (reset email flow is a stub for production).

**Onboarding wizard (Owner/Admin only; 4 steps + optional biometrics)**
- **Step 1 — Profile:** institute name, email, phone, address, city. `PUT /onboarding/profile`.
- **Step 2 — Modules:** subscribe/unsubscribe module codes. `PUT /onboarding/modules`.
- **Step 3 — Academics:** create at least one course, one subject, and one batch in a single transaction. `POST /onboarding/academics`.
- **Step 4 — Team:** bulk-invite staff (1–50) with role Admin/Reception/Faculty; faculty require salary type + amount; each gets a temp password + invite email. `POST /onboarding/staff`.
- **Optional — Biometrics:** enable/disable + provision devices. `PUT /onboarding/biometric`.
- **Complete:** `POST /onboarding/complete` validates steps 1–3 are satisfied, then marks onboarding done.
- Progress is tracked via `Institute.onboardingStep` and surfaced on the Dashboard **Setup** card ("X of 4 steps done"). The step can never move backwards.

### 4.3 🏠 Dashboard — `/dashboard`

**What it shows (org users):** institute card (name, city · N modules active, code, Active/Suspended badge, Plan / Contact / Biometrics fields, active module badges); **Quick actions** card; **Setup** card (Complete/In progress, 4-step checklist); **Biometric devices** card (N devices linked / Not enabled).
**Superadmin:** a **Platform overview** card linking to `/platform`.

**Quick actions (role-based):**

| Role | Quick actions |
| --- | --- |
| owner | Add a student → `/admissions` · Log attendance → `/attendance/lectures` · Record a fee → `/fees` · Manage staff → `/staff` |
| admin | Add a student · Log attendance · Record a fee · Run payroll → `/payroll` |
| faculty | Log attendance · Attendance → `/attendance` · Batches → `/academics/batches` · My payslips → `/payroll` |
| reception | New enquiry → `/enquiries` · Admit a student → `/admissions` · Record a fee → `/fees` · Students → `/students` |
| student | My attendance → `/attendance` · My fees → `/fees` |

### 4.4 📨 Enquiries — `/enquiries` (OWNER/ADMIN/RECEPTION + faculty edit; module `ENQUIRY`)

**What it shows:** 4 stat cards (All enquiries, New, Contacted, Converted); **Leads** card with pipeline tabs **All / New / Contacted / Converted / Lost** (with counts); table columns: Student (name + phone), Course, Source (badge: Walk-in, Referral, Social media, Phone, Other), Status, Next follow-up, Logged by, actions.

**Actions:**
- **New enquiry** (modal): name, phone, course interested, source (select), next follow-up (date), notes.
- Search (name/phone/course).
- Per-row ⋯: **Edit details**, **Mark contacted** (only if not CONTACTED), **Convert to admission** (only if not CONVERTED — see Admissions), **Mark lost** (only if not LOST), **Delete** (with confirmation).
- Statuses: `NEW → CONTACTED → CONVERTED | LOST`. Converting writes an `ENQUIRY_CONVERTED` audit log.

### 4.5 🎓 Admissions — `/admissions` (OWNER/ADMIN/RECEPTION manage; module `ADMISSION`)

**What it shows:** 4 stat cards (New leads, Contacted, Converted, Students admitted); **Admission funnel** card with tabs **Pipeline** (leads not LOST/CONVERTED) and **Admitted** (active students). Pipeline table: Lead (name+phone), Course, Source, Stage, Follow-up, Admit button. Admitted table: Student (name + studentCode), Class, Batch badges, Admitted on.

**Actions:**
- **Admit directly** — opens the Add Student modal (create mode).
- Per-row **Admit** — pre-fills the modal from the enquiry; on submit marks the enquiry `CONVERTED` and creates the student.
- Add Student modal (create) fields: Full name (required), Email (optional — falls back to student code `@local.in`), Phone, Parent phone, Class/standard (required), DOB, Father's name, Mother's name, School, Admission date, Assign batch (optional), Fingerprint ID. On success shows student code, login email, and the temp password when email delivery is not configured; supports "Admit another".
- The same modal supports **edit** mode (email locked, no batch field).

**Student code generation (deterministic):** `{INSTITUTE_CODE}-{YY}-{CLASS_CODE}-{SEQ}` e.g. `SP20-26-10-0016`. The sequence is per institute + year + class code, starting at 0001 and derived from the lexicographically-last existing code.

### 4.6 👨‍🎓 Students — `/students` (OWNER/ADMIN/RECEPTION manage; module `ADMISSION` for create/assign)

**What it shows:** 4 stat cards (Active students, Total on file, Active batches, Fee book value = Σ finalFee); status filter (Active / Inactive / All); **Student directory** table: Student (name + code), Class, Batch badges, Phone, Status dot, actions.

**Actions:**
- **Add student** (create modal, as above).
- Search (name/code/class).
- Row click → profile **Drawer**: badges (Active/Inactive, class, optional "Fingerprint #N"); fields Email, Phone, Parent phone, Father, Mother, School, DOB, Admitted; **Batches** history (name, course, joined → left dates); **Fee account** (course fee / discount / final fee + installment list with due date, amount, status; fallback "No fee account yet"); **Recent attendance** (last 10: subject · batch, date, status).
- ⋯: **View profile**, **Edit details**, **Assign batch**.
- **Assign batch** modal: batch (select, required), joined on (date). Assignment closes any open `StudentBatch` (`leftAt = joinedAt`) and opens a new one — migrations keep history.

### 4.7 📚 Academics — Courses / Subjects / Batches

**Courses & Subjects (`/academics/courses`, manage: OWNER/ADMIN/RECEPTION)**
- Tabs **Courses / Subjects** (with counts). Courses table: name + description, Duration ("N months" badge), Batches (count). Subjects table: name, Code badge.
- **Actions:** New course / New subject (dynamic header button), search, ⋯ **Edit**. Course fields: name, duration (1–60 months), description. Subject fields: name, code (uppercase, ≤10 chars).

**Batches (`/academics/batches`, manage: OWNER/ADMIN/RECEPTION)**
- Stat cards: Total batches, Active students (sum enrolled), Lectures logged.
- Table **"All batches"**: name, Course badge, Start, End ("Ongoing" when no end date), Students (count of active enrolments), Lectures (count), actions.
- **Actions:** New batch (requires at least one course), search, ⋯ **Edit**. Fields: name, course (select), start date, end date (optional). Batches are created within the institute and always validated against the tenant's course set.

### 4.8 🎥 Attendance — Lectures, Marking, Daily Summary, Devices

**Lectures (`/attendance/lectures`, schedule: OWNER/ADMIN/RECEPTION; mark: staff + faculty)**
- Stat cards: Lectures listed, Records marked, Today. Filters: Batch select, Subject select, Date input.
- Table **"Lecture schedule"**: Date (weekday/day + start–end time), Batch (name + course), Subject badge, Faculty, Marked (count), **Mark** button.
- **Actions:** **Schedule lecture** modal (batch, subject, faculty — required; a FACULTY caller who omits faculty auto-resolves to their own faculty record; date; start/end time in `HH:MM`); filters; per-row **Mark**.
- **Mark attendance** modal: header "{N} student(s) · tap a row to cycle status", **All present** shortcut, per-student status select (**Present / Absent / Leave / Holiday**), **Save attendance**. Saves in one transaction using upsert on `(lectureId, studentId)`, method `MANUAL`.

**Attendance (`/attendance`)**
- **Staff view** (OWNER/ADMIN/RECEPTION/FACULTY): **Daily summary** table for a chosen date (max today): Time, Batch, Subject, Faculty, Expected, Present, Absent, Marked. Computed from `Lecture` rows: expected = active students in the batch; absent = expected − present; marked = attendance rows written.
- **Student view:** "My attendance" — stat cards (Lectures tracked, Present, Attendance rate %) + Recent lectures table (Date, Subject, Batch, Status).
- **Biometric devices card (staff):** N devices linked; table Device (name + deviceKey), Type, Scans, Status (Active/Disabled), Last seen. Actions: **Provision device** (only when biometrics enabled; modal: name, type), **Enable/Disable**, **Remove** (deletes key permanently, with confirmation).

### 4.9 💰 Fees — `/fees` (OWNER/ADMIN/RECEPTION manage; students see their own; module `FEES`)

**Staff view:** 4 stat cards (Total collected, Outstanding, Fee accounts, Overdue installments); **Fee accounts** table (Student name + code · class, Final fee, Paid, Balance — red when >0); **Recent payments** table (Receipt, Student, Date, Mode, Amount).

**Student view:** "My fees" — stat cards (Total fee, Paid, Balance); **Installment plan** table (#N, Due date, Amount, Status); **Payments** table (Receipt, Date, Mode, Amount).

**Actions (staff):**
- **Create fee account** modal: student (select — only those without an account), course fee (₹, required), discount (₹), installments (1–12, required), first due date. Creates the account (`finalFee = courseFee − discount`) and splits `finalFee` into N installments with monthly-spaced due dates (last installment absorbs rounding).
- **Record payment** modal: amount (₹, required, must be > 0), mode (**UPI / CASH / CARD / BANK_TRANSFER / CHEQUE**), payment date, "Apply to installment" (optional select — otherwise the earliest open installment is auto-used). On success returns a **receipt number** (`RCT-YYMM-SEQ`, per institute).
- **Auto-reconciliation:** after any payment, the affected installment(s) are recomputed from summed payments → status flips to `PAID` only when fully covered, `PARTIAL` when partially covered, `OVERDUE` when past due with no payment.
- Drawer per account: course fee/discount/final fee summary + installments with nested payments (receiptNo · mode · date · amount).
- `PATCH /fees/installments/:id` allows a manual status override (e.g. waive → `PAID`).
- `GET /fees/receipts/:receiptNo` fetches a single printable receipt.

### 4.10 🧾 Expenses — `/expenses` (OWNER/ADMIN only; module `EXPENSE`)

**What it shows:** 4 stat cards (Total expenses, Entries, Top category — client-computed, Average entry); filters From date, To date, Category select; **Ledger** table: Expense (title + notes), Category badge, Date, Amount.

**Actions:**
- **Record expense** modal: title (required), category (select, required), amount (₹, required, positive), date, notes.
- **Manage categories** modal: existing category badges + "Add category" (name; optional `isIncome` flag).
- Filters + search.
- ⋯: **Edit expense**, **Delete expense** (confirmation; also removes the mirrored `FinanceEntry`).
- Every expense also creates a `FinanceEntry` (entryType `EXPENSE`) referencing the category, for future ledger/reporting.

### 4.11 🪙 Payroll — `/payroll` (OWNER/ADMIN manage; faculty see own payslips; module `PAYROLL`)

**Staff view:** 4 stat cards (Total paid out, Active runs, Approved, Drafts); tabs **Runs / Faculty**. Runs table: Period, Total, Payees, Generated, Status, actions. Faculty tab: cards with name, email, Active/Inactive badge, "₹X / month" or "₹X / lecture", Joined date.

**Faculty view ("My payslips"):** table Period, Amount, Type, Status. (Backed by `GET /payroll/my-payslips`, which is registered before the staff guard on the router.)

**Actions (staff):**
- **Run payroll** modal: period (`YYYY-MM`), From date, To date → **Preview** (dry-run, nothing saved) shows each faculty line ("Fixed salary" or "{N} lectures × ₹rate") + total → **Create draft run**.
- Per-run ⋯ / drawer: **View run**, **Approve run** (DRAFT → APPROVED), **Mark paid** (APPROVED → PAID, sets `paidAt`), **Reopen as draft** (reversible for any non-DRAFT), **Delete run** (DRAFT only, confirmation).
- A second run for the same period is rejected (409) — one payroll run per `YYYY-MM`.

### 4.12 👥 Staff — `/staff` (OWNER/ADMIN only)

**What it shows:** 4 stat cards (Faculty, Active, Fixed salary, Per lecture); **Faculty** table: name + email, Phone, Salary type badge (Fixed/Per lecture), Amount ("₹X /lecture" suffix for PER_LECTURE), Joined, Status dot, actions. If the Payroll module is off, shows a warning ("The Payroll module is off, so salary details can't be shown.") and an empty table.

**Actions:**
- **Invite staff** modal: full name (required), email (required), phone, role (**Faculty / Admin / Reception**); if Faculty: salary type (**Fixed per month / Per lecture**) + salary amount (required). Creates the user (temp password, `mustChangePassword: true`), creates a `Faculty` profile when the role is faculty, sends the invite email (or returns the temp password inline), and logs a `messageLog`.
- Search.
- ⋯ per faculty: **Edit salary** (salary type, amount, status Active/Inactive; shows "Pay is computed as lectures taken in the period × ₹amount" for per-lecture), **Deactivate / Activate**.
- Salary settings are persisted via `PATCH /payroll/faculty/:id` (`salaryType`, `salaryAmount`, `isActive`).

### 4.13 ⚙️ Settings — `/settings` (OWNER/ADMIN manage)

**What it shows:** 4 cards:
- **Institute profile**: code · plan · biometrics badge; fields Institute name (required), City, Email (required), Phone (required), Address. **Save profile** → `PATCH /org`.
- **Modules**: toggle tiles for Enquiries, Admissions, Attendance, Fees, Payroll, Expenses (icon + On/Off badge) → `PUT /onboarding/modules`. Disabled for non-managers.
- **Biometric attendance**: status text + **Enable/Disable biometrics** toggle (persisted via `PUT /onboarding/biometric`); **Manage devices** link → `/attendance`.
- **Security**: **Change password** → `/change-password`.

---

## 5. Business-Logic Deep Dive

### 5.1 Payroll engine (`services/payroll.ts`)

Inputs: institute, period (`YYYY-MM`), date range (`fromDate`–`toDate`, inclusive, timezone-safe). For every faculty member in the institute:

- `salaryType = FIXED` → amount = `salaryAmount` (lecture count ignored).
- `salaryType = PER_LECTURE` → amount = **validated lectures taken in the period** × `salaryAmount`. The "validated" count comes from `Lecture` rows (the auditable records faculty log), grouped by `facultyId` within the date range.
- Deactivated faculty are excluded (`isActive` filter), so deactivating a lecturer removes them from future runs.

`runPayroll` computes the same preview, rejects a duplicate period, and snapshots the items into `PayrollRun` (status `DRAFT`) + `PayrollItem` rows. Lifecycle: `DRAFT → APPROVED → PAID`, reversible (`PAID → DRAFT` via reopen). Only DRAFT runs can be deleted.

### 5.2 Fee reconciliation (`services/fee.ts`)

- `getOrCreateFeeAccount` computes `finalFee = courseFee − discount` (idempotent per student).
- `createInstallments` splits `finalFee` into N installments (monthly gap), last installment absorbs rounding.
- `recordPayment` runs in a **single transaction**: creates the `FeePayment` with an auto-generated receipt no, then reconciles. Reconciliation targets either the explicitly-selected installment or all open (`PENDING/PARTIAL/OVERDUE`) installments oldest-first, recomputing each status from the sum of its payments. Payment record creation + status flip either both succeed or both roll back.

### 5.3 Timezone / date handling (`lib/dates.ts`)

`@db.Date` columns store UTC midnight. IST (UTC+5:30) midnight falls on the *previous* UTC day, so naive matching caused off-by-one bugs (e.g. a lecture on 2026-08-05 IST was matched for 2026-08-06 queries). All date-range matching now uses:

- `utcDate(yyyy-mm-dd)` → the UTC midnight of that date for `gte` comparisons.
- `utcEndOfDay(yyyy-mm-dd)` → the last instant of that date for `lte` comparisons.

Applied to: attendance create/list/daily, payroll `fromDate`/`toDate`, and expenses `from`/`to`. Expense filtering merges `gte` and `lte` into a single `expenseDate` object so both bounds apply together.

### 5.4 Identifiers

- **Student code:** `{CODE}-{YY}-{CLASS}-{SEQ:4}` (e.g. `TGO-26-11-0001`); sequence is per institute + year + class.
- **Receipt number:** `RCT-{YYMM}-{SEQ:4}` per institute.
- **Device key:** `DEV-{10 uppercase hex}`.
- **Fallback emails:** students without an email get `{studentcode}@local.in`; staff must provide a real email.

### 5.5 Security & audit

- Passwords hashed (argon2/bcrypt-style) via `lib/password.ts`; temporary passwords are generated and forced to change on first login (`mustChangePassword`).
- JWT via `lib/jwt.ts`; `authenticate` verifies and loads the user (rejecting inactive accounts).
- `auditLog` records high-value events: `STUDENT_CREATED`, `ENQUIRY_CONVERTED`, `INSTITUTE_CREATED`, `MODULE_TOGGLED`, `EMAIL_CONFIG_UPDATED`, `ONBOARDING_*`, `BIOMETRIC_ENABLED/DISABLED`.
- `messageLog` records all outbound invitation emails.
- SMTP config is global (SuperAdmin) and cached; when not configured, temp passwords are returned inline for dev handover (never when email is delivered).

---

## 6. API Surface Summary (routers under `/api`)

| Router | Middleware chain | Endpoints |
| --- | --- | --- |
| `/health` | public | health check |
| `/auth` | public + `authenticate` | `POST /login`, `GET /me`, `POST /change-password`, `POST /forgot-password` |
| `/platform` | `authenticate`, `requireSuperAdmin` | `GET /stats`, `GET /modules`, `GET /institutes`, `GET /institutes/:id`, `POST /institutes`, `PATCH /institutes/:id`, `POST /institutes/:id/toggle-module`, `POST /institutes/:id/resend-invite`, `GET/PUT /email-config` |
| `/org` | `authenticate`, `requireInstitute` | `GET /`, `PATCH /` (OWNER/ADMIN), `GET /modules` (OWNER/ADMIN) |
| `/onboarding` | `authenticate`, `requireInstitute`, OWNER/ADMIN | `GET /`, `PUT /profile`, `PUT /modules`, `POST /academics`, `POST /staff`, `PUT /biometric`, `POST /complete` |
| `/academics` | `authenticate`, `requireInstitute` | courses/subjects/batches: `GET /` all roles-in-tenant; `POST`/`PATCH` require OWNER/ADMIN/RECEPTION |
| `/students` | `authenticate`, `requireInstitute` | `GET /`, `GET /:id`; `POST /` (OWNER/ADMIN/RECEPTION + `ADMISSION` module); `PATCH /:id` (OWNER/ADMIN); `POST /:id/batches` (OWNER/ADMIN/RECEPTION + `ADMISSION`) |
| `/enquiries` | `authenticate`, `requireInstitute`, `ENQUIRY` module, OWNER/ADMIN/RECEPTION | `GET /`, `POST /`, `PATCH /:id`, `PATCH /:id/status`, `DELETE /:id` |
| `/fees` | `authenticate`, `requireInstitute`, `FEES` module, OWNER/ADMIN/RECEPTION | `GET /accounts`, `POST /accounts`, `GET /students/:id`, `POST /payments`, `GET /payments`, `GET /receipts/:receiptNo`, `PATCH /installments/:id` |
| `/attendance` | `POST /scans` (deviceKey auth, device-specific); others: `authenticate`, `requireInstitute`, `ATTENDANCE` module, staff+faulty roles as noted | `GET /lectures`, `POST /lectures` (staff), `GET /lectures/:id/roster`, `POST /lectures/:id/mark`, `GET /daily`, `GET/POST /devices`, `PATCH/DELETE /devices/:id` |
| `/payroll` | `GET /my-payslips` (FACULTY, before staff guard); others: `authenticate`, `requireInstitute`, `PAYROLL` module, OWNER/ADMIN | `GET /faculty`, `PATCH /faculty/:id`, `POST /preview`, `POST /runs`, `GET /runs`, `GET /runs/:id`, `PATCH /runs/:id`, `DELETE /runs/:id` |
| `/expenses` | `authenticate`, `requireInstitute`, `EXPENSE` module, OWNER/ADMIN | `GET /`, `POST /`, `GET /categories`, `POST /categories`, `PATCH /:id`, `DELETE /:id` |

---

## 7. Data Model (Prisma) — Key Models & Enums

- **Roles:** `SUPERADMIN, OWNER, ADMIN, FACULTY, RECEPTION, STUDENT`
- **Modules:** `ENQUIRY, ADMISSION, ATTENDANCE, FEES, PAYROLL, EXPENSE`
- **SalaryType:** `FIXED, PER_LECTURE` · **PaymentMode:** `UPI, CASH, CARD, BANK_TRANSFER, CHEQUE` · **InstallmentStatus:** `PENDING, PARTIAL, PAID, OVERDUE`
- **AttendanceStatus:** `PRESENT, ABSENT, LEAVE, HOLIDAY` · **AttendanceMethod:** `MANUAL, BIOMETRIC`
- **EnquiryStatus:** `NEW, CONTACTED, CONVERTED, LOST` · **EnquirySource:** `WALK_IN, REFERRAL, SOCIAL, PHONE, OTHER`
- **PayrollRunStatus:** `DRAFT, APPROVED, PAID`

Models (all tenant-scoped carry `instituteId`): `Institute`, `Module`, `InstituteModule` (join + `isActive`), `EmailConfig` (global), `User`, `Course`, `Subject`, `Batch`, `StudentBatch` (join with `joinedAt`/`leftAt`), `Student`, `Faculty`, `Device`, `DeviceScanLog`, `Lecture`, `Attendance`, `Enquiry`, `FeeAccount`, `FeeInstallment`, `FeePayment`, `Expense`, `FinanceCategory`, `FinanceEntry`, `PayrollRun`, `PayrollItem`, `MessageTemplate`, `MessageLog`, `AuditLog`.

---

## 8. Design Decisions & Conventions

1. **Multi-tenant by column, not by schema:** every table carries `instituteId`; isolation is enforced in application code + per-request tenant scoping.
2. **Module gateway over feature flags:** subscriptions gate whole routers; toggling a module off instantly blocks its API.
3. **RBAC in two places:** sidebar visibility (`navigation.ts`) for UX and middleware guards (`requireRoles`) for enforcement. Owner and admin share identical route sets; finer action-level gates (e.g. expenses restricted to owner/admin) are applied per endpoint.
4. **Controller–service decoupling:** payroll, fee reconciliation, onboarding status, student code/receipt generation, and mail delivery live in `services/`; route handlers only validate + shape responses.
5. **Idempotency & uniqueness:** one fee account per student; one payroll run per period; student codes and receipt numbers are deterministic and collision-free; module toggles use `upsert`.
6. **Finance always transactional:** payment + installment reconciliation in a single `$transaction`.
7. **Timezone-safe dates:** UTC-midnight storage with `utcDate`/`utcEndOfDay` range helpers (see §5.3).
8. **Audit & message logs:** high-value mutations are recorded for traceability; all invitations are logged.
9. **Dev-first email:** SMTP optional; temp passwords fall back to inline display so the product is fully usable without mail configuration.
10. **Biometrics is opt-in and reversible:** never blocks onboarding; disabling deactivates all devices and the scan endpoint.
11. **Deterministic seed + demo data** (see §12) enables one-command E2E walkthroughs and API tests.

---

## 9. Crucial Backend Rules (Implementation Guide)

1. **The Multi-Tenant Guardrail:** with the sole exception of the SuperAdmin, every ORM query/update/delete MUST filter by `instituteId`. Cross-tenant leakage is the highest-severity risk. Reference lookups (batch→course, lecture→faculty, payment→student) must verify the referenced record belongs to the same tenant (400 otherwise).
2. **Transactions for finance:** all fee payments and payroll runs must use `prisma.$transaction` so record creation + status mutation commit or fail together.
3. **Controller–Service Decoupling:** business logic (payroll computation, fee reconciliation, module checks, ID sequences) lives in `services/`; HTTP controllers stay focused on validation and response shaping.
4. **Module gateway is non-optional:** any route serving module content must be behind `requireModule(code)`; a disabled module returns `403` before role checks matter.
5. **Dates:** never compare `@db.Date` columns with naive day boundaries; use `utcDate`/`utcEndOfDay` for range filters.
6. **Money:** amounts are validated positive where required, and computed totals rounded to 2 decimals (the last installment absorbs rounding).
7. **Passwords:** never stored in plain text; temporary passwords force a change on first login.

---

## 10. What's Out of Scope / Future Work

- Real email delivery for student/parent communication (SMTP wiring exists; templates stubbed).
- Leave management for staff; attendance leave/absence request workflow for students.
- Receipt PDF generation (receipt endpoint returns structured JSON today).
- Expanded ledger/reporting across `FinanceEntry` (expenses + fees + payroll P&L views).
- Notifications center (UI shell exists in the header; plumbing to real events is future work).
- Production security hardening (rate limiting, refresh tokens, per-device session revocation, multi-factor auth).

---

## 11. Repo Layout

```
TutorGO/
├─ backend/            Express + Prisma + PostgreSQL (or dev DB), port 4000
│  ├─ src/routes/      HTTP routers (auth, platform, org, onboarding, academics,
│  │                   students, enquiries, fees, attendance, payroll, expenses)
│  ├─ src/services/    payroll, fee, onboarding, studentCode, mailer
│  ├─ src/middleware/  auth (authenticate/requireRoles/requireInstitute/
│  │                   requireModule/requireSuperAdmin), validate
│  ├─ src/lib/         prisma, jwt, password, http (ApiError), dates, modules
│  └─ prisma/          schema.prisma, seed.ts
├─ frontend/           Next.js App Router, port 3000
│  ├─ src/app/         pages for every route in §3.3 (+ platform pages)
│  ├─ src/components/  app-shell, sidebar, header, modals, data-table, drawers
│  └─ src/lib/         navigation.ts (role→routes), api client, types
└─ prd.md              this document
```

---

## 12. Demo Environment & Seed Data

- **Seed:** `npx prisma db seed` always creates the module catalog + superadmin. With `TUTORGO_SEED=demo` it additionally creates the `TGO` institute ("TutorGO Demo Academy", GROWTH plan), all six modules active, an owner/faculty/reception/staff user, a course ("NEET Foundation"), three subjects (Physics/Chemistry/Biology), one batch ("NEET 2027 Batch A"), Prof. Sharma (FIXED ₹45,000), and three students with fee accounts (₹110,000 final fee, 4 installments).
- **Demo accounts:**

| Email | Role | Password |
| --- | --- | --- |
| `admin@tutorgovers.com` | SUPERADMIN | `SuperAdmin@2026` |
| `owner@tutorgovers.com` | OWNER | `Demo@1234` |
| `faculty@tutorgovers.com` | FACULTY (Prof. Sharma) | `Demo@1234` |
| `reception@tutorgovers.com` | RECEPTION | `Demo@1234` |
| `TGO-26-11-0001@local.in` | STUDENT (Aarav Patel) | `Demo@1234` |

- **Suggested walkthrough:** SuperAdmin creates an institute and toggles modules → Owner completes onboarding (profile → modules → academics → team) → Reception logs enquiries and converts one to admission → Admin admits the student, opens a fee account, and collects a payment → Faculty schedules a lecture and marks attendance → Owner previews + runs payroll → Student logs in to view own attendance and fee plan.
