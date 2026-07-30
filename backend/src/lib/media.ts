import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Uploads arrive from the browser as base64 data URIs. Storing them in SQLite
 * and echoing them back inside list responses made a single gallery request
 * tens of megabytes. Here they are decoded once, written to disk under a
 * content hash, and referenced by a short immutable URL instead.
 */

const here = dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = join(here, "..", "..", "data", "uploads");
mkdirSync(UPLOAD_DIR, { recursive: true });

/** Extension per accepted mime type. Anything absent here is rejected. */
const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 20 * 1024 * 1024;

const DATA_URL_RE = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i;

export class MediaError extends Error {}

export function isStoredMediaUrl(value: string): boolean {
  return /^\/uploads\/[a-f0-9]{32}\.[a-z0-9]{2,5}$/.test(value);
}

/** Magic-byte check so a renamed executable cannot pose as an image. */
function sniffMatches(mime: string, buf: Buffer): boolean {
  if (buf.length < 12) return false;
  switch (mime) {
    case "image/jpeg":
      return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case "image/png":
      return buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case "image/gif":
      return buf.subarray(0, 6).toString("latin1") === "GIF87a" || buf.subarray(0, 6).toString("latin1") === "GIF89a";
    case "image/webp":
      return buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP";
    case "image/avif":
    case "video/mp4":
    case "video/quicktime":
      return buf.subarray(4, 8).toString("latin1") === "ftyp";
    case "video/webm":
      return buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
    default:
      return false;
  }
}

interface StoreOptions {
  /** Accept video as well as images. Off by default. */
  allowVideo?: boolean;
}

/**
 * Validates a base64 data URI and writes it to disk.
 * Returns the public path to store in the database.
 *
 * Values that are already stored upload paths pass through unchanged, so
 * re-submitting an existing record does not duplicate the file.
 */
export function storeDataUrl(input: string, opts: StoreOptions = {}): string {
  const value = input.trim();

  if (isStoredMediaUrl(value)) return value;

  const match = DATA_URL_RE.exec(value);
  if (!match) {
    throw new MediaError("Upload must be an image file selected from your device.");
  }

  const mime = match[1].toLowerCase();
  const accepted = opts.allowVideo ? { ...IMAGE_TYPES, ...VIDEO_TYPES } : IMAGE_TYPES;
  const ext = accepted[mime];
  if (!ext) {
    throw new MediaError(
      opts.allowVideo
        ? "Use a JPG, PNG, WebP, GIF, MP4 or WebM file."
        : "Use a JPG, PNG, WebP, GIF or AVIF image."
    );
  }

  const buf = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  const limit = mime.startsWith("video/") ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;

  if (buf.length === 0) throw new MediaError("That file appears to be empty.");
  if (buf.length > limit) {
    throw new MediaError(`File is too large. Keep it under ${Math.round(limit / 1024 / 1024)} MB.`);
  }
  if (!sniffMatches(mime, buf)) {
    throw new MediaError("That file is not a valid image or video.");
  }

  const hash = createHash("sha256").update(buf).digest("hex").slice(0, 32);
  const filename = `${hash}.${ext}`;
  const target = join(UPLOAD_DIR, filename);

  // Content-addressed: an identical re-upload reuses the file already on disk.
  if (!existsSync(target)) writeFileSync(target, buf);

  return `/uploads/${filename}`;
}

/**
 * Accepts a value that may be a data URI, an already-stored upload path, or a
 * remote https URL (the seeded menu photos). Rejects everything else, which
 * blocks `javascript:` and other script-bearing schemes from reaching the page.
 */
export function storeOrValidateUrl(input: unknown, opts: StoreOptions = {}): string {
  const value = String(input ?? "").trim();
  if (!value) throw new MediaError("An image is required.");

  if (isStoredMediaUrl(value)) return value;
  if (value.startsWith("data:")) return storeDataUrl(value, opts);

  if (/^https:\/\//i.test(value)) {
    if (value.length > 500) throw new MediaError("That image address is too long.");
    return value;
  }

  throw new MediaError("Upload an image file, or paste an https:// image address.");
}
