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
      /* Not an error, and not a dead end either: `promoteIfDeveloper` below
         catches the account the moment it is created, so nobody has to wait for
         a restart that may not come for hours on a service that sleeps. */
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

/**
 * The same promotion, at the moment an account appears.
 *
 * `bootstrapDeveloper` only runs at boot, and the ordinary sequence is the other
 * way round: set the variable, deploy, *then* go and register the account. That
 * left the new account an ordinary guest until something restarted the service,
 * which on a plan that sleeps is whenever it happens to sleep.
 *
 * This grants nothing extra. The email still has to be the one in the
 * environment, so the only way to become a developer is still to control the
 * deployment. It only removes the wait.
 *
 * Deliberately quiet on failure: somebody's registration must not fail because
 * a promotion did not, and the boot path will catch it next time either way.
 */
export async function promoteIfDeveloper(email: string): Promise<boolean> {
  const wanted = DEVELOPER_EMAIL.trim().toLowerCase();
  if (!wanted || wanted !== email.trim().toLowerCase()) return false;

  try {
    const info = await db
      .prepare("UPDATE users SET role = 'developer' WHERE lower(email) = ? AND deleted_at IS NULL AND role <> 'developer'")
      .run(wanted);
    if (info.changes > 0) console.log(`[developer] promoted ${wanted} on sign up`);
    return info.changes > 0;
  } catch (err) {
    console.error("[developer] promotion on sign up failed", err);
    return false;
  }
}
