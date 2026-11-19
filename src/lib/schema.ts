import fs from "node:fs";
import path from "node:path";
import type { Db } from "./sql";

/**
 * The database schema lives in supabase/migrations/*.sql. You run those files
 * yourself in the Supabase SQL Editor, in name order; the app never changes the
 * schema. The tests load the same files into an in-memory Postgres.
 */
export const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

/** Tables in the order data must be inserted (parents before children). */
export const TABLES = [
  "seasons", "league_groups", "teams", "playing_dates", "matches", "players", "match_events", "users", "sessions",
] as const;

/** The migration files, oldest first. */
export function migrationFiles(dir = MIGRATIONS_DIR): { name: string; sql: string }[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: fs.readFileSync(path.join(dir, name), "utf8") }));
}

/** Runs every migration file in order (tests and local tools only; Supabase is set up in its SQL Editor). */
export async function applyMigrations(db: Db, dir = MIGRATIONS_DIR): Promise<void> {
  for (const m of migrationFiles(dir)) await db.exec(m.sql);
}

/**
 * Checks the tables exist, so a database that hasn't been set up fails with a
 * clear message instead of "relation does not exist" on the first page.
 */
export async function assertSchema(db: Db): Promise<void> {
  const rows = await db.all(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY(string_to_array(?, ','))",
    [TABLES.join(",")],
  );
  const found = new Set(rows.map((r) => String(r.table_name)));
  const missing = TABLES.filter((t) => !found.has(t));
  if (missing.length) {
    throw new Error(
      `The database isn't set up yet (missing tables: ${missing.join(", ")}). ` +
        "In the Supabase dashboard, open the SQL Editor and run each file in supabase/migrations/, in name order.",
    );
  }
}
