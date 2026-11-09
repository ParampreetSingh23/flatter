import { createHash } from "node:crypto";
import sharp, { type Metadata } from "sharp";

export const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const FORMATS: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
export const ALLOWED_MIME = Object.values(FORMATS);

export class ImageRejected extends Error {}

// Decode, validate, strip metadata (EXIF/GPS), re-encode to a controlled format. Extensions and Content-Type are never trusted.
export async function sanitizeImage(input: Buffer) {
  if (input.length > MAX_BYTES) throw new ImageRejected("Image must be 5 MB or smaller.");
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_PIXELS, failOn: "error" }).metadata();
  } catch {
    throw new ImageRejected("This file isn't a valid JPEG, PNG or WebP image.");
  }
  if (!meta.format || !FORMATS[meta.format] || !meta.width || !meta.height) {
    throw new ImageRejected("Only JPEG, PNG and WebP images are supported. Export your photo in one of those formats.");
  }
  const [w, h] = [meta.width, meta.height];
  if (w * h > MAX_PIXELS) throw new ImageRejected("Image is too large (over 40 megapixels).");
  const [long, short] = w >= h ? [w, h] : [h, w];
  if (long < 640 || short < 480) throw new ImageRejected("Image must be at least 640 × 480 pixels.");
  try {
    const { data, info } = await sharp(input, { limitInputPixels: MAX_PIXELS, failOn: "error" })
      .rotate() // honour EXIF orientation, then drop all metadata (sharp strips it by default)
      .resize({ width: 2560, height: 2560, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    // Same decoded photo -> same sanitized bytes -> same hash (used to reject duplicates).
    return { data, mime: "image/webp", width: info.width, height: info.height, bytes: data.length, hash: createHash("sha256").update(data).digest("hex") };
  } catch {
    throw new ImageRejected("This image is damaged and couldn't be processed.");
  }
}
