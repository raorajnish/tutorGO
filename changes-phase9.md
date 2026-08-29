
# Addendum — Phase 9: Communication, alerts, permissions audit, documents, exports, audit trail

> Planning only. These weren't part of the original five requests — they're gaps identified while
> reviewing the app against what a coaching-class management system typically needs. Sequenced
> **after 8a–8f** (see revised overall order at the end of this addendum), since none of them are
> blocking today, but two (§9f audit trail, and WhatsApp for the 8f admission link + 8a fee
> reminders) are flagged as worth pulling forward if 8a/8d/8f are being built soon — noted inline.

---

## 9a. Parent/student communication via WhatsApp (+ existing email)

### The problem

Notifications today are in-app only (`Notification` model + push subscriptions), plus the existing
`InstituteEmailConfig`/`mailer.ts` path. Fee-overdue reminders, the Phase 8d reminders, low-attendance
alerts (§9b), and the Phase 8f admission-link circulation all lose most of their value if the parent
never opens the app to see them — most coaching classes run communication through WhatsApp, not an
app inbox. **Scope decision: WhatsApp + email only, no SMS** — SMS aggregator dropped from this plan.

### What this builds on

An in-app template system already exists (`backend/src/lib/messageTemplates.ts`) — 5 typed triggers
(`LECTURE_SCHEDULED`, `LECTURE_CANCELLED`, `ATTENDANCE_MARKED`, `FEE_OVERDUE_REMINDER`,
`PAYROLL_PAYMENT_RECORDED`), each with an institute-editable `{{var}}`-style body, currently used for
in-app notifications/email. WhatsApp's Cloud API can't send freeform text for business-initiated
messages — it requires pre-approved HSM templates (numbered placeholders `{{1}}`, `{{2}}`, fixed
wording, async Meta review). So this is one message concept with two representations (in-app
freeform vs Meta HSM), not a second content system — WhatsApp "dummy templates for approval" are
Meta-shaped drafts *derived from* the same 5 triggers.

`InstituteEmailConfig` is the precedent for a per-institute 3rd-party credential (stored plaintext,
never echoed back in GET). A WhatsApp long-lived access token is more sensitive — first genuinely
**encrypted** secret in the codebase.

### Design — this pass is backend groundwork only

Credential storage, template sync from Meta, dummy templates ready to submit for approval, and a
send primitive. **Not** in this pass: wiring into fee-overdue/8f links/9b alerts — that's a distinct
follow-up once this groundwork exists and real WABA credentials are available to test against.

- `InstituteWhatsAppConfig` (1:1 with Institute): `accessToken` (encrypted), `phoneNumberId`,
  `wabaId`, `businessAccountId?`, `webhookVerifyToken`, `isEnabled`, `connectedAt`, `updatedAt`.
- `WhatsAppTemplate` — local cache of Meta-side templates: `instituteId`, `metaTemplateId?`, `name`,
  `language`, `category`, `status` (`APPROVED|PENDING|REJECTED|DRAFT`), `bodyText`, `mappedType?`
  (links an approved template to one of the 5 internal trigger types), `lastSyncedAt`.
- `OutboundMessage` — delivery log: `instituteId`, `studentId?`, `channel` (`WHATSAPP` only — no
  SMS), `toPhone`, `templateName`, `payload Json`, `status` (`QUEUED|SENT|FAILED`),
  `providerMessageId`, `error`, `sentAt`, `createdAt`. Every send logged, not fire-and-forget.
- `backend/src/lib/crypto.ts` — AES-256-GCM encrypt/decrypt using a new `ENCRYPTION_KEY` env var.
- `backend/src/lib/whatsappTemplateSuggestions.ts` — static defs converting the 5 existing template
  bodies into Meta HSM shape (numbered placeholders + sample values + suggested category), mirroring
  `messageTemplates.ts`.
- `backend/src/services/whatsapp.ts` — thin Graph API client: `testConnection`, `syncTemplates`
  (pulls approval status from Meta), `submitTemplate` (POSTs a draft for review),
  `sendTemplateMessage`.
- `backend/src/routes/whatsapp.ts`, `OWNER/ADMIN`-only (per §9c precedent):
  - `GET/PUT/DELETE /whatsapp/config`, `POST /whatsapp/config/test`
  - `GET /whatsapp/templates`, `POST /whatsapp/templates/sync`, `POST /whatsapp/templates/:id/submit`,
    `POST /whatsapp/templates/:id/map`
  - `POST /whatsapp/webhook` (public, outside `authenticate` — Meta's delivery-status callbacks; GET
    for the verify handshake, POST with `X-Hub-Signature-256` check, rate-limited)
