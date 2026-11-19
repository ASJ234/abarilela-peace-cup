import type { Db } from "./sql";

/**
 * The database schema lives in supabase/migrations/*.sql. You run those files
 * yourself in the Supabase SQL Editor, in name order; the app never changes the
 * schema (or reads those files). The tests load them with test/migrations.ts.
 */

/** Tables in the order data must be inserted (parents before children). */
export const TABLES = [
  "seasons", "league_groups", "teams", "playing_dates", "matches", "players", "match_events", "users", "sessions",
] as const;

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
