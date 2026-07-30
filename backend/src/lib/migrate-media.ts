import { db } from "../db.js";
import { MediaError, isStoredMediaUrl, storeDataUrl } from "./media.js";

/**
 * Earlier versions stored uploads as base64 data URIs inside the database.
 * This walks the affected columns once at boot, writes each blob to disk, and
 * replaces the row with a short upload path. Runs to completion and then does
 * nothing on later boots, since no `data:` rows remain.
 */

function convert(value: string, allowVideo: boolean): string | null {
  if (!value.startsWith("data:")) return null;
  try {
    return storeDataUrl(value, { allowVideo });
  } catch (err) {
    if (err instanceof MediaError) return null;
    throw err;
  }
}

export function migrateInlineMedia(): void {
  let moved = 0;

  const galleryRows = db
    .prepare("SELECT id, image_url FROM gallery_photos WHERE image_url LIKE 'data:%'")
    .all() as { id: number; image_url: string }[];
  const updateGallery = db.prepare("UPDATE gallery_photos SET image_url = ? WHERE id = ?");
  for (const row of galleryRows) {
    const path = convert(row.image_url, false);
    if (path) { updateGallery.run(path, row.id); moved++; }
  }

  const menuRows = db
    .prepare("SELECT id, image_url FROM menu_items WHERE image_url LIKE 'data:%'")
    .all() as { id: number; image_url: string }[];
  const updateMenu = db.prepare("UPDATE menu_items SET image_url = ? WHERE id = ?");
  for (const row of menuRows) {
    const path = convert(row.image_url, false);
    if (path) { updateMenu.run(path, row.id); moved++; }
  }

  const reviewRows = db
    .prepare("SELECT id, media_urls FROM reviews WHERE media_urls LIKE '%data:%'")
    .all() as { id: number; media_urls: string }[];
  const updateReview = db.prepare("UPDATE reviews SET media_urls = ? WHERE id = ?");
  for (const row of reviewRows) {
    let parsed: unknown;
    try { parsed = JSON.parse(row.media_urls); } catch { continue; }
    if (!Array.isArray(parsed)) continue;

    let changed = false;
    const next: string[] = [];
    for (const raw of parsed) {
      const value = String(raw);
      if (isStoredMediaUrl(value) || !value.startsWith("data:")) { next.push(value); continue; }
      const path = convert(value, true);
      if (path) { next.push(path); changed = true; moved++; }
      else changed = true; // drop anything that will not decode
    }
    if (changed) updateReview.run(JSON.stringify(next), row.id);
  }

  if (moved > 0) {
    console.log(`[media] Moved ${moved} inline upload(s) out of the database onto disk.`);
    try { db.exec("VACUUM"); } catch { /* reclaiming space is best-effort */ }
  }
}
