# Phase 11 — UPI collection, PTM module, PWA

Planning doc, same convention as `changes-phase8/9/10.md`. Each sub-phase starts only when you say so.

**Status: 11.0 built. 11.1 / 11.2 / 11.3 pending.** See "Current status" at the bottom for what is live and what is still open.

---

## Findings from reading the code first (these change the plan)

Three things I checked rather than assumed, all of which move the design:

1. **Uploads are local disk today — and that is an active production bug.** `services/uploads.ts` writes to `var/uploads/<kind>/<instituteId>/`. Its own header already says local disk is *"the interim home — Cloudinary (or any object store) comes later; nothing outside this module knows where a file physically lives, so that swap stays local."* Meanwhile `app.ts` is written for Render, where **local disk is ephemeral unless a volume is mounted** — so every redeploy silently deletes every uploaded test paper. Moving to Cloudinary (11.0 below) fixes that, and the module was designed for exactly this swap. The stale *"Cloudinary URL"* comment on `Test.paperAssetUrl` becomes true rather than wrong.
2. **Push already works end to end.** `services/push.ts` (web-push + VAPID), the `PushSubscription` model, `PushToggle`, and `public/sw.js` all exist. The service worker's own header says *"this isn't a full PWA"* — it only handles `push` and `notificationclick`, with no manifest, no caching, no install prompt. So 11.3 is **completing** a PWA, not starting one.
3. **A gap in what I shipped in 10.6.** Everywhere else in the codebase, `notify()` and `sendPush()` are called as a pair (`org.ts`, `payroll.ts`, `reminderScheduler.ts`). My `studentNotify.ts` calls `notify()` only — **students get in-app notifications but no push**. That's a bug in 10.6, not a new feature. Fixed as the first task of 11.3, or sooner if you want it standalone.

---

## Ordering

| Phase | Feature | Why here |
|---|---|---|
| 11.0 ✅ | Cloudinary storage migration | Prerequisite for 11.1 and a standing data-loss bug in its own right. Small: one module's internals change, no call site does. |
| 11.1 ⬜ | UPI / QR fee collection | Self-contained, highest direct value (money in), and the riskiest part — recording a payment — reuses the existing allocation path rather than inventing a second one. |
| 11.2 ⬜ | PTM module | New domain but small: one model, one page, one notification trigger. Depends on nothing above. |
| 11.3 ⬜ | PWA + push completion | Placed last because it makes *every* earlier reminder land on a phone lock screen — worth doing once the things worth notifying about (fee proofs, PTMs) actually exist. |

---

## Phase 11.0 — Cloudinary storage ✅ BUILT

**Why first:** payment screenshots must not evaporate on redeploy.

### What was actually built (differs from the plan below in two ways — both noted)

- `services/uploads.ts` rewritten internally; its public surface is unchanged, so **no call site needed touching**. Cloudinary when configured, local disk when not.
- `uploadAsset()` / `deleteAsset()` / `signedAssetUrl()` / `isCloudinaryConfigured()` added; `uploadTestPaper()` kept as a thin wrapper.
- `Test.paperAssetPublicId` added (nullable, no backfill) and pushed to the dev DB. Wired through the create, update and delete routes, plus the frontend round-trip, so replacing or deleting a paper now removes the old asset instead of orphaning it.
- Credentials live in `backend/.env` (gitignored); `.env.example` carries empty placeholders.

**Correction 1 — no migration is needed, contrary to the finding above.** The DB has 3 `Test` rows and **zero** with an uploaded paper. There is nothing on disk to migrate and nothing to lose on a redeploy. The Cloudinary swap is purely forward-looking; the "test papers are silently vanishing" concern was real in principle but has no instances in practice.

**Correction 2 — a security bug found by testing, now fixed.** `authenticated` uploads were storing Cloudinary's returned `secure_url`, which **already embeds a permanent signature** — that would have put a forever-valid link to a financial document in the database. The *unsigned canonical* URL is stored instead (inert on its own), and every read mints a short-lived signed URL through `signedAssetUrl()`.

Verified against live Cloudinary: stored URL carries no signature; fetching it directly returns **401**; the signed URL returns **200**; delete confirmed gone via the Admin API; HTML uploaded as `image/png` rejected on magic bytes. Note for future debugging: Cloudinary's **CDN keeps serving a deleted asset from edge cache for a while**, so a 200 straight after deletion is expected — the Admin API is the source of truth.

### Scope

`services/uploads.ts` keeps its exact public surface — `MAX_UPLOAD_BYTES`, `UploadedAsset`, `uploadTestPaper()` and the magic-byte `SIGNATURES` table all stay. Only the *destination* changes. Because no caller knows where a file physically lives (the module comment above is accurate), this is a contained change:

