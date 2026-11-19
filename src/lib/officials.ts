import type { Db } from "./sql";
import { type User, getUser } from "./users";
import { LeagueError } from "./validate";

/**
 * Who can manage which season. The admin manages every season. An official
 * manages only the seasons the admin has added them to.
 */

type Acting = Pick<User, "id" | "role"> | null | undefined;

export async function canManageSeason(db: Db, user: Acting, seasonId: number): Promise<boolean> {
  if (!user || !Number.isInteger(seasonId)) return false;
  if (user.role === "admin") return true;
  if (user.role !== "official") return false;
  return Boolean(await db.get("SELECT 1 FROM season_officials WHERE season_id = ? AND user_id = ?", [seasonId, user.id]));
}

/** The ids of the seasons this user manages, or "all" for the admin. */
export async function managedSeasonIds(db: Db, user: Acting): Promise<Set<number> | "all"> {
  if (user?.role === "admin") return "all";
  if (user?.role !== "official") return new Set();
  const rows = await db.all("SELECT season_id FROM season_officials WHERE user_id = ?", [user.id]);
  return new Set(rows.map((r) => Number(r.season_id)));
}

export type SeasonRecord = "season" | "group" | "team" | "player" | "match" | "event";

const SEASON_OF: Record<SeasonRecord, string> = {
  season: "SELECT id AS season_id FROM seasons WHERE id = ?",
  group: "SELECT season_id FROM league_groups WHERE id = ?",
  team: "SELECT season_id FROM teams WHERE id = ?",
  player: "SELECT t.season_id FROM players p JOIN teams t ON t.id = p.team_id WHERE p.id = ?",
  match: "SELECT season_id FROM matches WHERE id = ?",
  event: "SELECT m.season_id FROM match_events e JOIN matches m ON m.id = e.match_id WHERE e.id = ?",
};

/** The season a group, team, player, match or event belongs to (null if it doesn't exist). */
export async function seasonOf(db: Db, kind: SeasonRecord, id: number): Promise<number | null> {
  if (!Number.isInteger(id)) return null;
  const r = await db.get(SEASON_OF[kind], [id]);
  return r ? Number(r.season_id) : null;
}

/** The officials added to a season, by name. */
export async function listSeasonOfficials(db: Db, seasonId: number): Promise<Pick<User, "id" | "username" | "name">[]> {
  const rows = await db.all(
    `SELECT u.id, u.username, u.name FROM season_officials so JOIN users u ON u.id = so.user_id
     WHERE so.season_id = ? ORDER BY u.name`,
    [seasonId],
  );
  return rows.map((r) => ({ id: Number(r.id), username: String(r.username), name: String(r.name) }));
}

/** Each official's seasons, for the Users page: user id → season names. */
export async function seasonsByOfficial(db: Db): Promise<Map<number, string[]>> {
  const rows = await db.all(
    "SELECT so.user_id, s.name FROM season_officials so JOIN seasons s ON s.id = so.season_id ORDER BY s.id DESC",
  );
  const map = new Map<number, string[]>();
  for (const r of rows) {
    const id = Number(r.user_id);
    map.set(id, [...(map.get(id) ?? []), String(r.name)]);
  }
  return map;
}

function assertAdmin(acting: Acting) {
  if (acting?.role !== "admin") throw new LeagueError("Only the admin can choose a season's officials.");
}

/** Admin only: lets an official manage this season. */
export async function addSeasonOfficial(db: Db, acting: Acting, seasonId: number, userId: number): Promise<User> {
  assertAdmin(acting);
  if (!(await db.get("SELECT 1 FROM seasons WHERE id = ?", [seasonId]))) throw new LeagueError("Season not found.");
  const user = Number.isInteger(userId) ? await getUser(db, userId) : null;
  if (!user) throw new LeagueError("Choose an official.");
  if (user.role !== "official") {
    throw new LeagueError(`@${user.username} isn't an official. Make them one on Users & roles first.`);
  }
  await db.run("INSERT INTO season_officials (season_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING", [seasonId, userId]);
  return user;
}

/** Admin only: the official can no longer see or manage this season. */
export async function removeSeasonOfficial(db: Db, acting: Acting, seasonId: number, userId: number): Promise<void> {
  assertAdmin(acting);
  await db.run("DELETE FROM season_officials WHERE season_id = ? AND user_id = ?", [seasonId, userId]);
}
