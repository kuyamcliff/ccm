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
});

/** The value types columns accept from this codebase. */
export type SqlValue = string | number | null;

/** Tables whose primary key isn't called `id` — RETURNING id must not be auto-added for these. */
const NON_ID_PK_TABLES = new Set(["site_settings", "legal_pages"]);

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
      const wantsId = isInsert && table && !NON_ID_PK_TABLES.has(table) && !/returning/i.test(sql);
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
