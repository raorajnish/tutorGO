/**
 * Client-side image compression for payment-proof screenshots
 * (changes-phase11.md §11.1).
 *
 * The constraint that decides every number here: a UPI screenshot has to
 * stay readable. Staff verify a proof by reading the UTR/reference number and
 * the amount, both small text — compress too hard and the feature stops
 * working, so this is tuned for legibility first and file size second.
 *
 * Not used for anything else in the app (QR uploads and test papers are
 * staff-side files on a desk, not a phone photo of a phone screen) — this is
 * deliberately scoped to the one place it was asked for.
 */

const MAX_EDGE = 1600;
/** Never shrink below this on the longest edge — this is roughly where a UTR
 * printed in a typical UPI app's small type starts breaking up into unreadable
 * blocks, so going lower defeats the point of asking for the screenshot. */
const MIN_EDGE = 1280;
const TARGET_MAX_BYTES = 600 * 1024;
const QUALITY_FIRST_PASS = 0.85;
const QUALITY_SECOND_PASS = 0.75;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not compress that image."))), "image/jpeg", quality);
  });
}

/**
 * Resizes and re-encodes an image file for upload, returning a new `File`
 * (never mutates the input). Non-image files (a PDF, say) pass through
 * unchanged — this only ever touches JPEG/PNG/WebP screenshots.
 *
 * Re-encoding through a canvas drops EXIF as a side effect, which also strips
 * GPS coordinates off a photo taken of another screen — worth having
 * deliberately, not by luck.
 */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  const img = await loadImage(file);
  const longestEdge = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = Math.min(1, MAX_EDGE / longestEdge);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  let blob = await canvasToBlob(canvas, QUALITY_FIRST_PASS);

  if (blob.size > TARGET_MAX_BYTES) {
    const retryScale = Math.max(MIN_EDGE / Math.max(canvas.width, canvas.height), 1);
    // Only shrink further if we're still above the floor — otherwise just
    // re-encode the same canvas at the lower quality.
    if (retryScale < 1) {
      canvas.width = Math.round(canvas.width * retryScale);
      canvas.height = Math.round(canvas.height * retryScale);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }
    blob = await canvasToBlob(canvas, QUALITY_SECOND_PASS);
  }

  const name = file.name.replace(/\.\w+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
}
