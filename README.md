# TutorGO

Multi-tenant management software for tuition institutes and coaching centres — enquiries through admissions, attendance, fees, payroll, expenses and tests, with a platform layer for provisioning and billing the institutes themselves.

- **Backend** — Express 5 + Prisma 7 on PostgreSQL, TypeScript, ESM
- **Frontend** — Next.js 15 (App Router) + React 19 + Tailwind 4
- **Node** — 20 or newer

---

## Quick start

```bash
# 1. Backend
cd backend
npm install
cp .env.example .env          # then edit — see "Environment" below
                              # at minimum: DATABASE_URL, JWT_SECRET, SUPERADMIN_*
npm run prisma:generate
npm run prisma:migrate
npm run db:seed               # creates the SUPERADMIN from your .env
npm run dev                   # http://127.0.0.1:4000

# 2. Frontend (separate terminal)
cd frontend
npm install
cp .env.example .env.local    # defaults work for local dev as-is
npm run dev                   # http://127.0.0.1:3000
```

Sign in with the `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` you set in `backend/.env`, then create an organization and its first institute from **Platform → Organizations**.

The frontend proxies `/api/*` to the backend via a rewrite in `next.config.ts`, so there is no CORS hop in development.

---

## Environment

### `backend/.env`

Copy from [`backend/.env.example`](backend/.env.example).

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | **yes** | PostgreSQL connection string |
| `JWT_SECRET` | **yes** | Fails fast at boot if unset |
| `JWT_EXPIRES_IN` | no | Default `7d` |
| `ENCRYPTION_KEY` | for WhatsApp | **32 bytes, hex-encoded (64 hex chars).** Encrypts WhatsApp access tokens at rest. Resolved lazily, so a bad value fails the WhatsApp call rather than the whole boot. Generate with the command in `.env.example` — **do not ship the zeros placeholder.** |
| `PORT` / `NODE_ENV` / `FRONTEND_URL` | no | Defaults `4000` / `development` / `http://127.0.0.1:3000` |
| `SUPERADMIN_EMAIL` / `_PASSWORD` / `_NAME` | for seed | Only read by `db:seed` |
| `UPLOAD_DIR` | no | Where test papers are written. Defaults to `backend/var/uploads`. **Point this at a mounted volume in production** or a redeploy loses them. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | for web push | See [Web push](#web-push) below. Without them push is a silent no-op; the in-app bell still works. |
| `WHATSAPP_APP_SECRET` / `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | for WhatsApp | Platform-level. Per-institute credentials live in `InstituteWhatsAppConfig`, not here. |
| `REMINDER_SCHEDULER` | no | Set to `off` to disable the background reminder loop |
| `REMINDER_SCHEDULER_INTERVAL_MINUTES` | no | Default `60` |

### `frontend/.env.local`

Copy from [`frontend/.env.example`](frontend/.env.example).

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend origin for the `/api/*` rewrite. Defaults to `http://127.0.0.1:4000`. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Must be byte-identical to `VAPID_PUBLIC_KEY` on the backend |

### Web push

VAPID keys aren't issued by anyone — there's no signup or third-party account. They're an ECDSA P-256 keypair you generate yourself; the browser records the public half when a user subscribes, and the push service (FCM for Chrome, Mozilla autopush for Firefox, Apple for Safari) verifies each send against it.

```bash
cd backend
npx web-push generate-vapid-keys
```

Put the public key in **both** `backend/.env` (`VAPID_PUBLIC_KEY`) and `frontend/.env.local` (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`) — a mismatch means every send is rejected. The private key stays on the backend only. `VAPID_SUBJECT` is a `mailto:`/`https:` contact URL the push service operator can reach you at.

> **Generate once and keep them.** The public key is baked into every subscription a browser has already created, so rotating the pair invalidates every `PushSubscription` row. Users silently stop receiving pushes until they re-subscribe, and there is no migration path.

This signs and identifies the sender; it does **not** encrypt the message. Payload encryption uses the per-device `p256dh` and `auth` values the browser supplies at subscribe time, already stored on each `PushSubscription` row.

---

## Scripts

### `backend/`

| Script | What it does |
|---|---|
| `npm run dev` | Watch-mode server (`tsx watch`) |
| `npm run build` / `start` | Compile to `dist/`, then run it |
| `npm run typecheck` | `tsc --noEmit` — run before every commit |
| `npm run prisma:generate` | Regenerate the client into `src/generated/prisma` |
| `npm run prisma:migrate` | `prisma migrate dev` |
| `npm run prisma:deploy` | `prisma migrate deploy` (production) |
| `npm run db:seed` | Modules, plans, superadmin |
| `npm run db:seed:demo` | Demo institute with sample data |
| `npm run db:backfill-limits` | **One-time.** Freezes existing institutes at their current plan limits — see below |
| `npm run db:reset-dev-data` | Wipes tenant data, keeps platform config |

### `frontend/`

`npm run dev` · `npm run build` · `npm run start` · `npm run lint`

There is no `typecheck` script; run `npx tsc --noEmit` from `frontend/`.

---

## After pulling these changes

Three one-time steps. **The backfill matters** — until it runs, editing a plan still silently changes every existing institute on it.

```bash
cd backend
npm install                 # cloudinary was removed from dependencies
npm run prisma:migrate      # adds the per-institute limit columns
npm run db:backfill-limits  # freezes existing institutes at current plan values
```

The backfill is idempotent and changes nothing at the moment it runs — it only stops legacy institutes from tracking their plan live. Re-running it can never overwrite a deliberate per-institute override.

---

## Architecture

```
backend/src
  app.ts            Express wiring, middleware order, static uploads mount
  server.ts         Boot + background reminder scheduler
  routes/           18 routers, one per domain — all gated by `authenticate`
  services/         Cross-route logic (payroll sync, reminders, mail, WhatsApp)
  lib/              Pure helpers (money, dates, crypto, templates)
  middleware/       auth, validate, rateLimit, errorHandler
  generated/prisma  Prisma client — generated, do not edit
frontend/src
  app/              Next App Router pages
  components/       Feature components + `ui/` primitives
  lib/              api client, types, navigation, formatting
```

### Tenancy

Every operational record carries an `instituteId` and is only ever queried scoped to one institute.

- `authenticate` verifies the JWT, then **re-validates the token's institute binding on every request** — a staff member moved between institutes, or an institute suspended, loses access immediately rather than when the 7-day token expires.
- `requireInstitute` stamps `req.tenantId`. Route handlers scope every query to it.
- `requireModule('FEES')` gates a router behind the institute's subscription.
- `requireRoles(...)` gates by role. **Reads need this too** — see `READ_ROLES` in `routes/fees.ts`.

### Roles

`SUPERADMIN` (platform) · `OWNER` (organization) · `ADMIN` · `ACCOUNTANT` · `FACULTY` · `RECEPTION` · `STUDENT`

An `OWNER` sits at the organization level and "enters" a specific institute via `POST /auth/enter-institute`, which mints a new token scoped to it. `STUDENT` exists in the enum and is plan-capped, but no route currently creates one — students are `Student` rows with a self-fill PIN, not login accounts.

### Modules

`ENQUIRY` · `ADMISSION` · `ATTENDANCE` · `FEES` · `PAYROLL` · `EXPENSE` — toggled per institute by the platform.

### Plans and limits

Headcount caps are **snapshotted onto the institute** when a plan is assigned, not read live from the plan. Editing a `Plan` changes what *future* assignments copy and nothing else, so raising the Standard tier for new signups can't silently re-provision every institute already on it.

- Enforced values: `Institute.maxAdmins` and friends, resolved by `lib/instituteLimits.ts`
- A superadmin can raise or lower one institute alone via `PATCH /platform/institutes/:id/limits`
- Re-assigning the same plan is how you deliberately pull an institute back onto its current numbers
- The platform UI shows a **Customised** badge whenever the two have drifted

---

## Conventions

**Money is `Prisma.Decimal` end to end.** Never `number`. Serialize through `lib/money.ts`, which fixes to 2 decimals. Installment splitting puts the rounding remainder on the last row.

**Concurrency on money paths.** Recording a payment, editing an installment, paying or voiding payroll are all read-modify-write sequences. They run inside `withFeeAccountLock()` (`routes/fees.ts`) or `withSalaryProfileLock()` (`routes/payroll.ts`), which take a `SELECT ... FOR UPDATE` on **one** row before reading. Reading before the lock is what made these racy — two staff each decided against a snapshot the other had already invalidated.

> The lock is per student / per staff member, not per batch or institute. Two people recording payments for two different students never block each other. Only concurrent work on the *same* record waits, for the duration of one transaction.

**Errors.** Throw `ApiError` from `lib/http.ts`; `errorHandler` renders it. Prisma's `P2025`/`P2002`/`P2003`/`P2014`/`P2000` are mapped to sensible 4xx responses; anything else is a 500 on purpose, because an unrecognised database error is a bug and should look like one.

**Validation.** `validateBody(zodSchema)` on every mutating route. Never spread `req.body` straight into a Prisma `update` — list the fields explicitly, or any column becomes settable.

**Institutes are never deleted.** Suspension (`isActive: false`) is the terminal state — fee ledgers, receipts, payroll and attendance history must stay auditable. There is no delete endpoint anywhere, and suspension is enforced in `authenticate` and `enter-institute`, not merely in listings.

---

## Operational notes

**Transaction timeouts.** Prisma's default interactive-transaction timeout is 5 seconds, and time spent waiting on a row lock counts against it. At realistic contention this never comes up. If `P2028` appears in the logs, that is what it means — pass `{ timeout: 15000 }` to the `$transaction` call in `withFeeAccountLock` / `withSalaryProfileLock`.

**Rate limiting** is in-memory and therefore per-process; running multiple instances multiplies the effective allowance. It is a burst guard. The layer that has to hold under a distributed attempt is the per-record DB lockout (self-fill PIN attempts, OTP attempt caps). `app.set("trust proxy", 1)` in `app.ts` is what makes `req.ip` trustworthy — raise the hop count only if a second real proxy is added, and never set it to `true`.

**Uploads** are written to local disk and served from `/uploads` with `nosniff` and a forced attachment disposition. File type is decided by magic bytes, never the client's `Content-Type`. Moving to an object store means changing `services/uploads.ts` and the static mount in `app.ts` — nothing else knows where a file physically lives.

---

## Project documentation

| File | What's in it |
|---|---|
| [`PRODUCTION_READINESS.md`](PRODUCTION_READINESS.md) | Pre-launch gap analysis. Several items are now closed — rate limiting, upload content sniffing, tracked migrations — but **CORS is still wide open**, there is no `helmet`, no structured logging, no Dockerfile and no CI. Read it before deploying. |
| [`code-audit-pass2.md`](code-audit-pass2.md) | Dead code, duplication and redundancy audit with a phased fixing plan (~700 recoverable lines). |
| [`prd.md`](prd.md), [`developmentplan.md`](developmentplan.md) | Product requirements and the phase plan |
| [`changes.md`](changes.md), [`changes-phase8.md`](changes-phase8.md), [`changes-phase9.md`](changes-phase9.md) | Per-phase implementation notes. Code comments reference these by section (`§8a`, `§9a`). |
| [`design.md`](design.md), [`theme.css`](theme.css) | Design system and tokens |
| [`progress.md`](progress.md), [`handoff.md`](handoff.md) | Running status |

---

## Known gaps

- **No automated tests and no CI.** The largest structural risk in the project — every change is verified by hand.
- **CORS is unrestricted** (`app.use(cors())`), and there are no security headers.
- **Voiding a fee payment is disabled** on purpose: a payment's carry-forward settlement can grow, shrink, create or delete other installments, and reversing only the allocation would leave the plan corrupted. Re-enabling it needs a stored snapshot of what each payment changed.
- **`todayDateOnly()` exists four times with two different semantics** — `lib/lectureShared.ts` uses local-time getters while `lib/dateOnly.ts` uses UTC. They disagree by a day on a non-UTC server. Tracked as B3 in the pass-2 audit.
- No structured logging, error tracking, graceful shutdown, or DB health check.
