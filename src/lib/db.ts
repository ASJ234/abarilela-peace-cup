import "server-only";
import pg from "pg";
import { poolConfig, poolDb } from "./pg";
import { assertSchema } from "./schema";
import type { Db } from "./sql";

/**
 * One shared connection pool to Postgres (Supabase), cached on globalThis so
 * dev-mode hot reloads don't open new connections each time. Before the first
 * query, it checks once that the tables exist (you create them by running
 * supabase/migrations/*.sql in the Supabase SQL Editor).
 */
const g = globalThis as unknown as { __leagueDb?: { db: Db; ready: Promise<void> | null } };

function shared() {
  if (!g.__leagueDb) g.__leagueDb = { db: poolDb(new pg.Pool(poolConfig())), ready: null };
  const s = g.__leagueDb;
  // If the check fails (e.g. the database is unreachable or not set up), the next request tries again.
  s.ready ??= assertSchema(s.db).catch((err) => { s.ready = null; console.error(String(err)); throw err; });
  return s;
}

/** Waits for the schema check, then runs the query. */
const checked: Db = {
  all: async (sql, params) => { const s = shared(); await s.ready; return s.db.all(sql, params); },
  get: async (sql, params) => { const s = shared(); await s.ready; return s.db.get(sql, params); },
  run: async (sql, params) => { const s = shared(); await s.ready; return s.db.run(sql, params); },
  exec: async (sql) => { const s = shared(); await s.ready; return s.db.exec(sql); },
  tx: async (fn) => { const s = shared(); await s.ready; return s.db.tx(fn); },
};

export function getDb(): Db {
  return checked;
}