- Cost/consent matter — WhatsApp messages cost money and touch a parent's phone directly. The
  eventual per-trigger-type send toggle (owner decides whether fee-reminders go out by WhatsApp or
  stay in-app-only) is part of the later wiring step, not this groundwork pass.

### Build order

1. Schema: `InstituteWhatsAppConfig`, `WhatsAppTemplate`, `OutboundMessage`, additive migration.
2. `crypto.ts` + `ENCRYPTION_KEY` env var.
3. `services/whatsapp.ts` (Graph API calls — test connection, sync templates, submit template, send
   template message).
4. `routes/whatsapp.ts` (config CRUD/test, template sync/list/submit/map, public webhook receiver).
5. `whatsappTemplateSuggestions.ts` seed data derived from the 5 existing triggers.
6. Frontend: new "WhatsApp" tab in Settings (same slot pattern as the existing `email` tab) — connect
   form, connection-test button, template list with status badges + "submit for approval" per draft.
7. Test against a real (or sandboxed) WABA: save creds → test connection succeeds/fails correctly;
   sync templates → cache reflects Meta's actual approval states; submit a draft → status becomes
   `PENDING`; webhook status callback → matching `OutboundMessage` row updates.

The unifying `sendMessage()` dispatcher and wiring fee-overdue/8f/9b through it stays a separate
follow-up, once this groundwork exists.

---

## 9b. Low-attendance alerts

### The problem

Attendance marking + daily summary already exist, but nothing proactively flags "this student has
fallen below X% attendance" to staff or parents — today someone has to go looking.

### Design

Reuses 8d's reminder/scheduler infrastructure rather than inventing a second scheduled-job
mechanism — build 9b *after* 8d for exactly this reason.

- Per-course (or institute-wide default) configurable threshold, e.g. `Course.attendanceAlertPct
  Int?` (null = alerts off for that course) — a flat global default is probably wrong since
  different courses may tolerate different attendance norms.
- Daily job (same runner as 8d's reminder job, different query) computes each active student's
  trailing attendance percentage (window = since admission, or a rolling 30-day window — recommend
  rolling 30-day, since "was 100% attendance in month one, now skipping" is the actually useful
  signal, not a lifetime average that dilutes slowly) and creates a `Notification` (staff-facing)
  once a student crosses below threshold — with a cooldown (don't re-fire daily once already
  below; re-fire only if it drops further or after N days) to avoid alert fatigue.
- Parent-facing version rides on 9a once that exists — a WhatsApp "your ward's attendance is at 62%,
  below the required X%" — explicitly deferred until 9a lands, not built as a separate channel.

### Build order

1. `Course.attendanceAlertPct` (or institute-level default), additive migration.
2. Extend the 8d scheduler with a second daily query (attendance rollup + threshold check),
   reusing its transaction-per-item/idempotency pattern.
3. Staff-facing `Notification` on crossing threshold, with cooldown logic.
4. Once 9a exists: parent WhatsApp variant, gated by the institute's message-type toggle.
5. Test: mark a student below threshold → confirm one alert fires, not one per day; attendance
   recovers above threshold then drops again → confirm it re-fires; course with alerts disabled →
   confirm no alerts ever generated for its students.

---

## 9c. Role/permission audit

### The problem

Module gating exists (`requireModule`), but a systematic pass confirming *who* can do *what* within
an enabled module hasn't been done — worth checking before Phase 8/9 add several new write
surfaces (reminders, distribution, admission links, messaging settings) on top of the existing
role set.

### Scope — not new infrastructure, an audit + fixes

- Enumerate every route's role gate (`OWNER/ADMIN/ACCOUNTANT/RECEPTION/FACULTY`, whatever the
  current enum is) into one table: module × role × read/write. Compare against what actually makes
  sense (reception probably shouldn't touch payroll/expenses/fee-structure-templates; faculty
  should stay scoped to their own lectures per the Attendance precedent already enforced).
- Apply the same gating convention to every Phase 8/9 addition as it's built — §8d (reminders) and
  §9a (messaging settings) already recommended `ADMIN/OWNER`-only above; keep that consistent
  rather than defaulting new routes to "any authenticated role" and tightening later.
