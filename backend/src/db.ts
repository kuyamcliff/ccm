import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, type PoolClient, types } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set.");

types.setTypeParser(20, (val: string) => parseInt(val, 10));
types.setTypeParser(1700, (val: string) => parseFloat(val));

const sslRejectUnauthorized = process.env.NODE_ENV === "production";
const sslCa = process.env.DATABASE_SSL_CA?.trim() || undefined;

export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: sslCa ? { rejectUnauthorized: sslRejectUnauthorized, ca: sslCa } : { rejectUnauthorized: sslRejectUnauthorized },
  options: "-c search_path=camchop,public",
});

export type SqlValue = string | number | null;
const NON_ID_PK_TABLES = new Set(["site_settings", "legal_pages", "admin_permissions"]);
let tablesWithId: Set<string> | null = null;

export async function loadIdColumns(): Promise<void> {
  try {
    const res = await pool.query<{ relname: string }>(
      `SELECT c.relname FROM pg_class c
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'id' AND a.attnum > 0 AND NOT a.attisdropped
       WHERE c.relkind = 'r' AND c.oid = to_regclass(quote_ident(c.relname))`
    );
    tablesWithId = new Set(res.rows.map((r) => r.relname));
  } catch (err) {
    console.error("[db] could not read which tables have an id column:", err);
  }
}
function tableHasId(table: string): boolean { return tablesWithId ? tablesWithId.has(table) : !NON_ID_PK_TABLES.has(table); }
function toPositional(sql: string): string { let out = ""; let inQuote = false; let n = 0; for (let i = 0; i < sql.length; i++) { const c = sql[i]; if (c === "'") { inQuote = !inQuote; out += c; continue; } if (c === "?" && !inQuote) { n++; out += `$${n}`; continue; } out += c; } return out; }
function tableFromInsert(sql: string): string | null { const m = /insert\s+into\s+["`]?([\w]+)["`]?/i.exec(sql); return m ? m[1] : null; }
const als = new AsyncLocalStorage<{ client: PoolClient }>();
async function run(sql: string, params: SqlValue[]) { const client = als.getStore()?.client; const text = toPositional(sql); return client ? client.query(text, params) : pool.query(text, params); }
interface Stmt { get(...params: SqlValue[]): Promise<Record<string, unknown> | undefined>; all(...params: SqlValue[]): Promise<Record<string, unknown>[]>; run(...params: SqlValue[]): Promise<{ changes: number; lastInsertRowid?: number }>; }
function prepare(sql: string): Stmt {
  return {
    async get(...params) { const res = await run(sql, params); return res.rows[0]; },
    async all(...params) { const res = await run(sql, params); return res.rows; },
    async run(...params) { let text = sql; const isInsert = /^\s*insert\s+into/i.test(sql); const table = isInsert ? tableFromInsert(sql) : null; const wantsId = isInsert && table && tableHasId(table) && !/returning/i.test(sql); if (wantsId) text += " RETURNING id"; const res = await run(text, params); return { changes: res.rowCount ?? 0, lastInsertRowid: wantsId ? (res.rows[0]?.id as number | undefined) : undefined }; },
  };
}
async function exec(sql: string): Promise<void> { if (/^\s*vacuum/i.test(sql)) return; await run(sql, []); }
export const db = { prepare, exec };
export async function applyUpdate(table: string, fields: Record<string, SqlValue>, id: number): Promise<boolean> { const keys = Object.keys(fields); if (keys.length === 0) return false; const sets = keys.map((k) => `${k} = ?`).join(", "); const info = await prepare(`UPDATE ${table} SET ${sets} WHERE id = ?`).run(...keys.map((k) => fields[k]), id); return info.changes > 0; }
export async function transaction<T>(fn: () => Promise<T> | T): Promise<T> { const client = await pool.connect(); try { await client.query("BEGIN"); const result = await als.run({ client }, fn); await client.query("COMMIT"); return result; } catch (err) { try { await client.query("ROLLBACK"); } catch {} throw err; } finally { client.release(); } }
