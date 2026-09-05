# Phase 13 — Dynamic UPI QR + "share from GPay" proof capture

Planning doc, same convention as `changes-phase10/11/12.md`.

---

## Status

| Phase | Status | Notes |
|---|---|---|
| 13.1 | **Built** | Confirmed scope with the user: dynamic QR only, no admin upload, no per-invoice/staff-generated QR (that idea stays unbuilt, not planned). `qrAssetUrl`/`qrAssetName`/`qrAssetPublicId` dropped from `InstitutePaymentConfig`; both QR upload/delete routes removed from `org.ts`; `payment-qr` removed from the allowed upload folders entirely. UPI ID is now required to enable payments (verified: 400 without one). `lib/upi.ts` is the one place the `upi://pay?…` string is built — both `UpiQr` (a canvas, rendered client-side, nothing uploaded or stored) and the existing deep-link button read from it, so they can't disagree. `UpiQr` also grew a download button (added mid-build, not in the original plan) so an admin can save/print/WhatsApp the QR, and the settings tab shows the exact same component as a live preview. Verified live: enabling without a UPI ID is rejected, the portal and settings QR both render from the same builder, and no `qrAsset*` field is returned from any endpoint any more. The one existing config row in the dev database had no uploaded QR, so the "clean up old Cloudinary assets" open question needed no action. |
| 13.2 | Not built | Still gated on the open question in its own section: whether Android-only reach is acceptable given the manual-upload fallback (which stays untouched either way) already covers iOS and every other case. |

---

## Findings from reading the code first (these shape the plan)

1. **The `upi://` deep link already exists and is already dynamic.** `PayFeesSheet.tsx` (lines 128–133) builds `upi://pay?pa=…&pn=…&am=…&cu=INR`, appending `am=` only when an amount is present — exactly the "with or without amount" rule this phase wants. What's missing is rendering it as a *scannable QR*; today it's only a tappable "Open in payment app" button, and the QR shown alongside it is a static image an admin uploaded.
2. **The uploaded-QR path is a real, complete feature that has to be removed, not just ignored.** `InstitutePaymentConfig` carries `qrAssetUrl` / `qrAssetName` / `qrAssetPublicId`; `org.ts` has `POST /payment-config/qr` (Cloudinary upload) and `DELETE /payment-config/qr`; `PaymentsSettingsTab.tsx` has the upload/preview/remove UI; and `canEnable` currently accepts *either* a UPI ID *or* an uploaded QR. Removing the upload means UPI ID becomes strictly required to enable payments.
3. **`tn` (transaction note) is not currently sent.** The example in the request includes one (`tn=…Invoice INV-2026-879`). Adding it is a one-line change to the same builder — but note the example's literal `"Paid to undefined…"` is a null-name concatenation bug in whatever produced it; worth *not* reproducing.
4. **The proof-submission flow this phase plugs into is already correct and deliberate.** `PaymentProof`'s schema comment states the rule plainly: a screenshot is a claim, not a receipt — approving one calls `applyPayment()` with the amount *staff* confirm, never `amountClaimed`. Anything the share-target feature auto-fills must stay a claim, subject to the same review.
5. **The PWA manifest is a typed Next route** (`app/manifest.ts`), not hand-written JSON — `share_target` gets added there, typechecked like everything else.
6. **`qrcode` is already a dependency** (backend, added for MFA in §12.6). The frontend has no QR library yet, so the portal QR needs either a small client-side lib or a server-rendered data URL — see the decision in §13.1.

---

## Ordering

| Phase | Feature | Why here |
|---|---|---|
| 13.1 | Dynamic UPI QR (replaces uploaded QR) | Self-contained, no platform caveats, removes a whole upload/storage path rather than adding one. Confirmed scope: portal self-service QR only — the per-invoice/staff-generated QR idea discussed alongside it is explicitly **not** in scope. |
| 13.2 | Web Share Target — "pay in GPay, share to us" | Depends on nothing in 13.1, but placed second: it carries real platform limits (Android-only, best-effort parsing) that 13.1 doesn't, and it only pays off once the pay-flow around it is settled. |

---

## Phase 13.1 — Dynamic UPI QR, replacing the uploaded image

**The change:** admins stop uploading a QR image entirely. The QR the parent scans is generated on the fly from the institute's UPI ID + payee name, with the amount baked in when there is one and left open when there isn't.

### Design decisions, stated up front