- Add the `cloudinary` SDK, configured from **env vars only** — `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. Never committed; added to `.env.example` as empty placeholders.
- Uploads go **server-side through the SDK**, not unsigned from the browser. An unsigned browser preset would mean shipping an upload token to every client and letting anyone write into the account. The file reaches our API first (where the magic-byte check already runs), then goes to Cloudinary.
- Folder convention: `tutorgo/<instituteId>/<kind>/` — tenant-scoped, so one institute's assets are trivially separable for export or deletion.
- Store the `secure_url` **and** the `public_id`. The `public_id` is what lets us actually delete an asset later; a URL alone can't.
- New `deleteAsset(publicId)` — used when a QR is replaced or a rejected proof is cleaned up. Without it the account accretes orphans forever.
- **Fallback preserved:** when the Cloudinary env vars are absent, fall back to the existing disk writer. Local dev without credentials keeps working exactly as it does now.
- `Test.paperAssetUrl` gains a sibling `paperAssetPublicId`; existing rows keep working (their URLs still resolve from disk until re-uploaded), so **no backfill is required**.

### Delivery-side compression

Cloudinary can compress on delivery, which is strictly better than shipping the original: request assets with `f_auto,q_auto:good` so a modern browser gets WebP/AVIF and an old one gets JPEG, decided per request. This is *in addition to* browser-side compression, not instead of it — browser compression saves the student's upload bandwidth (the slow, expensive leg on mobile data), delivery transforms save everyone else's download.

---

## Phase 11.1 — UPI / QR fee collection

**The flow:** admin configures their UPI ID and/or QR in Settings → student taps "Pay fees" in the portal → sees the UPI ID, a copy button, the QR, and a deep link that opens GPay/PhonePe → pays outside the app → uploads a screenshot → staff review it and approve → a real `Payment` is recorded.

### Data model

Follows the existing `InstituteEmailConfig` / `InstituteWhatsAppConfig` convention — a separate per-institute config model, not columns bolted onto `Institute`:

```prisma
model InstitutePaymentConfig {
  id            String  @id @default(cuid())
  instituteId   String  @unique
  /// Master switch. Off = no "Pay fees" button in the portal at all.
  isEnabled     Boolean @default(false)
  upiId         String?
  payeeName     String?
  /// Disk path of the uploaded QR, same storage as test papers.
  qrAssetUrl    String?
  qrAssetName   String?
  /// Free text shown under the QR — "include your student code in the note".
  instructions  String?
  ...timestamps
}

enum PaymentProofStatus { PENDING APPROVED REJECTED }

