import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ApiError } from "../lib/http.js";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

export type UploadKind = "pdf" | "image";

/** Where uploads land on disk. Defaults to `<backend>/var/uploads`, which is
 * intentionally outside `src` so a rebuild never wipes it. Override with
 * UPLOAD_DIR to point at a mounted volume in production. Local disk is the
 * interim home — Cloudinary (or any object store) comes later; nothing outside
 * this module knows where a file physically lives, so that swap stays local. */
// `||` not `??` on purpose: an unset var and a var set to "" (which is what a
// commented-out .env line usually leaves behind) must both fall back.
const UPLOAD_ROOT = process.env.UPLOAD_DIR?.trim() || path.resolve(process.cwd(), "var", "uploads");

/** Public path prefix the files are served from — see app.ts, which mounts
 * UPLOAD_ROOT here read-only, as attachments, with nosniff. */
export const UPLOAD_URL_PREFIX = "/uploads";

export { UPLOAD_ROOT };

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
}

/** Sanitises the display name only. It is never used to build a path — the
 * on-disk name is random — so this is about what staff see in the UI, not
 * about path traversal, which is structurally impossible here. */
function safeDisplayName(originalname: string): string {
  const base = path.basename(originalname).replace(/[\r\n\t]/g, " ").trim();
  return base.slice(0, 120) || "upload";
}

export async function uploadTestPaper(
  file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  instituteId: string
): Promise<UploadedAsset> {
  if (file.size > MAX_UPLOAD_BYTES) throw ApiError.badRequest("File must be 10MB or smaller.");

  const signature = detect(file.buffer);
  if (!signature) throw ApiError.badRequest("Only PDF, PNG, JPEG or WebP files are allowed.");

  // Random basename: no part of user input reaches the filesystem path, and
  // two staff uploading "paper.pdf" at once can't collide or overwrite.
  const filename = `${randomBytes(16).toString("hex")}${signature.ext}`;
  const dir = path.join(UPLOAD_ROOT, "test-papers", instituteId);

  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), file.buffer);

  return {
    url: `${UPLOAD_URL_PREFIX}/test-papers/${instituteId}/${filename}`,
    type: signature.kind,
    name: safeDisplayName(file.originalname),
  };
}
