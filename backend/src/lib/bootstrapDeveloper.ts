import { db } from "../db.js";
import { DEVELOPER_EMAIL } from "../config.js";

/**
 * Promoting the developer account, from the environment only.
 *
 * ── Why this is not a button ───────────────────────────────────────────────
 *
 * `developer` is the one role that can read the database, rewrite the config
 * blob and sign in as another account. If the console could grant it, then
 * anybody who reached the console could grant it to themselves, and every other
 * check in this codebase would be decoration.
 *
 * So the only way in is an environment variable, which means the only way in is
 * access to the deployment. That is the same door the code itself comes through,
 * which is the point: it grants nothing that was not already implied.
 *
 * ── Why it does not demote ─────────────────────────────────────────────────
 *
 * Unsetting the variable leaves the existing developer alone. Automatically
 * demoting on an empty value would mean a deploy with a mistyped environment
 * silently removes somebody's access, and the first anybody would know is when a
 * screen 403s. Removing a developer is a deliberate act, done in the database.
 */
export async function bootstrapDeveloper(): Promise<void> {
  const email = DEVELOPER_EMAIL.trim().toLowerCase();
  if (!email) return;

  try {
    const row = (await db
      .prepare("SELECT id, role FROM users WHERE lower(email) = ? AND deleted_at IS NULL")
      .get(email)) as { id: number; role: string } | undefined;

    if (!row) {
      /* Not an error. The account is usually created after the first deploy, and
         this runs on every boot, so it will catch up on the next restart. */
      console.log(`[developer] no account for ${email} yet; nothing promoted`);
      return;
    }

    if (row.role === "developer") return;

    await db.prepare("UPDATE users SET role = 'developer' WHERE id = ?").run(row.id);
    console.log(`[developer] promoted ${email}`);
  } catch (err) {
    /* Never stop the server booting over this. A missing developer is a screen
       somebody cannot open; a server that will not start is the whole site. */
    console.error("[developer] promotion failed", err);
  }
}