model PaymentProof {
  id             String  @id @default(cuid())
  instituteId    String
  studentId      String
  feeAccountId   String
  /// What the student says they sent. Never trusted as the recorded amount —
  /// staff type the real figure at approval. See "the money rule" below.
  amountClaimed  Decimal @db.Decimal(10, 2)
  /// UPI reference/UTR the student can optionally type in.
  referenceNo    String?
  assetUrl       String
  assetName      String
  assetBytes     Int
  status         PaymentProofStatus @default(PENDING)
  /// Set once approved — the Payment this proof produced. The link is what
  /// makes double-approval impossible and gives staff an audit trail.
  paymentId      String? @unique
  reviewedByUserId String?
  reviewedAt     DateTime?
  rejectReason   String?
  submittedAt    DateTime @default(now())
}
```

### The money rule (the important design decision)

**Approving a proof does not create a `Payment` by itself — it opens the existing "Record payment" path with the fields prefilled.** A screenshot is a claim, not a receipt. It can be edited, reused, or be of someone else's transfer. So:

- The amount that gets recorded is the one **staff confirm**, not `amountClaimed`.
- Recording goes through the *existing* `POST /fees/payments` logic — receipt numbering, `withFeeAccountLock`, waterfall allocation, carry-forward. **No second money path.** This is the single most important constraint in this phase: two ways to create a `Payment` is how ledgers drift.
- Implementation: `POST /fees/payment-proofs/:id/approve` takes the same body as `POST /fees/payments`, records the payment inside the same transaction as flipping the proof to `APPROVED` and stamping `paymentId`.
- `paymentId @unique` means a proof can only ever produce one payment, even under a double-click or a retried request.

### Image compression (client side, before upload)

Screenshots off a modern phone are 2–5 MB; a class of 60 paying monthly is otherwise gigabytes a year of near-identical PNGs.

The constraint that decides the numbers: **a UPI screenshot has to stay readable**. Staff verify it by reading the UTR/reference number and the amount — both small text. Compress too hard and the feature stops working, so this is tuned for legibility first and size second.

- New `lib/compressImage.ts`: draw to a `<canvas>`, longest edge capped at **1600 px**, re-encode as JPEG at **quality 0.85**. If still over ~600 KB, retry once at 0.75. **Never below 1280 px** on the longest edge — that's the floor where UTR digits start breaking up on a typical phone screenshot.
- Expected result: a 2–5 MB screenshot → roughly **180–350 KB**, with the reference number still crisp. Text-heavy screenshots stay near the top of that range on purpose.
- Canvas re-encoding **drops EXIF as a side effect**, which strips GPS off a photo taken of another screen. Worth having deliberately, not by luck.
- The server still validates independently — never trust the client did any of it: size cap, real magic-byte sniffing (the existing `SIGNATURES` table, not the attacker-controlled `Content-Type`), and a hard reject of anything that isn't JPEG/PNG/WebP.
- Stored in **Cloudinary** (11.0) under `tutorgo/<instituteId>/payment-proofs/`; the DB holds `secure_url` + `public_id`. **Not a DB blob** — a `bytea` column bloats every backup and makes the row unreadable without a decode step, for no gain.
- Rejected proofs are deletable via `deleteAsset(public_id)`, so declined screenshots don't accumulate in the account indefinitely.

### Backend

- `GET/PUT /org/payment-config` — OWNER/ADMIN. Validation: if `isEnabled`, at least one of `upiId` / QR must be present, else the student sees an empty sheet.
- `POST /org/payment-config/qr` — multipart QR upload through `services/uploads.ts`; replacing an existing QR deletes the old asset rather than orphaning it.
- `GET /portal/payment-config` — the student's read-only view. Returns `null` when disabled, so the button simply isn't rendered.
- `POST /portal/payment-proofs` — multipart, rate-limited per student (a proof upload endpoint is a free file host otherwise). Rejects if the student has a `PENDING` proof already, so the review queue can't be flooded.
- `GET /portal/payment-proofs` — their own submissions and current status.
- `GET /fees/payment-proofs?status=` — staff queue.
- `POST /fees/payment-proofs/:id/approve` — see the money rule above.
- `POST /fees/payment-proofs/:id/reject` — reason required; the student sees it and can resubmit.

### Frontend

- **Settings → new "Payments" tab**: enable toggle, UPI ID, payee name, QR upload with preview, instructions textarea.
- **Portal → Fees**: a "Pay fees" button when config is enabled. Opens a sheet with:
  - the amount due prefilled (their next installment)
  - UPI ID with a copy button
  - the QR image
  - a `upi://pay?pa=…&pn=…&am=…&tn=…` deep link — on Android this opens the payment app directly, which is the single biggest UX win here. On desktop it does nothing, so it's only rendered on touch devices.
  - "I've paid — upload screenshot" → compress → upload → the sheet switches to a "Waiting for confirmation" state.
- **Fees page → new "Payment proofs" tab** for staff: the queue, thumbnail, claimed amount, student, reference, and Approve / Reject.

### Risk

The genuine risk is a parallel money path, addressed above by construction. Second risk is the upload endpoint — mitigated with per-student rate limiting, the one-pending-proof rule, magic-byte validation and the size cap.

---

## Phase 11.2 — PTM (parent–teacher meeting) module

### Data model

```prisma
model ParentMeeting {
  id            String @id @default(cuid())
  instituteId   String
  title         String
  courseId      String
  /// Required — a meeting always belongs to exactly one batch.
  batchId       String
  date          DateTime @db.Date
  startTime     DateTime @db.Time
  endTime       DateTime @db.Time
  venue         String?
  note          String?
  createdByUserId String
  cancelledAt   DateTime?
  cancelReason  String?
  ...timestamps
}
```

**One row per batch, each with its own date and timings.** `batchId` is required rather than optional, because that is what makes the feature work in practice: two batches of the same standard almost never meet in the same slot, so a course-wide meeting with a single time would be wrong for most of the people it notifies.

Scheduling for a whole standard is a *UI* concern, not a model one — the create flow picks a course, lists its batches, and lets staff set a time per batch, writing one row each. Selecting every batch is how you schedule "12th standard's PTM"; the rows stay independent, so one batch can be rescheduled or cancelled without touching the others.

Deliberately **not** per-student slots — confirmed with you. That's slot generation, booking and conflict handling, and belongs in its own phase if it's ever wanted.

### "The message to copy until the meeting ends"

Reading your note as: staff need a ready-made message to paste into their own WhatsApp groups, and it should stay available right up until the meeting is over.

