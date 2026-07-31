import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";
import { MediaError, storeOrValidateUrl } from "../lib/media.js";
import { rateLimit } from "../middleware/security.js";

export const reviewsRouter = Router();

const writeLimit = rateLimit("review-write", {
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "You are posting very quickly. Wait a few minutes.",
  key: (req) => String(req.user?.id ?? "anon"),
});

type DbReview = {
  id: number; rating: number; text: string;
  created_at: string; updated_at: string;
  user_id: number; author: string;
  media_urls: string; likes: number; dislikes: number;
  admin_reply: string | null; admin_reply_at: string | null;
  verified_count: number;
};

type DbReply = {
  id: number; review_id: number; user_id: number;
  text: string; created_at: string; author: string;
};

reviewsRouter.get("/", async (req, res) => {
  const rows = (await db.prepare(`
    SELECT r.id, r.rating, r.text, r.created_at, r.updated_at, r.user_id, r.media_urls,
           r.admin_reply, r.admin_reply_at,
           u.name AS author,
           (SELECT COUNT(*) FROM review_votes v WHERE v.review_id = r.id AND v.vote = 'like') AS likes,
           (SELECT COUNT(*) FROM review_votes v WHERE v.review_id = r.id AND v.vote = 'dislike') AS dislikes,
           (SELECT COUNT(*) FROM reservations res WHERE res.user_id = r.user_id AND res.status = 'completed') AS verified_count
    FROM reviews r JOIN users u ON u.id = r.user_id
    ORDER BY r.updated_at DESC LIMIT 100
  `).all()) as DbReview[];

  const myVotes = new Map<number, string>();
  if (req.user?.id) {
    const votes = (await db.prepare(
      "SELECT review_id, vote FROM review_votes WHERE user_id = ?"
    ).all(req.user.id)) as { review_id: number; vote: string }[];
    for (const v of votes) myVotes.set(v.review_id, v.vote);
  }

  // Scoped to the reviews actually being returned, rather than every reply ever
  // written, which grew without limit as the site aged.
  const ids = rows.map((r) => r.id);
  const allReplies = ids.length
    ? ((await db
        .prepare(
          `SELECT rr.id, rr.review_id, rr.user_id, rr.text, rr.created_at, u.name AS author
           FROM review_replies rr JOIN users u ON u.id = rr.user_id
           WHERE rr.review_id IN (${ids.map(() => "?").join(",")})
           ORDER BY rr.created_at ASC`
        )
        .all(...ids)) as DbReply[])
    : [];

  const repliesByReview = new Map<number, DbReply[]>();
  for (const rp of allReplies) {
    if (!repliesByReview.has(rp.review_id)) repliesByReview.set(rp.review_id, []);
    repliesByReview.get(rp.review_id)!.push(rp);
  }

  const reviews = rows.map((r) => ({
    ...r,
    media_urls: safeJsonArray(r.media_urls),
    user_vote: myVotes.get(r.id) ?? null,
    replies: repliesByReview.get(r.id) ?? [],
    is_verified_diner: r.verified_count > 0,
  }));

  res.json({ reviews });
});

reviewsRouter.post("/", requireAuth, writeLimit, async (req, res) => {
  const rating = Number(req.body?.rating);
  const text = String(req.body?.text ?? "").trim();
  const rawMedia: unknown = req.body?.media_urls;

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    res.status(400).json({ error: "Rating must be 1 to 5." });
    return;
  }
  if (text.length < 3 || text.length > 600) {
    res.status(400).json({ error: "Write a few words (3 to 600 characters)." });
    return;
  }

  // Each attachment is decoded, type-checked and written to disk here. Storing
  // the raw string would let a `javascript:` URL reach an <img> on the page.
  const media_urls: string[] = [];
  if (Array.isArray(rawMedia)) {
    for (const raw of rawMedia.slice(0, 5)) {
      try {
        media_urls.push(storeOrValidateUrl(raw, { allowVideo: true }));
      } catch (err) {
        res.status(400).json({ error: err instanceof MediaError ? err.message : "Invalid attachment." });
        return;
      }
    }
  }

  await db.prepare(
    `INSERT INTO reviews (user_id, rating, text, media_urls) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       rating = excluded.rating, text = excluded.text,
       media_urls = excluded.media_urls, updated_at = now_text()`
  ).run(req.user!.id, rating, text, JSON.stringify(media_urls));

  const row = (await db.prepare(
    `SELECT r.id, r.rating, r.text, r.created_at, r.updated_at, r.user_id, r.media_urls, u.name AS author
     FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.user_id = ?`
  ).get(req.user!.id)) as (DbReview & { media_urls: string }) | undefined;

  if (!row) { res.status(500).json({ error: "Could not retrieve review." }); return; }
  res.status(201).json({ review: { ...row, media_urls: safeJsonArray(row.media_urls) } });
});