- No schema change. Possibly a few route-level gate corrections if the audit finds a gap.

### Build order

1. Produce the module × role table from the actual route gates (grep every `requireModule`/role
   check across `backend/src/routes`).
2. Flag mismatches against expected access (reception+payroll, faculty+other-faculty's-records,
   etc.) — fix any found.
3. Re-confirm as each Phase 8/9 route is added, rather than as a one-time pass that goes stale.

---

## 9d. Document storage (ID proof, marksheets, photos)

### The problem

No file-upload/storage concept exists anywhere in the schema or routes. Coaching classes routinely
need to attach a document to a student record (ID proof, previous marksheet, photo) — currently
nowhere to put one.

### Design

- Needs actual object storage (S3-compatible bucket or equivalent — check hosting setup, same kind
  of infra decision as 8d's scheduler) since files don't belong in Postgres. New model
  `StudentDocument` — `id, studentId, kind (ID_PROOF|MARKSHEET|PHOTO|OTHER), fileName, storageKey,
  mimeType, sizeBytes, uploadedByUserId, uploadedAt`.
- Upload flow: backend issues a pre-signed upload URL (avoids proxying large files through the API
  server), frontend uploads directly to storage, then confirms with the backend to create the
  `StudentDocument` row — standard pattern, not proxying bytes through Node.
- Ties in naturally with 8f's self-fill admission form — a student could optionally attach a photo
  or ID proof at self-fill time, but recommend treating that as a *follow-up* to 8f rather than
  bundling it in, since 8f is already the highest-risk phase (public surface) and file upload from
  an unauthenticated form is a meaningfully bigger security surface (upload size/type limits,
  scanning) — do 8f without uploads first, add document upload (staff-side first, public later)
  once 8f itself is stable.
- Access control: documents are sensitive (ID proofs) — signed/expiring URLs for viewing, not
  permanently public storage keys; role-gated per §9c (reception/admin only, not every faculty
  login).

### Build order

1. Pick storage backend, `StudentDocument` model, additive migration.
2. Pre-signed upload/download URL endpoints, gated per §9c.
3. Staff-side UI: attach document to a student record (Students/Admissions screen), list + view +
   delete.
4. Later, optionally: public self-fill form (8f) gains an optional attach-photo/ID step, once 8f's
   core flow is stable and the upload-abuse considerations (size/type limits, rate limits) are
   worked through explicitly as their own security pass.
5. Test: upload a document → confirm it's retrievable only via signed URL, not a guessable public
   path; wrong role attempts access → 403; delete → confirm storage object removed, not just the
   DB row; mobile pass (uploading a photo from a phone camera directly is the realistic use case
   here, test that specifically, not just a file picker on desktop).

---

## 9e. Data export / backup

### The problem

No "export everything" exists for an owner's own records/compliance needs. The only export planned
anywhere is 8f's small admission-roster PDF.

### Design

- Simple first pass: per-module CSV export (students, fee accounts + payments, attendance,
  expenses) — reuse whatever CSV/PDF generation gets built for 8f's roster export rather than
  introducing a second library.
- `GET /export/:module?from=&to=` per module, `OWNER`-only (this is the one action that touches
  literally everything, tightest gate in the app).
- Full-institute backup (all modules, one zip/archive) is a larger lift — worth flagging as a v2 of
  this feature rather than building both at once; the per-module CSVs cover the realistic "I need
  my data for my own accountant/records" use case for most owners.

### Build order

1. Reuse 8f's PDF/CSV generation utility; add per-module CSV export endpoints, `OWNER`-gated.
2. Frontend: "Export" action per module's existing screen (Students, Fees, Attendance, Expenses),
   date-range filter where relevant.
3. Test: export each module → confirm data matches what's on-screen, cross-institute isolation
   holds (can't export another institute's data), large export doesn't time out the request (paginate
   or stream if row counts get large — check realistic institute sizes before assuming this needs
   special handling).

---

## 9f. Audit trail for sensitive/money-adjacent edits

### Why this one is worth pulling forward

Phase 8a explicitly makes `FeeInstallment.amount` mutable outside the existing reschedule/edit-
amount actions (the carry-forward split). Right now that's traced only implicitly via the
`Payment`/`PaymentAllocation` rows that caused it — good enough for the "why did this change"
question, but there's no single place to see "who changed what, when" across installment edits,
reschedules, waives, and voids together. Recommend building a minimal version of this **alongside
8a**, not deferred to Phase 9, specifically because 8a is the change that most needs it; the rest
of this section (extending it institute-wide) can wait.

