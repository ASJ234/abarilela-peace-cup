/**
 * One-off move from the old SQLite file to Postgres (Supabase):
 *   npm run db:copy-sqlite
 * Reads data/league.db (or DB_FILE) and copies everything into the database at
 * DATABASE_URL (from .env.local). The target must be empty; nothing is overwritten.
 * The SQLite file is left in place, so you can keep it as a backup.
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { connect } from "../src/lib/pg";
import { assertSchema } from "../src/lib/schema";
import { copySqliteToPostgres } from "./sqlite/copy";

async function main() {
  const file = process.env.DB_FILE || path.join(process.cwd(), "data", "league.db");
  if (!fs.existsSync(file)) {
    console.error(`✗ No SQLite database at ${file}. Set DB_FILE if it lives somewhere else.`);
    process.exitCode = 1;
    return;
  }
  const sqlite = new DatabaseSync(file);
  const { db, close } = connect();
  try {
    await assertSchema(db);
    const copied = await copySqliteToPostgres(sqlite, db);
    console.log(`✓ Copied ${file} into Postgres:`);
    for (const [table, n] of Object.entries(copied)) console.log(`  ${table.padEnd(14)} ${n}`);
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  } finally {
    sqlite.close();
    await close();
  }
}

void main();
