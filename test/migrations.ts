import fs from "node:fs";
import path from "node:path";
import type { Db } from "../src/lib/sql";

/**
 * Reads supabase/migrations/*.sql for the tests. Kept out of src/ on purpose: the app never
 * reads these files (they're run in the Supabase SQL Editor), and reading files from the app
 * makes the deployment build trace the whole project.
 */
export const MIGRATIONS_DIR = path.join(import.meta.dirname, "..", "supabase", "migrations");

/** The migration files, oldest first. */
export function migrationFiles(dir = MIGRATIONS_DIR): { name: string; sql: string }[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: fs.readFileSync(path.join(dir, name), "utf8") }));
}

/** Runs every migration file in order, as pasting them into the SQL Editor would. */
export async function applyMigrations(db: Db, dir = MIGRATIONS_DIR): Promise<void> {
  for (const m of migrationFiles(dir)) await db.exec(m.sql);
}
