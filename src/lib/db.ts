import "server-only";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "./schema";

/**
 * One shared SQLite connection (Node's built-in driver, no native build).
 * It is cached on globalThis so dev-mode hot reloads don't open a new handle each time.
 * Pending migrations are checked on every call (a single PRAGMA read), so a
 * long-running server picks up schema changes from new code without a restart.
 */
const g = globalThis as unknown as { __leagueDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  if (!g.__leagueDb) {
    const file = process.env.DB_FILE || path.join(process.cwd(), "data", "league.db");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const db = new DatabaseSync(file);
    db.exec("PRAGMA journal_mode = WAL");
    g.__leagueDb = db;
  }
  migrate(g.__leagueDb);
  return g.__leagueDb;
}
