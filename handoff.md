# Handoff — Phase 12 and beyond

Written for whichever Claude agent picks this up next, with no memory of the conversation that built phases 8–11. Read this before touching `changes-phase12.md`. It is not a feature spec — `changes-phase12.md` is that. This is the operating manual: how this codebase actually works, what patterns are load-bearing, and how the user likes to work.

**Status as of writing:** Phases 1–11 (through PWA/push) are built and were each verified live before being marked done. Phase 12 (`changes-phase12.md`) is planned in full — ten sub-phases, schema/routes/frontend/risk for each — but **nothing in it is built yet.** Verify that claim yourself before trusting it; this file rots the moment code moves.

---

## 1. How the user works — read this first

- **Plan, then confirm, then build. Never skip to implementation.** Every phase in this project started as a written plan (`changes-phaseN.md`), was read back to the user, and only started once they said go. If you're about to write code for something in `changes-phase12.md` that hasn't been explicitly greenlit in this session, stop and ask first — a plan existing is not the same as approval to build it.
- **When a plan's assumption turns out wrong, say so plainly — don't quietly route around it.** This user has explicitly corrected the habit of silently working around a bad assumption. If you open a file expecting a `loading` boolean and find the list is `null`-typed instead, that's fine and expected (this codebase mixes both patterns) — but if something in the *plan* turns out to not match reality, flag it in the same breath as fixing it, not after.
- **Build fully, don't stop partway.** If a task has five files to touch, touch all five in the same pass before reporting done. Don't report "mostly done" as done.
- **Verify by running the thing, not by reading the code and trusting it compiles.** See §5.

---

## 2. Non-negotiable architectural patterns

Every one of these was established deliberately, sometimes after a bug. Breaking them silently reintroduces bugs that were already found and fixed once.

### "Derive, don't store" for anything that could drift
Status fields (`FeeInstallment` payment status, `DistributionReceipt` status, student portal access status) are **never** stored as an enum column — they're computed live from the facts that justify them, every time they're read. See `lib/portalAccess.ts` for the canonical example and its own doc comment explaining why. If you're tempted to add a `status` column to a new model in Phase 12, ask first whether it should instead be derived.

### Tenant isolation
Every operational query is scoped by `instituteId` / `req.tenantId`. `requireInstitute` middleware stamps `req.tenantId` from the authenticated user's token; every route handler filters on it. A spot-check across the codebase found this clean — keep it that way. Never trust an `instituteId` from the request body/params for a scoping decision; only from `req.tenantId`.

### `authenticate` re-checks liveness on every single request
Not just signature/expiry — it re-reads the user row and checks: `isActive`, institute suspension, and (since §10.6) live student-portal eligibility (`Course.portalEnabled` + `portalIssuedForCourseId === courseId`). This is what makes revocation-by-side-effect work: deactivate a user, suspend an institute, or toggle a course's portal flag, and access dies on the *next* request, not whenever a 7-day token happens to expire. **Phase 12.2 (session revocation) and 12.6 (MFA) both need to slot into this same function** (`backend/src/middleware/auth.ts`) rather than becoming a separate check bolted on elsewhere — that's exactly what the plan for both already describes; don't reinvent the wiring.

### One money-writing path
`fees.ts`'s `applyPayment()` is the **only** function that writes a `Payment` row and touches `FeeInstallment.paidAmount`. It handles receipt numbering, waterfall allocation across installments, and carry-forward. When UPI-proof approval (§11.1) needed to record money, it called this exact function inside the same DB transaction as its own status flip — it did not write a second, simpler payment path. If Phase 12 ever needs to record money for any reason, it goes through `applyPayment()`. No exceptions, no "just this once, simpler" version.

### Cloudinary uploads via `services/uploads.ts`, not ad hoc
`uploadAsset()` / `deleteAsset()` / `signedAssetUrl()` — one module, one place validation happens (magic-byte sniffing, never trusting the client's declared MIME type), one place the public-vs-authenticated visibility decision is made. `visibility: "public"` for course material (test papers, study resources if you build §12.5) since a random unguessable URL is an acceptable exposure; `visibility: "authenticated"` for financial documents (payment screenshots) since those need to actually be inaccessible without a signed, short-lived URL. **Get this distinction right per file type — it was the subject of a real bug** (an early payment-proof implementation stored Cloudinary's `secure_url`, which embeds a permanent signature, defeating the whole point of "authenticated" — caught by testing, not by review, before it shipped). If Phase 12.5's study resources ever need to be *not* public for some tier of content later, don't default to copying the payment-proof pattern without thinking about why that one exists.

