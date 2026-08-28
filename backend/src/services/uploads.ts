import { v2 as cloudinary } from "cloudinary";
import { ApiError } from "../lib/http.js";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

export const ALLOWED_UPLOAD_MIME: Record<string, "pdf" | "image"> = {
  "application/pdf": "pdf",
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
};

let configured = false;

/** Cloudinary is optional infrastructure — an institute can run the whole
 * Tests flow without ever attaching a paper. We only demand credentials at
 * the moment someone actually uploads, so a missing CLOUDINARY_* env var is a
 * clear 503 on that one action instead of a boot failure. */
function ensureConfigured() {
  if (configured) return;

  const url = process.env.CLOUDINARY_URL;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (url) {
    cloudinary.config({ secure: true });
  } else if (cloudName && apiKey && apiSecret) {
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  } else {
    throw new ApiError(
      503,
      "UPLOADS_NOT_CONFIGURED",
      "File uploads aren't configured on this server. Set CLOUDINARY_URL (or CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET) to enable them."
    );
  }

  configured = true;
}

export interface UploadedAsset {
  url: string;
  type: "pdf" | "image";
  name: string;
}

export async function uploadTestPaper(file: {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}, instituteId: string): Promise<UploadedAsset> {
  ensureConfigured();

  const type = ALLOWED_UPLOAD_MIME[file.mimetype];
  if (!type) throw ApiError.badRequest("Only PDF, PNG, JPEG or WebP files are allowed.");
  if (file.size > MAX_UPLOAD_BYTES) throw ApiError.badRequest("File must be 10MB or smaller.");

  const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `tutorgo/test-papers/${instituteId}`,
        // "raw" keeps PDFs downloadable as-is; images go through the image
        // pipeline so they can be thumbnailed in the UI later.
        resource_type: type === "pdf" ? "raw" : "image",
      },
      (err, res) => {
        if (err || !res) return reject(err ?? new Error("Upload failed"));
        resolve(res as { secure_url: string });
      }
    );
    stream.end(file.buffer);
  });

  return { url: result.secure_url, type, name: file.originalname };
}