reviewsRouter.delete("/mine", requireAuth, async (req, res) => {
  const info = await db.prepare("DELETE FROM reviews WHERE user_id = ?").run(req.user!.id);
  if (info.changes === 0) {
    res.status(404).json({ error: "You have no review to delete." });
    return;
  }
  res.json({ ok: true });
});

reviewsRouter.post("/:id/vote", requireAuth, async (req, res) => {
  const reviewId = Number(req.params.id);
  if (!Number.isInteger(reviewId)) { res.status(400).json({ error: "Bad review id." }); return; }
  const vote = String(req.body?.vote ?? "");
  if (!["like", "dislike"].includes(vote)) {
    res.status(400).json({ error: "Vote must be 'like' or 'dislike'." });
    return;
  }
  const exists = await db.prepare("SELECT id FROM reviews WHERE id = ?").get(reviewId);
  if (!exists) { res.status(404).json({ error: "Review not found." }); return; }

  await db.prepare(
    `INSERT INTO review_votes (review_id, user_id, vote) VALUES (?, ?, ?)
     ON CONFLICT(review_id, user_id) DO UPDATE SET vote = excluded.vote`
  ).run(reviewId, req.user!.id, vote);

  res.json({ ok: true, ...(await voteCounts(reviewId)), user_vote: vote });
});

reviewsRouter.delete("/:id/vote", requireAuth, async (req, res) => {
  const reviewId = Number(req.params.id);
  if (!Number.isInteger(reviewId)) { res.status(400).json({ error: "Bad review id." }); return; }
  await db.prepare("DELETE FROM review_votes WHERE review_id = ? AND user_id = ?").run(reviewId, req.user!.id);
  res.json({ ok: true, ...(await voteCounts(reviewId)), user_vote: null });
});

reviewsRouter.post("/:id/replies", requireAuth, writeLimit, async (req, res) => {
  const reviewId = Number(req.params.id);
  if (!Number.isInteger(reviewId)) { res.status(400).json({ error: "Bad review id." }); return; }
  const text = String(req.body?.text ?? "").trim();
  if (text.length < 1 || text.length > 500) {
    res.status(400).json({ error: "Reply must be 1–500 characters." });
    return;
  }
  const exists = await db.prepare("SELECT id FROM reviews WHERE id = ?").get(reviewId);
  if (!exists) { res.status(404).json({ error: "Review not found." }); return; }

  const info = await db.prepare(
    "INSERT INTO review_replies (review_id, user_id, text) VALUES (?, ?, ?)"
  ).run(reviewId, req.user!.id, text);

  const reply = await db.prepare(
    `SELECT rr.id, rr.review_id, rr.user_id, rr.text, rr.created_at, u.name AS author
     FROM review_replies rr JOIN users u ON u.id = rr.user_id WHERE rr.id = ?`
  ).get(Number(info.lastInsertRowid));

  res.status(201).json({ reply });
});

reviewsRouter.delete("/replies/:replyId", requireAuth, async (req, res) => {
  const replyId = Number(req.params.replyId);
  if (!Number.isInteger(replyId)) { res.status(400).json({ error: "Bad reply id." }); return; }
  const reply = (await db.prepare("SELECT id, user_id FROM review_replies WHERE id = ?").get(replyId)) as { id: number; user_id: number } | undefined;
  if (!reply) { res.status(404).json({ error: "Reply not found." }); return; }

  const u = req.user!;
  if (reply.user_id !== u.id && u.role !== "admin" && u.role !== "super_admin") {
    res.status(403).json({ error: "You can only delete your own replies." });
    return;
  }
  await db.prepare("DELETE FROM review_replies WHERE id = ?").run(replyId);
  res.json({ ok: true });
});

async function voteCounts(reviewId: number) {
  return (await db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM review_votes WHERE review_id = ? AND vote = 'like') AS likes,
      (SELECT COUNT(*) FROM review_votes WHERE review_id = ? AND vote = 'dislike') AS dislikes
  `).get(reviewId, reviewId)) as { likes: number; dislikes: number };
}

function safeJsonArray(raw: string | null | undefined): string[] {
  try { const v = JSON.parse(raw ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