- Two new `MessageTemplateType` values: `PTM_SCHEDULED`, `PTM_CANCELLED`, with defaults in `lib/messageTemplates.ts` and Meta-shaped drafts in `whatsappTemplateSuggestions.ts` — same as every other trigger.
- The PTM row shows a `CopyMessageBox` (the component already used on the Defaulters and Attendance screens) **while `now < endTime`** for that batch's own meeting. Once the meeting's end time passes the copy box disappears, since pasting it afterwards only confuses parents.
- Alongside the copy box, a **Send now** action that dispatches for real through `notifyStudent`/`notifyBatch` — portal notification for students with a login, WhatsApp to parents where a template is connected. Exactly the machinery 10.6 already built.

### Reminders before the meeting

`services/reminderScheduler.ts` is already an in-process ticker that fires lead-time notifications — so this needs **no new scheduling infrastructure**, just a second query in the existing tick: PTMs whose date is within a lead window and which haven't been reminded yet. Proposed leads: **1 day before, then 2 hours before.**

### Frontend

New page `/ptm`, **last in the Institute** nav section, roles `OWNER` / `ADMIN` / `RECEPTION` (matching who schedules lectures today). Upcoming and past lists, a create/edit modal (course → optional batch → date → start/end → venue → note), cancel with a reason, the copy box, and Send-now.

Students see it in their portal — surfaced on the Timetable screen and as a notification, so a parent opening the app sees "PTM this Saturday" without a separate screen to learn.

---

## Phase 11.3 — PWA + push completion

### First: fix the 10.6 push gap

`services/studentNotify.ts` calls `notify()` but not `sendPush()`. One line, restoring the pairing every other call site already uses. Without it, none of the reminders below reach a locked phone — which is most of the point.

### Making it an installable PWA

What exists: a push-only service worker. What's missing:

