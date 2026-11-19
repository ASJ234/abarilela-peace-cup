import fs from "node:fs";
import pg from "pg";
import { type Db, inTransaction, makeDb } from "./sql";

// COUNT(*) and other bigints come back as strings by default; these values are always small.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

/**
 * Connection settings from DATABASE_URL (Supabase: Project Settings → Database → Connection string).
 * SSL is always on for remote hosts. Set DATABASE_SSL_CA to the path of Supabase's CA certificate
 * (downloadable on the same page) to also verify the server's certificate.
 */
export function poolConfig(url = process.env.DATABASE_URL): pg.PoolConfig {
  if (!url) {
    throw new Error("DATABASE_URL is not set. Add your Supabase connection string to .env.local (see .env.example).");
  }
  const u = new URL(url);
  // An sslmode in the URL would override the ssl settings below, so it's handled here instead.
  for (const k of ["sslmode", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat"]) u.searchParams.delete(k);
  const local = ["localhost", "127.0.0.1", "::1"].includes(u.hostname);
  const ca = process.env.DATABASE_SSL_CA;
  return {
    connectionString: u.toString(),
    ssl: local ? false : ca ? { ca: fs.readFileSync(ca, "utf8"), rejectUnauthorized: true } : { rejectUnauthorized: false },
    max: Number(process.env.DATABASE_POOL_SIZE) || 5,
  };
}

type Queryable = Pick<pg.PoolClient, "query">;

const queryOn = (c: Queryable) => async (text: string, values: unknown[]) => {
  const r = await c.query(text, values);
  return { rows: r.rows, count: r.rowCount ?? 0 };
};
const execOn = (c: Queryable) => async (sql: string) => { await c.query(sql); };

/** Wraps a node-postgres pool as a Db. */
export function poolDb(pool: pg.Pool): Db {
  return makeDb(queryOn(pool), execOn(pool), async (fn) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const out = await fn(inTransaction(queryOn(client), execOn(client)));
      await client.query("COMMIT");
      return out;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  });
}

/** Opens a pool for scripts (seed, admin, copy). Call `close()` when done. */
export function connect(url?: string): { db: Db; close: () => Promise<void> } {
  const pool = new pg.Pool(poolConfig(url));
  return { db: poolDb(pool), close: () => pool.end() };
}
