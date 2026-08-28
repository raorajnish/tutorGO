import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

if (!process.env.ENCRYPTION_KEY) {
  throw new Error("ENCRYPTION_KEY is not set");
}

// Must be a 32-byte key, hex-encoded (64 hex chars) — generate with
// `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
const KEY = Buffer.from(process.env.ENCRYPTION_KEY, "hex");
if (KEY.length !== 32) {
  throw new Error("ENCRYPTION_KEY must be a 32-byte key, hex-encoded (64 hex characters)");
}

const IV_LENGTH = 12; // GCM standard nonce size

/** AES-256-GCM, one call per secret. Output packs iv + authTag + ciphertext
 * into a single base64 string so callers store one column, not three. First
 * secret in this codebase that needs actual encryption at rest (WhatsApp
 * access tokens are broader-blast-radius than InstituteEmailConfig.password
 * — see changes-phase9.md §9a). */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decrypt(packed: string): string {
  const buf = Buffer.from(packed, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = buf.subarray(IV_LENGTH + 16);
  const decipher = createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