- **`app/manifest.ts`** (Next's typed route, not a hand-written JSON file): name, short name, `start_url: "/"`, `display: "standalone"`, theme/background colours from our own tokens, and icons at 192/512 plus a **maskable** 512 so Android doesn't letterbox the icon in a white square.
- **Icons** — need generating from the TutorGO mark; I'll produce them as part of the build.
- **iOS** — Safari ignores most of the manifest: needs `apple-touch-icon` and `apple-mobile-web-app-*` meta tags in `layout.tsx`, and a note that **iOS only supports web push when the app is installed to the home screen**. That's an Apple limitation, not something we can code around; the install prompt has to explain it.
- **Install prompt** — capture `beforeinstallprompt`, show a dismissible "Add TutorGO to your home screen" bar. Shown to students by default (they're the phone-first audience); dismissal remembered in `localStorage`.

### Caching — with one hard rule

The service worker will precache the app shell and use stale-while-revalidate for static assets.

**It must never cache `/api/*` responses.** Every API response is tenant- and user-scoped; a cached one sitting on disk is another student's fee record waiting to be served to whoever opens the browser next on a shared family phone. API stays network-only, with an offline fallback page when the network is gone. This is the one non-negotiable in this sub-phase.

### Better notifications

- Payloads carry the `Notification.metadata` we already store, so `notificationclick` deep-links to the right screen (`/portal/tests`, `/portal/fees`) instead of always `/dashboard` — which is what it does today, and which a STUDENT can't even open.
- `tag` per notification type so five fee reminders collapse into one instead of stacking.
- An icon and badge, so it looks like an app notification rather than a browser one.

### Staying signed in for 15–30 days, then auto-logout

Today: a JWT with `JWT_EXPIRES_IN` (**7d** by default), held in `localStorage`. In an installed PWA that storage persists fine across launches — so the only thing forcing a student to re-enter their password every week is the token's own expiry.

Just raising it to `30d` is the one-liner, and it's the wrong fix: a token that leaks then works for a month, and there is no revocation list to cut it short.

**Proposed: sliding expiry with a hard absolute cap.**

- The token gains a `sessionStart` claim, stamped once at login and **copied unchanged** through every renewal.
- Access tokens stay short-lived (**7d**). On any authenticated request where the token is over halfway to expiring, the server issues a fresh one and returns it in a response header; the client swaps it in silently. Someone who opens the app weekly is never logged out.
- Renewal is refused once `now - sessionStart` exceeds the **absolute cap (14d, configurable via env)**. At that point they re-authenticate — a real auto-logout with a real ceiling, not a rolling token that lives forever.

Two things make this cheap and safe here specifically:

- `authenticate` **already re-reads the user from the database on every request** — checking `isActive`, institute suspension, and (since 10.6) student portal eligibility. So deactivating an account or switching off a course still kills access instantly regardless of how long the token has left. The long session extends *convenience*, not *reach*.
- Renewal costs nothing extra: it rides the user lookup that already happens.

**Settled: 14 days for every role.** One number, no per-role branching — simpler to reason about and to explain to a user who asks why they were signed out.

### Risk

Service workers are genuinely easy to get wrong: a bad `sw.js` can pin a stale app version on someone's phone for weeks. Mitigations: version the cache name, `skipWaiting` + `clients.claim` on activate, and delete old caches on activate. I'll also add a "reload for update" prompt rather than swapping the app under someone mid-form.

---

## Decisions (settled)

1. **Money rule — confirmed.** Admin reviews each proof and approves or rejects it themselves; nothing is ever auto-recorded from a screenshot. The whole feature is additionally gated behind the Settings toggle, so an institute that hasn't opted in never sees it.
2. **PTM placement — top-level `/ptm`,** positioned **last in the Institute nav section**.
3. **PTM granularity — batch-wise.** Not per-student slots. See the revised model below: one meeting row **per batch**, each with its own timings, created several at a time from a course-level flow. This is what makes "schedule their timings" work — two batches of the same standard rarely meet at the same hour.
4. **PWA icons — pending.** You're supplying an SVG. Everything else in 11.3 gets built; icons are generated from that SVG when it lands, so this doesn't block the phase.
5. **Session — 14 days for every role,** sliding expiry with a hard 14-day absolute cap.
6. **Cloudinary — both.** Payment proofs *and* existing test-paper uploads.
7. **Order — unchanged:** 11.0 Cloudinary → 11.1 UPI → 11.2 PTM → 11.3 PWA.

### One interpretation to flag

On (2) your answer was *"works or below at the last?"* — I've read that as **top-level `/ptm`, placed at the bottom of the Institute section**. Say if you meant something else.

---

## Superseded — original open questions

1. **11.1 — the money rule.** Confirm you're happy that approving a screenshot *prefills* a payment for staff to confirm, rather than recording it automatically. Auto-recording from a screenshot is possible but I'd argue strongly against it.
2. **11.2 — where does PTM live?** New top-level `/ptm` under Institute (my proposal), or a tab on the Attendance page alongside lectures?
3. **11.2 — per-student slots?** I've scoped this as whole-class meetings. Say if you actually want individual time slots per parent, because that's a materially bigger build.
4. **11.3 — icons.** Do you have a TutorGO logo/mark file, or should I generate icons from the current wordmark?
5. **Session length (11.3).** Confirm the sliding-expiry-with-cap approach, and whether you want 30d for students but a shorter cap for OWNER/ADMIN, or one number for every role.
6. **Cloudinary migration scope (11.0).** Move *only* new payment proofs, or also switch test-paper uploads over (my recommendation — they're the ones currently at risk of vanishing on redeploy)?
7. **Order.** I've put Cloudinary first, then UPI. Happy to swap if PTM or PWA is more urgent.

Nothing starts until you pick.


---

## Current status

| Phase | State | Notes |
|---|---|---|
| **11.0 Cloudinary** | ✅ **Built** | Live now — new uploads already go to Cloudinary, not disk. `paperAssetPublicId` column is in the dev DB. Both sides typecheck clean. |
| **11.1 UPI / QR** | ⬜ Pending | No models, no routes, no UI. |
| **11.2 PTM** | ⬜ Pending | No model. |
| **11.3 PWA + push** | ⬜ Pending | No manifest. Includes the 10.6 push gap below. |

### Open items

1. **The 10.6 push gap.** `services/studentNotify.ts` writes an in-app `Notification` but never calls `sendPush()` — unlike every other call site in the codebase (`org.ts`, `payroll.ts`, `reminderScheduler.ts`), which pair the two. Students therefore get **nothing on a locked phone**, which is most of the point of reminders. Roughly one line. Scheduled as the first task of 11.3, but it is a silent hole in something already shipped, so it can be pulled forward at any time.
2. **PWA icons** — blocked on the TutorGO SVG. Everything else in 11.3 can be built without it; icons get generated when it lands.
3. **New Cloudinary credentials** — the account currently configured belongs to another project. Swapping is three `.env` values (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`), no code change.
4. **`demo.admin@tutorgo.local` still has a test password** (`E2eTest!2345`), set during the 10.6 end-to-end run. Reset it if that account is used for anything real.

### Also worth knowing

- The 10.6 student-portal logins created during testing were **cleaned up** — the three test `User` rows deleted, `Student.userId` / `portalIssuedForCourseId` cleared, and `Course.portalEnabled` set back to `false`. The dev DB is where it started.
