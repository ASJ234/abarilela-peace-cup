import { PGlite, type Transaction } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { TABLES, applyMigrations } from "../src/lib/schema";
import { type Db, type Row, inTransaction, makeDb } from "../src/lib/sql";

type Conn = Pick<PGlite | Transaction, "query" | "exec">;

const queryOn = (c: Conn) => async (text: string, values: unknown[]) => {
  const r = await c.query<Row>(text, values);
  return { rows: r.rows, count: r.affectedRows ?? 0 };
};
const execOn = (c: Conn) => async (sql: string) => { await c.exec(sql); };

/** A new Postgres database in memory (PGlite) with supabase/migrations applied. Takes about 2 seconds. */
export async function newPg(): Promise<Db> {
  const pg = await PGlite.create({ extensions: { citext } });
  const db = makeDb(queryOn(pg), execOn(pg), (fn) => pg.transaction((t) => fn(inTransaction(queryOn(t), execOn(t)))));
  await applyMigrations(db);
  return db;
}

let shared: Promise<Db> | null = null;

/**
 * An empty, migrated Postgres database for one test. Starting PGlite is slow, so
 * each test file shares one instance and every call wipes it (ids restart at 1).
 */
export async function freshPg(): Promise<Db> {
  shared ??= newPg();
  const db = await shared;
  await db.exec(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
  return db;
}
