import { randomBytes } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { v2 as cloudinary } from "cloudinary";
import { ApiError } from "../lib/http.js";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

export type UploadKind = "pdf" | "image";

/**
 * How an asset is delivered.
 *
 * - `public` — anyone with the URL can fetch it. The URL is unguessable, which
 *   is the same posture local-disk uploads have had all along (see app.ts's
 *   static mount). Right for test papers.
 * - `authenticated` — Cloudinary refuses to serve it without a signed URL, so
 *   a leaked link stops working once the signature expires. Right for payment
 *   screenshots, which are financial records rather than course material.
 */
export type AssetVisibility = "public" | "authenticated";

/** Where uploads land when Cloudinary isn't configured. Defaults to
 * `<backend>/var/uploads`, intentionally outside `src` so a rebuild never
 * wipes it. */
// `||` not `??` on purpose: an unset var and a var set to "" (which is what a
// commented-out .env line usually leaves behind) must both fall back.
const UPLOAD_ROOT = process.env.UPLOAD_DIR?.trim() || path.resolve(process.cwd(), "var", "uploads");

/** Public path prefix disk-backed files are served from — see app.ts, which
 * mounts UPLOAD_ROOT here read-only, as attachments, with nosniff. */
export const UPLOAD_URL_PREFIX = "/uploads";

export { UPLOAD_ROOT };

/**
 * Cloudinary is the real home for uploads; local disk is the fallback.
 *
 * This is not a preference — on Render (and any host without a mounted
 * volume) the container filesystem is ephemeral, so a disk-backed upload is
 * silently deleted on the next deploy. Anything a user is told was "saved"
 * must not live there.
 *
 * The fallback is kept so local development works with no credentials at all,
 * exactly as it did before. Which path is taken is decided here and nowhere
 * else: no caller knows or cares where a file physically lives.
 */
const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME?.trim();
const API_KEY = process.env.CLOUDINARY_API_KEY?.trim();
const API_SECRET = process.env.CLOUDINARY_API_SECRET?.trim();

const cloudinaryEnabled = Boolean(CLOUD_NAME && API_KEY && API_SECRET);

if (cloudinaryEnabled) {
  cloudinary.config({
    cloud_name: CLOUD_NAME,
    api_key: API_KEY,
    api_secret: API_SECRET,
    secure: true,
  });
}

export function isCloudinaryConfigured(): boolean {
  return cloudinaryEnabled;
}

interface Signature {
  kind: UploadKind;
  ext: string;
  mime: string;
  /** Byte prefix that must match, `null` for a wildcard byte. */
  magic: (number | null)[];
  /** Extra bytes that must appear at a fixed later offset (WebP's "WEBP"). */
  at?: { offset: number; bytes: number[] };
}

/** A file's real type is decided by its bytes, never by the multipart
 * Content-Type — that header is attacker-controlled, so trusting it would let
 * anyone store arbitrary content under a `application/pdf` label. */
