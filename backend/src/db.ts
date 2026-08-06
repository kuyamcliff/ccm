import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, type PoolClient, types } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not set.");
}

// COUNT(*) and other bigint results (OID 20) come back from pg as strings by
// default, to avoid precision loss above Number.MAX_SAFE_INTEGER. Every
// `{ c: number }`-style count in this codebase assumes a real number (it's
// compared, multiplied, serialised as JSON), and no count here ever
// approaches that ceiling, so parse it as a number like the SQLite driver did.
types.setTypeParser(20, (val: string) => parseInt(val, 10));
// Same issue for NUMERIC/DECIMAL (OID 1700) — AVG() returns this type, and
// nothing in this codebase carries more precision than a plain float.
types.setTypeParser(1700, (val: string) => parseFloat(val));

export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  // This Supabase project is shared with an unrelated app living in `public`.
  // camchop's tables live in their own `camchop` schema (see the
  // move_camchop_to_dedicated_schema migration) so every unqualified table
  // name in this codebase's ~190 queries resolves there instead of colliding
  // with the other app's tables of the same name.
  options: "-c search_path=camchop,public",
});

/** The value types columns accept from this codebase. */
export type SqlValue = string | number | null;

/**
 * Which tables actually have an `id` column, so `RETURNING id` is only ever
 * appended where there is one to return.
 *
 * This was a hand-written list of the exceptions, and the trouble with writing
 * down the exceptions is that the next one does not get written down. It
 * missed `admin_permissions`, whose key is (user_id, scope), so every attempt
 * by the owner to restrict an admin's access failed with `column "id" does not
 * exist` for as long as the feature has existed. Asking the database is the
 * only version of this that cannot go stale.
 *
 * The seed below is what the shim assumes until `loadIdColumns()` has answered,
 * which covers the inserts that migrations themselves make on the way up.
 */
const NON_ID_PK_TABLES = new Set(["site_settings", "legal_pages", "admin_permissions"]);

/** Populated at boot. Empty means "not asked yet", not "no tables have an id". */
let tablesWithId: Set<string> | null = null;

/**
 * Learns which tables have an `id` column. Called once after migrations, so a
 * table added in this deploy is classified correctly on the same boot.
 *
 * A failure here is not fatal: the shim falls back to the seeded list, which is
 * exactly how it behaved before this existed.
 */
export async function loadIdColumns(): Promise<void> {
  try {
    /* `to_regclass` on the bare name resolves it through the search path
       exactly as the INSERT will, so a table of the same name in `public`
       (this database hosts an unrelated app there) cannot answer for
       camchop's. Only the relation that actually wins is considered. */
    const res = await pool.query<{ relname: string }>(
      `SELECT c.relname FROM pg_class c
       JOIN pg_attribute a
         ON a.attrelid = c.oid AND a.attname = 'id' AND a.attnum > 0 AND NOT a.attisdropped
       WHERE c.relkind = 'r'
         AND c.oid = to_regclass(quote_ident(c.relname))`
    );
    tablesWithId = new Set(res.rows.map((r) => r.relname));
  } catch (err) {
    console.error("[db] could not read which tables have an id column:", err);
  }
}

/** Whether an INSERT into this table can be asked to return an id. */
function tableHasId(table: string): boolean {
  return tablesWithId ? tablesWithId.has(table) : !NON_ID_PK_TABLES.has(table);
}

/**
 * Rewrites SQLite-style `?` placeholders (in source order, ignoring `?` inside
 * single-quoted string literals) into Postgres's `$1, $2, ...` form. Kept as a
 * translation layer, rather than rewriting every call site's SQL, because the
 * 25 files that build queries do so dynamically (appending `?` as optional
 * filters are added) and reordering everything to native $N placeholders by
 * hand across ~190 call sites was the far riskier change.
 */
function toPositional(sql: string): string {
  let out = "";
  let inQuote = false;
  let n = 0;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'") { inQuote = !inQuote; out += c; continue; }
    if (c === "?" && !inQuote) { n++; out += `$${n}`; continue; }
    out += c;
  }
  return out;
}

function tableFromInsert(sql: string): string | null {
  const m = /insert\s+into\s+["`]?(\w+)["`]?/i.exec(sql);
  return m ? m[1] : null;
}

const als = new AsyncLocalStorage<{ client: PoolClient }>();

async function run(sql: string, params: SqlValue[]) {
  const client = als.getStore()?.client;
  const text = toPositional(sql);
  return client ? client.query(text, params) : pool.query(text, params);
}

interface Stmt {
  get(...params: SqlValue[]): Promise<Record<string, unknown> | undefined>;
  all(...params: SqlValue[]): Promise<Record<string, unknown>[]>;
  run(...params: SqlValue[]): Promise<{ changes: number; lastInsertRowid?: number }>;
}

function prepare(sql: string): Stmt {
  return {
    async get(...params) {
      const res = await run(sql, params);
      return res.rows[0];
    },
    async all(...params) {
      const res = await run(sql, params);
      return res.rows;
    },
    async run(...params) {
      let text = sql;
      const isInsert = /^\s*insert\s+into/i.test(sql);
      const table = isInsert ? tableFromInsert(sql) : null;
      const wantsId = isInsert && table && tableHasId(table) && !/returning/i.test(sql);
      if (wantsId) text += " RETURNING id";
      const res = await run(text, params);
      return {
        changes: res.rowCount ?? 0,
        lastInsertRowid: wantsId ? (res.rows[0]?.id as number | undefined) : undefined,
      };
    },
  };
}

async function exec(sql: string): Promise<void> {
  if (/^\s*vacuum/i.test(sql)) return; // Postgres autovacuums; nothing to do.
  await run(sql, []);
}

export const db = { prepare, exec };

/**
 * Applies a partial update by primary key.
 *
 * `table` and the keys of `fields` are always literals chosen in our own code —
 * never request input — so they are safe to interpolate. Values stay bound.
 */
export async function applyUpdate(table: string, fields: Record<string, SqlValue>, id: number): Promise<boolean> {
  const keys = Object.keys(fields);
  if (keys.length === 0) return false;
  const sets = keys.map((k) => `${k} = ?`).join(", ");
  const info = await prepare(`UPDATE ${table} SET ${sets} WHERE id = ?`).run(...keys.map((k) => fields[k]), id);
  return info.changes > 0;
}

/**
 * Runs `fn` inside a transaction on a single checked-out connection and rolls
 * back if it throws. Every `db.prepare(...)` call made (directly or through
 * anything `fn` calls) while this is in flight is routed to that same
 * connection via AsyncLocalStorage, so callers don't need to thread a `client`
 * argument through — the same shape the SQLite version's callers relied on.
 *
 * Not reentrant — never call it from inside another transaction.
 */
export async function transaction<T>(fn: () => Promise<T> | T): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await als.run({ client }, fn);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* connection already broken */ }
    throw err;
  } finally {
    client.release();
  }
}
