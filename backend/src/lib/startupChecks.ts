import { isCloudinaryConfigured } from "../services/uploads.js";

/**
 * Fails loudly at boot rather than silently at request time. Without
 * Cloudinary configured, services/uploads.ts falls back to local disk — fine
 * for local dev, but on Render (and any host without a mounted volume) the
 * container filesystem is ephemeral, so every test paper and payment proof
 * "saved" that way is silently gone on the next deploy or restart. Catching
 * this here, once, at startup is cheaper than debugging a support ticket
 * about a vanished payment receipt weeks after the first deploy without it.
 */
export function assertProductionConfig(): void {
  if (process.env.NODE_ENV !== "production") return;

  if (!isCloudinaryConfigured()) {
    throw new Error(
      "CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET must all be set in production — " +
        "without them, uploads silently fall back to local disk, which does not survive a redeploy."
    );
  }
}
