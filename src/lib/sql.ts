/**
 * A small async database interface shared by the app (node-postgres → Supabase)
 * and the tests (PGlite, Postgres in memory). Queries use `?` placeholders,
 * which are turned into Postgres' `$1, $2, …` here.
 */

export type Row = Record<string, unknown>;

export interface Db {
  /** All rows. */
  all(sql: string, params?: unknown[]): Promise<Row[]>;
  /** The first row, or undefined. */
  get(sql: string, params?: unknown[]): Promise<Row | undefined>;
  /** Runs a statement and returns how many rows it changed. */
  run(sql: string, params?: unknown[]): Promise<number>;
  /** Runs several statements with no parameters (used by migrations). */
  exec(sql: string): Promise<void>;
  /**
   * Runs `fn` in a transaction: everything commits together, or nothing does if it throws.
   * Inside, use the `db` passed to `fn`. Calling `tx` again inside joins the same transaction.
   */
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
}

/** The minimal "run one query" shape both drivers can provide. */
export type QueryFn = (text: string, values: unknown[]) => Promise<{ rows: Row[]; count: number }>;

const converted = new Map<string, string>();

/** "a = ? AND b = ?" -> "a = $1 AND b = $2", leaving `?` inside '…' string literals alone. */
export function toPositional(sql: string): string {
  const hit = converted.get(sql);
  if (hit) return hit;
  let out = "";
  let n = 0;
  let inString = false;
  for (const ch of sql) {
    if (ch === "'") inString = !inString;
    out += ch === "?" && !inString ? `$${++n}` : ch;
  }
  converted.set(sql, out);
  return out;
}

/** Builds a Db from a query function. `tx` decides how a transaction is opened. */
export function makeDb(query: QueryFn, exec: (sql: string) => Promise<void>, tx: Db["tx"]): Db {
  const q = (sql: string, params: unknown[] = []) => query(toPositional(sql), params);
  return {
    all: async (sql, params) => (await q(sql, params)).rows,
    get: async (sql, params) => (await q(sql, params)).rows[0],
    run: async (sql, params) => (await q(sql, params)).count,
    exec,
    tx,
  };
}

/** A Db that is already inside a transaction: nested `tx` calls just reuse it. */
export function inTransaction(query: QueryFn, exec: (sql: string) => Promise<void>): Db {
  const db: Db = makeDb(query, exec, (fn) => fn(db));
  return db;
}