### Student notifications go through `studentNotify.ts`, not ad hoc dispatch
`notifyStudent()` / `notifyBatch()` are the only functions that should ever write a portal `Notification` + fire `sendPush()` + dispatch WhatsApp for a student-facing event. They already handle: rendering the body once and reusing it for both channels (a real bug existed where two channels could show different wording because the render happened twice), routing to the right in-app deep link per event type (`PORTAL_ROUTE_FOR_TYPE` map), and skipping the in-app channel when portal access isn't currently `ACTIVE`. If Phase 12.5 (study material) needs a "new resource uploaded" notification, it calls `notifyBatch()` — it doesn't write to the `Notification` table directly.

### WhatsApp template variables — one function builds them, every caller reuses it
This one is worth calling out because it bit the PTM feature (§11.2) directly: three different routes each built their own template-variable object by hand, and one of them silently omitted a `venue` key, so two out of three call sites rendered a literal, unrendered `{{venue}}` in a real message. Fixed by extracting a single `meetingVars()`-style helper that every call site shares. **When you add a new notification trigger with more than one call site, build the vars object in exactly one function and import it everywhere** — don't let this class of bug recur.

### Dev-database schema changes use `prisma db push`, not `prisma migrate`
This project has no `prisma/migrations` folder and none should be created casually. `npm run prisma:migrate` in this repo is a stale script name left over from an earlier README — actually running it against this DB throws `P2022` and is a real historical bug that already confused a previous session. Use `npx prisma db push`, and when it warns about data loss (usually a new `@unique` on a genuinely-empty new column), verify the warning is spurious (check whether the affected rows actually have data first) before ever passing `--accept-data-loss` — and ask the user's explicit go-ahead each time you do, via the `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=1` env var pattern already used throughout prior phases. Never assume standing consent carries over from an earlier turn.

---

## 3. Things a fresh agent will get wrong if it doesn't know them

- **`STUDENT` is a real, first-class `Role` now, not a role that "never gets a User row."** Older code comments in this repo (a couple of stale ones may still exist — fix them if you spot them) predate Phase 10.6 and say students never get logins. That was true through Phase 9. Since 10.6, a student *can* have a `User` row, but only ever created explicitly by staff through `/portal-access` — never automatically at admission. Don't "fix" `countUsage()`/`assertRoleCapacity` in `planLimits.ts` to count students via `User` — it deliberately still counts via `Student`, because the plan caps *enrollment*, not *logins issued*, and the comment there explains why.
- **The portal (`/portal/*`) and the staff app are two different nav shells, two different route trees, gated by `RoleRoute`.** A STUDENT's home is `/portal`, not `/dashboard` — `lib/onboarding.ts`'s `homeRoute()` is the single source of truth for "where does this role land," used by `ProtectedShell` and every onboarding redirect. If Phase 12 adds a role-specific landing anywhere, go through that function, don't hardcode a redirect.
- **Fee-overdue automatic sweeps and unpaid-leave payroll deduction are *deliberately* not built.** Both were raised, discussed, and explicitly deferred pending a policy decision from the user (10.2's sweep needs go-ahead; 10.4b's deduction rule needs the user to pick full-pay-regardless vs. per-day-deduct). Don't build either as a "nice to have" side effect of Phase 12 work without the user explicitly re-raising it.
- **`ScheduledReminder` (staff-only "pay the electricity bill" reminders) and student-facing notifications are two unrelated systems that happen to share the word "reminder."** Don't conflate them. `reminderScheduler.ts` runs the former; `studentNotify.ts` + `ptmReminders.ts` run the latter, and they're separate tickers for a reason (see `ptmReminders.ts`'s own doc comment: it's deliberately simpler than the configurable-lead-time cursor machinery in `reminderScheduler.ts`, because PTMs only ever need two fixed leads).
- **`next build` / `next start` and the user's own `next dev` share the same `.next` folder and will corrupt each other's build cache if run concurrently.** This caused a real incident (500s and `ENOENT`s in the user's live session) earlier in this project. **Default to `tsc --noEmit` + `next lint` for verification.** Only run `next build`/`next start` if you've confirmed the user's dev server isn't running, and clean up (`rm -rf .next`, kill your own stray processes) before handing back.
- **PWA icons are a genuinely custom-made monogram** (`frontend/public/icons/logo-source.svg`), not a placeholder waiting to be deleted — it's a "T" whose crossbar bends into a rising chevron, in the app's real palette. It was explicitly flagged to the user as placeholder-*quality* (not a professional identity designer's work) but it is live and referenced from `manifest.ts`/`layout.tsx`. Don't regenerate it without being asked.

---

## 4. Conventions to match, not reinvent

- **Every list page needs a skeleton loader now** — this was a real, systematic gap found and fixed across ~26 files in one pass. `SkeletonRow`/`SkeletonLine`/`SkeletonBlock`/`SkeletonGrid`-style components live in `components/ui/Skeleton.tsx`. Any new list page in Phase 12 (audit log, global search results, support ticket queue, bulk-import results table) needs one from the start — check `components/analytics/StudentAnalyticsTab.tsx` for the reference pattern (a `loading ? <SkeletonRow x N> : realRows` branch in the `<tbody>`, mirrored in the mobile card list if there is one).
- **Every new page needs both a desktop table and a mobile card list**, following the `hidden sm:block` / `sm:hidden` split used everywhere (Students, Enquiries, Admissions, etc.). This is not optional polish — mobile responsiveness has been an explicit, repeated requirement throughout this project.
- **CSV import/export uses `lib/csv.ts`'s `toCsv()`/`csvEscape()`** on the backend, `lib/api.ts`'s `apiDownload()` on the frontend, and the shared `ExportButton` component for the UI trigger. Phase 12.1's bulk import needs a *parser* (new dependency, doesn't exist yet — confirmed by checking `package.json`) but should still produce its downloadable template/error-report CSVs through the existing `toCsv()` helper, not a second ad hoc CSV writer.
- **Rate limiting**: `middleware/rateLimit.ts`'s `rateLimit({max, windowMs, keyPrefix})` is the existing per-IP limiter, already used on `/auth/*` and the payment-proof upload route. Any new unauthenticated or abuse-prone surface (e.g. a public support-ticket submission, if that's ever added) should get one.
- **Encryption at rest**: `lib/crypto.ts` already has the pattern used for `InstituteWhatsAppConfig.accessToken`. Phase 12.6 (MFA) explicitly plans to reuse this exact pattern for `User.mfaSecret` — don't invent a second encryption approach.
- **Audit logging**: `services/audit.js`'s `auditLog()` — already called from `org.ts` and `platform.ts`. Every SuperAdmin-side mutation in Phase 12 (12.7 is literally "make this visible," 12.8 impersonation *requires* it for both identities, 12.10 suspension needs it) should call this, matching the existing four call sites' shape.

