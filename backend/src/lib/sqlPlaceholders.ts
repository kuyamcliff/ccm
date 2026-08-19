/**
 * Rewrites `?` placeholders into PostgreSQL's `$1, $2, …` form.
 *
 * The whole codebase writes SQL with `?`, which is not PostgreSQL's syntax, so
 * every statement passes through here on its way to the driver. That makes this
 * one of the few functions where a subtle bug is not a crash but a silently
 * wrong query, which is why it is isolated here with tests rather than living
 * inline in the connection pool.
 *
 * It is deliberately a scanner, not a parser. It does not need to understand
 * SQL — only to know which regions of the text are *not* placeholder positions:
 *
 *   'string literals'        — including the '' escape for a quote inside one
 *   "quoted identifiers"     — a column genuinely allowed to contain punctuation
 *   $$dollar quoted$$        — and $tag$ … $tag$
 *   line comments opened by a double dash
 *   block comments, which PostgreSQL allows to nest
 *
 * Anything outside those regions is real SQL, and a `?` there is a placeholder.
 *
 * ── The escape hatch ────────────────────────────────────────────────────────
 * PostgreSQL has real operators spelled with a question mark: `?`, `?|` and
 * `?&` test for keys in jsonb. Those are indistinguishable from a placeholder
 * by position alone, so they are written `??`, `??|` and `??&` in this
 * codebase's SQL and collapse back to a single `?` here. Nothing uses them yet;
 * the escape exists so that the day something does, it has a correct way to say
 * so instead of quietly becoming `$7`.
 */

/** Thrown when the SQL cannot be scanned safely, rather than guessed at. */
export class SqlPlaceholderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SqlPlaceholderError";
  }
}

/** Reads a `$tag$` opener at `i`, returning the full tag or null. */
function dollarQuoteTag(sql: string, i: number): string | null {
  if (sql[i] !== "$") return null;
  let j = i + 1;
  while (j < sql.length && /[A-Za-z0-9_]/.test(sql[j]!)) j++;
  if (sql[j] !== "$") return null;
  return sql.slice(i, j + 1);
}

export function toPositional(sql: string): string {
  let out = "";
  let n = 0;
  let i = 0;

  while (i < sql.length) {
    const c = sql[i]!;

    // ── 'string literal', where '' is an escaped quote and not a terminator.
    if (c === "'") {
      const start = i;
      i++;
      let closed = false;
      while (i < sql.length) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") { i += 2; continue; }
          i++;
          closed = true;
          break;
        }
        i++;
      }
      if (!closed) throw new SqlPlaceholderError("Unterminated string literal in SQL.");
      out += sql.slice(start, i);
      continue;
    }

    // ── "quoted identifier", where "" is an escaped double quote.
    if (c === '"') {
      const start = i;
      i++;
      let closed = false;
      while (i < sql.length) {
        if (sql[i] === '"') {
          if (sql[i + 1] === '"') { i += 2; continue; }
          i++;
          closed = true;
          break;
        }
        i++;
      }
      if (!closed) throw new SqlPlaceholderError("Unterminated quoted identifier in SQL.");
      out += sql.slice(start, i);
      continue;
    }

    // ── $$dollar quoted$$ / $tag$ … $tag$
    const tag = dollarQuoteTag(sql, i);
    if (tag) {
      const end = sql.indexOf(tag, i + tag.length);
      if (end === -1) throw new SqlPlaceholderError(`Unterminated dollar-quoted string (${tag}) in SQL.`);
      out += sql.slice(i, end + tag.length);
      i = end + tag.length;
      continue;
    }

    // ── -- line comment
    if (c === "-" && sql[i + 1] === "-") {
      const nl = sql.indexOf("\n", i);
      const end = nl === -1 ? sql.length : nl;
      out += sql.slice(i, end);
      i = end;
      continue;
    }

    // ── /* block comment */, which PostgreSQL allows to nest.
    if (c === "/" && sql[i + 1] === "*") {
      let depth = 1;
      let j = i + 2;
      while (j < sql.length && depth > 0) {
        if (sql[j] === "/" && sql[j + 1] === "*") { depth++; j += 2; continue; }
        if (sql[j] === "*" && sql[j + 1] === "/") { depth--; j += 2; continue; }
        j++;
      }
      if (depth !== 0) throw new SqlPlaceholderError("Unterminated block comment in SQL.");
      out += sql.slice(i, j);
      i = j;
      continue;
    }

    // ── `??` is a literal question mark: the jsonb operators, escaped.
    if (c === "?" && sql[i + 1] === "?") {
      out += "?";
      i += 2;
      continue;
    }

    // ── A bare `?` in real SQL is a bind placeholder.
    if (c === "?") {
      n++;
      out += `$${n}`;
      i++;
      continue;
    }

    out += c;
    i++;
  }

  return out;
}

/** How many placeholders `toPositional` would emit. Used to check that a
    statement is given exactly as many parameters as it asks for. */
export function countPlaceholders(sql: string): number {
  const rewritten = toPositional(sql);
  let max = 0;
  for (const match of rewritten.matchAll(/\$(\d+)/g)) {
    max = Math.max(max, Number(match[1]));
  }
  return max;
}