### Design

- Lightweight, not a general event-sourcing system: `AuditLog` — `id, instituteId, userId, action
  (string, e.g. "installment.amount_adjusted", "installment.waived", "payment.voided"),
  entityType, entityId, before Json?, after Json?, createdAt`.
- Written explicitly at each sensitive mutation site (installment edit/reschedule/waive, payment
  void, and later: reminder/distribution deletes, document deletes) — not a generic middleware
  that logs every request, which would be noisy and capture nothing structured enough to be
  useful. Start with the money-adjacent actions (Fees, Payroll) since that's where "who changed
  this and why" actually gets asked.
- Surfaced as a simple per-entity history view first (e.g. an "activity" tab on a `FeeAccount`
  showing its `AuditLog` rows) rather than a global audit-log browser — the global view is a
  reasonable v2 once there's enough logged activity to make browsing it useful.

### Build order

1. `AuditLog` model, additive migration — do this as part of 8a's step 2 (same migration as the
   `adjustedFromPrevious` field) since it's needed to properly log 8a's new mutation path.
2. Write `AuditLog` rows at 8a's carry-forward split, existing reschedule/edit-amount/waive/void
   actions in `fees.ts` (retrofit those too while touching this code, since they're the same kind
   of edit and currently have no trail either).
3. Simple "activity" section in `FeeAccountModal`/`InstallmentList` showing the entity's log.
4. Extend to Payroll's line-item corrections (flagged as unsolved in the Payroll addendum §10)
   once Fees' version is proven.
5. Test: adjust an installment via carry-forward → confirm one `AuditLog` row with correct
   before/after; void a payment → confirm logged; activity view renders correctly and matches
   actual DB history; mobile pass on the activity tab display.

---

## 9g. Test/exam results tied to parent notification

### The problem

A `tests` module already exists, but results aren't surfaced to parents — closing that loop matters
more once 9a's messaging exists, since "how is my child doing" is one of the highest-value things
to actually push out rather than leave behind a login parents won't use.

### Design

- No new schema needed if `tests` already stores per-student scores — check the existing
  `tests.ts`/model before assuming otherwise. The work here is purely on the notification side:
  once a test's results are finalized/published, trigger a 9a message per student ("Your ward
  scored 78/100 in the Physics unit test") using the same `services/messaging.ts` path as fee
  reminders and attendance alerts.
- Needs a "publish results" action (if one doesn't already exist) as the trigger point — don't
  auto-send the moment a single mark is entered, since results are usually entered incrementally
  and a parent shouldn't get five partial notifications while marks are being typed in.

### Build order

1. Confirm existing `tests` module's data shape and whether a "publish" step exists; add one if
   not (a boolean/timestamp on the test entity, `publishedAt`).
2. Wire `publishedAt` transition to call `services/messaging.ts` per student in that test.
3. Test: enter marks incrementally → confirm no messages sent until publish; publish → confirm one
   message per student, matching their actual score; re-publish/correct a mark after publish →
   decide and confirm the intended behavior (recommend: a correction re-send is a deliberate
   separate action, not automatic, so a typo fix doesn't spam parents a second time).

---

## Revised overall recommended build order (8a–8f, 9a–9g)

1. **8a** (installment settlement) + **9f**'s minimal `AuditLog` built alongside it (not after).
2. **8b** (inactive-course guards).
3. **8d** (reminders + scheduler infrastructure).
4. **9b** (low-attendance alerts) — rides on 8d's scheduler, do it right after.
5. **8e** (distribution tracking).
6. **9c** (role/permission audit) — cheap, do it before 8f adds more write surfaces to get wrong.
7. **8f** (self-service admission links) — without document upload.
8. **9a** (WhatsApp messaging) — wire into 8a's overdue reminders, 8f's link circulation, and
   9b's alerts once it exists.
9. **9d** (document storage) — staff-side first; public self-fill upload only after 8f is stable.
10. **9e** (data export/backup).
11. **9g** (test results → parent notification) — depends on 9a.
12. **8c** (subject-wise fees) — **approved for build 2026-08-29** (add-on plans cut from scope);
    see `changes-phase8.md` §8c for the locked decisions and revised build order.

Same discipline as before: schema → backend → frontend → mobile pass → that phase's test checklist,
before moving to the next.