- **Generated client-side, not stored.** A QR here is just an encoding of a string we already build — there is nothing to persist. Rendering it in the browser means no upload, no Cloudinary asset, no storage cost, no stale-image class of bug (an admin whose UPI ID changed but whose uploaded QR still points at the old one is a *silent* misrouted-payment bug, which is the strongest argument for this whole change).
- **The amount is whatever the parent is actually paying.** Prefilled from `nextDueAmount`, editable, and the QR re-renders as it changes. Blank amount → no `am=` → the parent's UPI app asks them for it. This is already how the deep-link button behaves; the QR just stops disagreeing with it.
- **UPI ID becomes required to enable payments.** Today `canEnable` accepts an uploaded QR *or* a UPI ID. With no upload path, a config with no UPI ID can produce neither a QR nor a link, so it can't be enabled.
- **Remove the old columns and routes rather than leaving them dormant.** Dead upload routes on a file-accepting surface are exactly the kind of thing that outlives the memory of why it exists.

### Data model

```prisma
// InstitutePaymentConfig — remove:
qrAssetUrl      String?
qrAssetName     String?
qrAssetPublicId String?
```
No new columns. `upiId` and `payeeName` (both already present) are the entire input to the QR.

**Migration note:** existing rows carry uploaded assets. Dropping the columns orphans those Cloudinary files, so the drop should be preceded by a one-off cleanup that calls `deleteAsset()` for every non-null `qrAssetPublicId` — otherwise they sit in the account forever, billed and unreferenced. Worth doing as an explicit script run once, not silently inside a migration.

### Backend

- Delete `POST /org/payment-config/qr` and `DELETE /org/payment-config/qr` (`org.ts`), plus the multer upload wiring they use.
- `GET /org/payment-config` and `GET /portal/payment-config` stop returning the three `qrAsset*` fields.
- The `PATCH` validation for enabling payments requires `upiId` (was: UPI ID **or** uploaded QR).
- No new endpoint — the QR never round-trips the server.

### Frontend

- **New shared helper** (`lib/upi.ts`): one function that builds the `upi://pay?…` string from `{ upiId, payeeName, amount?, note? }`, URL-encoding each part. Both the QR and the existing "Open in payment app" button read from this one builder, so they can never drift apart — the same "one function builds it, every caller reuses it" rule §11.2's WhatsApp template vars established after that bug.
- **`PayFeesSheet.tsx`**: replace the `config.qrAssetUrl` `<img>` with a locally-rendered QR of that string. Re-renders as the amount field changes.
- **`PaymentsSettingsTab.tsx`**: drop the upload/preview/remove UI; show a live preview of the generated QR instead, so an admin can see and test exactly what parents will scan. UPI ID becomes a required field to switch payments on.
- **Optional `tn` (transaction note)**: include the student code (e.g. `tn=Fees DEMO01-26-PHY-0001`) so the institute's own UPI statement shows who paid without staff cross-referencing. Cheap, and directly reduces the manual matching work that `PaymentProof.referenceNo` exists to ease. Flagged as a small decision rather than assumed — see open questions.

**QR library choice:** `qrcode` (already used server-side) also runs in the browser and can render to a `<canvas>`, so it's one dependency the codebase has already vetted rather than a second one. Alternative is a React-specific wrapper; not worth the extra package for one call site.

### Risk

Low, with one sharp edge: this is the *payment destination*. A malformed generated string means a parent's UPI app opens with the wrong payee or silently refuses. Mitigations: the settings-side live preview (an admin sees the real QR before enabling), and verification must include actually scanning the generated QR with a real UPI app on a phone and confirming the payee/amount screen matches — not just eyeballing the encoded string.

### Open questions