const SIGNATURES: Signature[] = [
  { kind: "pdf", ext: ".pdf", mime: "application/pdf", magic: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { kind: "image", ext: ".png", mime: "image/png", magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { kind: "image", ext: ".jpg", mime: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  {
    kind: "image",
    ext: ".webp",
    mime: "image/webp",
    magic: [0x52, 0x49, 0x46, 0x46, null, null, null, null], // RIFF????
    at: { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }, // WEBP
  },
];

function detect(buffer: Buffer): Signature | null {
  return (
    SIGNATURES.find((sig) => {
      if (buffer.length < sig.magic.length) return false;
      const headOk = sig.magic.every((byte, i) => byte === null || buffer[i] === byte);
      if (!headOk) return false;
      if (!sig.at) return true;
      const end = sig.at.offset + sig.at.bytes.length;
      if (buffer.length < end) return false;
      return sig.at.bytes.every((byte, i) => buffer[sig.at!.offset + i] === byte);
    }) ?? null
  );
}

export interface UploadedAsset {
  url: string;
  type: UploadKind;
  name: string;
  /**
   * Handle for deleting the asset later. Cloudinary assets carry their
   * `public_id`; disk-backed ones carry a `disk:`-prefixed relative path, so
   * `deleteAsset` works the same either way and callers never branch on
   * storage backend.
   *
   * Without storing this, an asset can only ever be orphaned — a URL alone is
   * not enough to delete anything.
   */
  publicId: string;
  bytes: number;
}

/** Sanitises the display name only. It is never used to build a path — the
 * stored name is random — so this is about what staff see in the UI, not
 * about path traversal, which is structurally impossible here. */
function safeDisplayName(originalname: string): string {
  const base = path.basename(originalname).replace(/[\r\n\t]/g, " ").trim();
  return base.slice(0, 120) || "upload";
}

export type AssetFolder = "test-papers" | "payment-proofs" | "payment-qr";

interface UploadOptions {
  instituteId: string;
  folder: AssetFolder;
  /** Defaults to `public`, matching how uploads have always been served. */
  visibility?: AssetVisibility;
}

interface IncomingFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

/**
 * Validates and stores one uploaded file, returning everything needed to
 * render it and to delete it later.
 *
 * Validation happens here rather than at the call sites so every upload path
 * gets the same magic-byte check — a client that skips its own compression or
 * lies about `Content-Type` is caught regardless of which route it hit.
 */
export async function uploadAsset(file: IncomingFile, opts: UploadOptions): Promise<UploadedAsset> {
  if (file.size > MAX_UPLOAD_BYTES) throw ApiError.badRequest("File must be 10MB or smaller.");

  const signature = detect(file.buffer);
  if (!signature) throw ApiError.badRequest("Only PDF, PNG, JPEG or WebP files are allowed.");

  const visibility = opts.visibility ?? "public";
  const name = safeDisplayName(file.originalname);
  // Random basename: no part of user input reaches a path or a public_id, so
  // two staff uploading "paper.pdf" at once can't collide or overwrite.
  const id = randomBytes(16).toString("hex");

  if (cloudinaryEnabled) {
    // Tenant-scoped folder so one institute's assets stay trivially
    // separable — for export, for audit, or for deletion on offboarding.
    const folder = `tutorgo/${opts.instituteId}/${opts.folder}`;

    const result = await new Promise<{ secure_url: string; public_id: string; bytes: number }>(
      (resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder,
            public_id: id,
            // PDFs are handled under Cloudinary's `image` resource type, so a
            // single value covers every format SIGNATURES admits. Pinning it
            // (rather than "auto") keeps delete and signing consistent.
            resource_type: "image",
            type: visibility === "authenticated" ? "authenticated" : "upload",
            overwrite: false,
          },
          (error, uploaded) => {
            if (error || !uploaded) return reject(error ?? new Error("Cloudinary upload failed"));
            resolve(uploaded as { secure_url: string; public_id: string; bytes: number });
          }
        );
        stream.end(file.buffer);
      }
    ).catch(() => {
      throw new ApiError(502, "UPLOAD_FAILED", "Could not store the file. Try again in a moment.");
    });

    return {
      // For an authenticated asset we deliberately DO NOT store the
      // `secure_url` Cloudinary hands back: that URL already carries a
      // permanent signature, so anything that ever sees it (a DB dump, a
      // logged API response, a browser history entry) would have unlimited
      // access to a financial document. Storing the unsigned canonical URL
      // instead means the stored value is inert on its own — every read goes
      // through signedAssetUrl() and gets a short-lived signature. Verified:
      // fetching the unsigned URL returns 401.
      url:
        visibility === "authenticated"
          ? cloudinary.url(result.public_id, {
              resource_type: "image",
              type: "authenticated",
              secure: true,
              sign_url: false,
            })
          : result.secure_url,
      type: signature.kind,
      name,
      publicId: result.public_id,
      bytes: result.bytes,
    };
  }

  // --- Disk fallback (local dev without credentials) ------------------------
  const filename = `${id}${signature.ext}`;
  const relative = path.posix.join(opts.folder, opts.instituteId, filename);
  const dir = path.join(UPLOAD_ROOT, opts.folder, opts.instituteId);

  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), file.buffer);

  return {
    url: `${UPLOAD_URL_PREFIX}/${relative}`,
    type: signature.kind,
    name,
    publicId: `disk:${relative}`,
    bytes: file.size,
  };
}

/**
 * A time-limited URL for an `authenticated` asset.
 *
 * Public assets and disk-backed ones are already fetchable by URL, so this
 * returns their stored URL unchanged — callers can use it unconditionally
 * without knowing how a given asset was stored.
 */
export function signedAssetUrl(
  publicId: string,
  storedUrl: string,
  { expiresInSeconds = 600 }: { expiresInSeconds?: number } = {}
): string {
  if (!cloudinaryEnabled || publicId.startsWith("disk:")) return storedUrl;

  return cloudinary.url(publicId, {
    resource_type: "image",
    type: "authenticated",
    sign_url: true,
    secure: true,
    // A short window: long enough to load the image on a slow connection,
    // short enough that a URL copied out of devtools is useless by the time
    // it is shared.
    expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
  });
}

/**
 * Permanently removes an asset. Safe to call with a null/undefined handle so
 * callers don't each need a guard.
 *
 * Never throws: deletion is always cleanup after the real work has already
 * committed, and failing a request because a leftover file couldn't be tidied
 * would be worse than the leftover file. "Not found" is treated as success —
 * the asset being gone is the outcome the caller wanted — but any *other*
 * failure is logged rather than silently swallowed, because a destroy that
 * quietly fails every time is how storage bills grow without explanation.
 *
 * Note for anyone verifying by hand: Cloudinary's CDN keeps serving a deleted
 * asset from its edge cache for a while, so a 200 on the URL right after
 * deletion is expected. The Admin API is the source of truth.
 */
export async function deleteAsset(
  publicId: string | null | undefined,
  visibility: AssetVisibility = "public"
): Promise<void> {
  if (!publicId) return;

  if (publicId.startsWith("disk:")) {
    const relative = publicId.slice("disk:".length);
    // Defensive: a stored handle should never contain traversal, but this is
    // the one place a stored string becomes a filesystem path.
    const resolved = path.resolve(UPLOAD_ROOT, relative);
    if (!resolved.startsWith(path.resolve(UPLOAD_ROOT))) return;
    await unlink(resolved).catch(() => {});
    return;
  }

  if (!cloudinaryEnabled) return;

  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
      type: visibility === "authenticated" ? "authenticated" : "upload",
    });
    if (result.result !== "ok" && result.result !== "not found") {
      console.warn(`[uploads] destroy(${publicId}) returned "${result.result}"`);
    }
  } catch (err) {
    console.warn(`[uploads] destroy(${publicId}) failed:`, err instanceof Error ? err.message : err);
  }
}

/** Back-compat wrapper — test papers are public, same as they have always
 * been served. */
export async function uploadTestPaper(file: IncomingFile, instituteId: string): Promise<UploadedAsset> {
  return uploadAsset(file, { instituteId, folder: "test-papers", visibility: "public" });
}
