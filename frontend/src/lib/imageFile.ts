/**
 * Turning a chosen file into something the API accepts.
 *
 * Uploads travel as base64 data URIs, which the server decodes, sniffs and
 * writes to disk under a content hash. Base64 inflates by about a third, so the
 * ceiling here is deliberately below the server's 12 MB body limit.
 */

export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export const IMAGE_ACCEPT = ACCEPTED.join(",");

export class ImageError extends Error {}

export function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!ACCEPTED.includes(file.type)) {
      reject(new ImageError("Use a JPG, PNG or WebP photo."));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      reject(new ImageError(`That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB. Keep it under 6 MB.`));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new ImageError("That file could not be read."));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new ImageError("That file could not be read."));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(file);
  });
}