1. **Transaction note** — include the student code in `tn` as described? It makes the institute's UPI statement self-explanatory, at the cost of exposing the student code in the payer's own transaction history (low sensitivity, but it's their statement, not ours).
2. **Cleanup of existing uploaded QR assets** — run the one-off Cloudinary delete before dropping the columns, or leave the files and just drop the references? Recommend cleaning up; it's the only moment we still know the public IDs.

---

## Phase 13.2 — Web Share Target: "pay in GPay, share to us"

**The flow:** parent pays in their UPI app → taps Share on the payment → picks TutorGO from the Android share sheet → the app opens on the proof form with whatever could be parsed (amount, UTR, screenshot) already filled in → parent confirms/corrects → submits into the *existing* `PaymentProof` review queue.

### Design decisions, stated up front

- **A shortcut into the existing flow, never around it.** The share hand-off prefills the same form and produces the same `PENDING` `PaymentProof` as today. Nothing auto-approves, nothing writes money — `PaymentProof`'s own schema comment is the standing rule here, and shared text is *less* trustworthy than a screenshot, not more.
- **The manual "pick a screenshot" path stays exactly as it is.** Sharing from a UPI app is an *additional* way into the proof form, never a replacement for it — the parent can always open Pay Fees, type the amount, and attach a screenshot from their gallery the way they do today. This matters beyond preference: it's the only path that works on iOS (see the platform note below), the only one that works when the app isn't installed, and the fallback whenever a share arrives with nothing parseable in it. Note the distinction from §13.1: what that phase removes is the **admin** uploading a *QR image*; the **parent** uploading a *payment screenshot* is untouched by either phase.
- **Best-effort parsing, graceful when it finds nothing.** GPay decides what its Share button emits; it's built for sending to humans, not for machine hand-off, and can change without notice. So: parse what's there, prefill what parses, and leave the rest for the parent to type — the worst case is identical to today's manual flow, which is what makes this safe to ship despite depending on someone else's undocumented output.
- **Platform reality, stated plainly:** Web Share Target *receiving* is Android/Chromium-only and requires the PWA to be installed. iOS Safari cannot register as a share target at all — there is no workaround and no timeline. Note this is **not** a limitation of being a PWA: the app installs and runs fine on iOS, and push already works there (16.4+). Appearing *in the OS share sheet* specifically requires OS-level registration that iOS reserves for native apps (Share Extensions), so no amount of PWA capability reaches it. iPhone parents keep exactly today's flow, which is one more reason the manual upload path above is load-bearing rather than legacy.
- **The submission is attributed by session, not by anything in the share.** `POST /portal/payment-proofs` (`portal.ts:689`) reads `studentId` from `req.user.studentId` — the authenticated portal token — and never from the request body, then resolves that student's fee account from the same ID. So a share-initiated proof lands against whichever student is signed in, with no student picker to get wrong and no way for one login to file against another student. Nothing about the share payload can influence attribution, which is what keeps an untrusted, publicly-POSTable entry point from being a way to write into someone else's fee record.
- **A share arriving at a logged-out session must not lose the payload.** The share target opens the app cold; if the session has expired the parent is bounced to login, and a naive implementation drops the shared screenshot on the floor — leaving them to start over, at exactly the moment they thought they were finished. The shared text/file should be stashed (session storage) before the auth redirect and picked back up after login lands them on the fee page. Worth building in from the start rather than discovering it in the first week.

### Data model

None. No new model, no new columns — the output is an ordinary `PaymentProof`.

### Backend

Nothing new, with one caveat: a share-target `POST` lands on a **frontend** route (Next handles the form-encoded share payload), not the API. The existing `POST /portal/payment-proofs/upload` + `POST /portal/payment-proofs` pair is reused unchanged.

### Frontend

- **`app/manifest.ts`** gains a `share_target` entry: `method: "POST"`, `enctype: "multipart/form-data"`, `action: "/portal/fees/share"`, accepting `title`, `text`, `url` and `files` (`image/*`).
- **New route `/portal/fees/share`** — receives the POSTed share payload, and:
  - runs the parsed text through a small extractor (`lib/parseUpiShare.ts`): an amount (`₹`/`Rs`/`INR` followed by a number) and a UTR/reference (a 12-digit sequence, GPay's usual format), both optional;
  - hands a shared image, if any, straight into the existing compress-then-upload path used by the manual picker;
  - opens `PayFeesSheet` prefilled with whatever was found.
- **`PayFeesSheet`** gains an "initial values" input (amount / reference / preselected file) — it already owns all of these as state, so this is a prop, not a rewrite.
- The share entry point is a normal submission thereafter: the parent still sees, and can still correct, every field before submitting.

### Risk

Moderate, but contained — and none of it touches money:

- **Parsing is guesswork against an undocumented format.** Mitigated by treating every parsed field as a suggestion the parent confirms, and by never blocking submission when parsing fails.
- **A share target is a publicly reachable POST entry point into the app.** It must not act on its payload beyond prefilling a form — specifically, no auto-submit, since a share can be triggered with arbitrary attacker-chosen text.
- **Installed-PWA-only** means this silently doesn't exist for anyone who hasn't added the app to their home screen. Worth a nudge in the portal ("install the app to submit payments faster") rather than a feature that mysteriously never appears.

### Open questions

1. **Is Android-only acceptable?** The single biggest input to whether 13.2 is worth building at all. Worth checking what your parents actually use before committing.
2. **Should a shared payment with *no* parseable amount still open the sheet**, or bounce to the normal Pay Fees screen with a "we couldn't read that, please fill it in" note? Leaning toward the former (fewer dead ends), flagging rather than deciding.

---

## What I need from you before starting

1. **13.1** — decide the two open questions (transaction note? clean up old Cloudinary assets?). Neither blocks starting; both are quick calls.
2. **13.2** — the Android-only question above is worth answering *before* any code, since it's the difference between a well-used shortcut and a feature most of your users can't see.