---

## 5. Verification discipline — do not skip this

Every phase built in this project (8 through 11) was verified with **live HTTP requests against the running dev server and a real (test) database state**, not just `tsc --noEmit`. The pattern, every time:

1. Typecheck both `backend` and `frontend` (`npx tsc --noEmit`), lint the frontend (`npx next lint --dir src`).
2. Start the backend dev server in the background, hit the actual new routes with `curl` (via Bash, since this environment doesn't have a browser automation tool wired up) — login as a real test user, exercise the happy path *and* the edge cases the plan called out (e.g. §11.1's proof-approval flow was checked against the actual `FeeInstallment` row before/after, not just a 200 response).
3. **Actively try to break the thing you just built** — this is how three real bugs were caught across phases 10–11 before they shipped: an unrendered `{{venue}}` placeholder, a `secure_url`-with-embedded-signature leak, and a nullish-coalescing guard that couldn't distinguish "field omitted" from "field explicitly cleared." All three were found by adversarial testing, not by re-reading the diff.
4. **Clean up every piece of test data created during verification** — temporary students, temporary logins, temporary fee accounts, toggled flags — restore the dev DB to the state it was in before you started. Every phase's write-up documents this explicitly; do the same.
5. Only then update the `changes-phaseN.md` doc to mark the phase built, including what was actually found during testing (bugs, corrections to the original plan) — not just "done."

For Phase 12 specifically: 12.2 (session revocation) and 12.6 (MFA) touch the login/auth flow directly. Test them by actually hand-crafting or fetching tokens and checking the boundary conditions (a token issued just before vs. just after a revocation; a login that requires MFA vs. one that doesn't), the same way §11.3's sliding-session cap was verified with two hand-crafted tokens at the actual boundary rather than trusted by inspection.

---

## 6. Two items flagged for explicit user sign-off before building

Both are called out in `changes-phase12.md` itself, but worth repeating here because they're the two places a fresh agent is most likely to just start coding without checking:

- **Phase 12.6 (MFA)** — opt-in vs. mandatory for OWNER/ADMIN, and whether the SuperAdmin "disable MFA for this account" escape hatch is acceptable given it's itself a new attack surface. Do not build the login-flow change without this being settled.
- **Phase 12.8 (Impersonate / "view as")** — the read-only-by-default + explicit-escalation design, and the dual-identity audit requirement. This is the single highest-blast-radius feature in this phase (a SuperAdmin compromise plus impersonation is a compromise of every institute on the platform) — treat it accordingly.

---

## 7. Where things live

- `changes-phase8.md` through `changes-phase12.md` — the full plan-and-build history, in order. Each is the authoritative record of what was decided and why for that phase; read the relevant one before touching adjacent code.
- `PRODUCTION_READINESS.md` — **dated 2026-08-22, confirmed stale in multiple places** (it claims no rate limiting and no magic-byte upload validation, both of which now exist). Don't cite it without re-verifying each claim against current code first — this was caught and called out explicitly in this session.
- `developmentplan.md` / `progress.md` — older planning docs, predate phases 8+. Historical context only, not a current source of truth.
- `prd.md` / `design.md` — product/design reference, still broadly relevant for tone and visual language (Tailwind tokens, the light/dark theme system, the "polished, not flashy" design bar this app holds itself to).
