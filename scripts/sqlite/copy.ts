import type { DatabaseSync } from "node:sqlite";
import { TABLES } from "../../src/lib/schema";
import type { Db } from "../../src/lib/sql";
import { migrate as migrateSqlite } from "./legacy-schema";

export type CopyResult = Record<(typeof TABLES)[number], number>;

/**
 * Copies every row from the old SQLite database into Postgres, keeping ids
 * (so links, favourite teams and sign-ins keep working) and password hashes.
 * The Postgres tables must already exist (run supabase/migrations) and be empty: this never
 * overwrites or merges with existing data. Everything is copied in one
 * transaction, so a failure leaves Postgres as it was.
 */
export async function copySqliteToPostgres(sqlite: DatabaseSync, db: Db): Promise<CopyResult> {
  migrateSqlite(sqlite); // bring an older league.db up to the last SQLite schema first

  return db.tx(async (t) => {
    for (const table of TABLES) {
      const r = await t.get(`SELECT COUNT(*) AS n FROM ${table}`);
      if (Number(r?.n) > 0) {
        throw new Error(
          `The Postgres database already has data (table "${table}" isn't empty). ` +
            "Copying only works into an empty database, so nothing was changed.",
        );
      }
    }

    const result = {} as CopyResult;
    for (const table of TABLES) {
      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
      result[table] = rows.length;
      if (!rows.length) continue;

      // Only columns both databases have (the SQLite file may carry leftovers from old versions).
      // Only the public schema: Supabase has its own tables with the same names (e.g. auth.sessions).
      const pgCols = new Set(
        (await t.all(
          "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ?",
          [table],
        )).map((c) => String(c.column_name)),
      );
      const cols = Object.keys(rows[0]).filter((c) => pgCols.has(c));
      const batchSize = Math.max(1, Math.floor(1000 / cols.length));
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        await t.run(
          `INSERT INTO ${table} (${cols.join(", ")}) VALUES ${batch.map(() => `(${cols.map(() => "?").join(", ")})`).join(", ")}`,
          batch.flatMap((row) => cols.map((c) => row[c] ?? null)),
        );
      }

      // New rows must get ids after the copied ones.
      if (pgCols.has("id")) {
        await t.get(
          `SELECT setval(pg_get_serial_sequence('public.${table}', 'id'), (SELECT COALESCE(MAX(id), 0) + 1 FROM ${table}), false)`,
        );
      }
    }
    return result;
  });
}
