import { TABLES } from "../src/lib/schema";
import type { Db, Row } from "../src/lib/sql";
import { newPg } from "../test/pglite";
import { seedDemo } from "./seed";

/** The tables the demo data goes into, parents first (users are only updated: favourite teams). */
const SEED_TABLES = TABLES.filter((t) => t !== "users" && t !== "sessions");

/** Postgres allows 65535 parameters per statement; stay well under it. */
const MAX_PARAMS = 20000;

/**
 * Seeds `target` quickly: the demo is built in an in-memory Postgres (PGlite), then copied
 * over in one transaction with a few multi-row INSERTs per table. Building it row by row on a
 * remote database takes thousands of round trips (minutes); this takes a few dozen.
 *
 * Ids are shifted past the target's existing rows (and links between rows shifted with them),
 * so it also works without `replace`. The accounts are read from `target` first, so officials
 * and fans get their seasons and favourite teams as before. If anything fails, `target` is left as it was.
 */
export async function seedFast(target: Db, { replace = false } = {}): Promise<void> {
  const mem = await newPg();

  // The target's accounts, so the seed can give officials seasons and fans a favourite team.
  const accounts = await target.all("SELECT * FROM users ORDER BY id");
  await insertRows(mem, "users", accounts.map((u) => ({ ...u, favourite_team_id: null })));

  await seedDemo(mem);

  const links = await foreignKeys(mem);
  await target.tx(async (t) => {
    if (replace) {
      // As supabase/reset_data.sql does (it can't be run here: it has its own BEGIN/COMMIT).
      // Deleting the seasons removes everything in them and clears fans' favourite teams.
      await t.run("DELETE FROM seasons");
      console.log("Deleted all seasons and their data (accounts kept).");
    }

    // New ids start after the target's: offset[table] is added to every id of that table.
    const offset: Record<string, number> = { users: 0 };
    for (const table of SEED_TABLES) {
      offset[table] = (await hasId(mem, table)) ? Number((await t.get(`SELECT COALESCE(MAX(id), 0) AS n FROM ${table}`))!.n) : 0;
    }
    const shift = (table: string, row: Row): Row => {
      const out = { ...row };
      if ("id" in out && out.id != null) out.id = Number(out.id) + offset[table];
      for (const [col, ref] of links.get(table) ?? []) if (out[col] != null) out[col] = Number(out[col]) + offset[ref];
      return out;
    };

    // Only one season can be pinned: the demo pins its own.
    if (await mem.get("SELECT 1 FROM seasons WHERE pinned = 1")) await t.run("UPDATE seasons SET pinned = 0 WHERE pinned = 1");

    for (const table of SEED_TABLES) {
      const rows = await mem.all(`SELECT * FROM ${table}${(await hasId(mem, table)) ? " ORDER BY id" : ""}`);
      await insertRows(t, table, rows.map((r) => shift(table, r)));
      if (await hasId(mem, table)) {
        await t.get(`SELECT setval(pg_get_serial_sequence('public.${table}', 'id'), (SELECT COALESCE(MAX(id), 0) + 1 FROM ${table}), false)`);
      }
    }

    // Fans' favourite teams, chosen by the seed.
    const favourites = (await mem.all("SELECT id, favourite_team_id FROM users WHERE favourite_team_id IS NOT NULL"))
      .map((u) => [Number(u.id), Number(u.favourite_team_id) + offset.teams]);
    if (favourites.length) {
      await t.run(
        `UPDATE users SET favourite_team_id = v.team FROM (VALUES ${favourites.map(() => "(?::integer, ?::integer)").join(", ")}) AS v(id, team)
         WHERE users.id = v.id`,
        favourites.flat(),
      );
    }
  });
}

const idTables = new Map<string, boolean>();
async function hasId(db: Db, table: string): Promise<boolean> {
  if (!idTables.has(table)) {
    const r = await db.get(
      "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ? AND column_name = 'id'",
      [table],
    );
    idTables.set(table, r != null);
  }
  return idTables.get(table)!;
}

/** table -> [column, referenced table] for every single-column foreign key to an id. */
async function foreignKeys(db: Db): Promise<Map<string, [string, string][]>> {
  const rows = await db.all(
    `SELECT c.conrelid::regclass::text AS tbl, a.attname AS col, c.confrelid::regclass::text AS ref
     FROM pg_constraint c
     JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1 AND c.connamespace = 'public'::regnamespace`,
  );
  const map = new Map<string, [string, string][]>();
  for (const r of rows) {
    const tbl = String(r.tbl).replace(/^public\./, "");
    map.set(tbl, [...(map.get(tbl) ?? []), [String(r.col), String(r.ref).replace(/^public\./, "")]]);
  }
  return map;
}

async function insertRows(db: Db, table: string, rows: Row[]): Promise<void> {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const batchSize = Math.max(1, Math.floor(MAX_PARAMS / cols.length));
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    await db.run(
      `INSERT INTO ${table} (${cols.join(", ")}) VALUES ${batch.map(() => `(${cols.map(() => "?").join(", ")})`).join(", ")}`,
      batch.flatMap((r) => cols.map((c) => r[c] ?? null)),
    );
  }
}
