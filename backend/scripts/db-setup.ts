/**
 * Creates or updates the database structure.
 *
 *   npm run db:setup
 *
 * Applies `sql/schema.sql`, which is idempotent, and then the incremental
 * steps in `lib/migrate-schema.ts`. Safe to run against an empty database or
 * an existing one; running it twice changes nothing the second time.
 *
 * This is deliberately a separate command rather than something the server
 * does while booting. Schema changes are a deploy step, not a request-path
 * concern: doing them at boot means every replica races to apply the same
 * migration, and a slow one makes the health check lie about why the service
 * is not up yet.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pool } from "../src/db.js";
import { migrateSchema } from "../src/lib/migrate-schema.js";

const here = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const sql = await readFile(join(here, "..", "sql", "schema.sql"), "utf8");

  process.stdout.write("Applying sql/schema.sql … ");
  const client = await pool.connect();
  try {
    await client.query(sql);
  } finally {
    client.release();
  }
  process.stdout.write("done\n");

  process.stdout.write("Applying incremental migrations … ");
  await migrateSchema();
  process.stdout.write("done\n");

  const { rows } = await pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM information_schema.tables WHERE table_schema = 'camchop'"
  );
  process.stdout.write(`Database ready: ${rows[0]?.count ?? "?"} tables.\n`);
  await pool.end();
}

main().catch((err: unknown) => {
  console.error("Database setup failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
  void pool.end();
});
