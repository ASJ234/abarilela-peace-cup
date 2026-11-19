import type { Db } from "./sql";
import { mustGetTeam } from "./league";
import { POSITIONS, type DisciplineStat, type Player, type PlayerStat, type Position } from "./types";
import { LeagueError, type Row, isBlank, optionalNumber, requiredText } from "./validate";

function toPlayer(r: Row): Player {
  return {
    id: Number(r.id),
    teamId: Number(r.team_id),
    name: String(r.name),
    number: r.number == null ? null : Number(r.number),
    position: r.position == null ? null : (String(r.position) as Position),
  };
}

export async function listPlayers(db: Db, teamId: number): Promise<Player[]> {
  const rows = await db.all("SELECT * FROM players WHERE team_id = ? ORDER BY number IS NULL, number, name", [teamId]);
  return rows.map(toPlayer);
}

export async function countPlayersByTeam(db: Db, seasonId: number): Promise<Map<number, number>> {
  const rows = await db.all(
    `SELECT t.id, COUNT(p.id) AS n FROM teams t LEFT JOIN players p ON p.team_id = t.id
     WHERE t.season_id = ? GROUP BY t.id`,
    [seasonId],
  );
  return new Map(rows.map((r) => [Number(r.id), Number(r.n)]));
}

function parsePosition(v: unknown): Position | null {
  if (isBlank(v)) return null;
  const p = String(v).trim().toUpperCase();
  if (!POSITIONS.includes(p as Position)) throw new LeagueError(`Position must be one of ${POSITIONS.join(", ")}.`);
  return p as Position;
}

async function assertNumberFree(db: Db, teamId: number, number: number | null, exceptId = 0) {
  if (number == null) return;
  const taken = await db.get("SELECT name FROM players WHERE team_id = ? AND number = ? AND id != ?", [teamId, number, exceptId]);
  if (taken) throw new LeagueError(`Shirt number ${number} is already worn by ${taken.name}.`);
}

/**
 * Parses one squad line: "[number] name [position]", e.g.
 *   "10 John Okello FW", "Peter Mugisha", "1 Sam Ouma GK".
 */
export function parsePlayerLine(line: string): { name: string; number: number | null; position: Position | null } {
  let rest = line.trim().replace(/\s+/g, " ");
  let number: number | null = null;
  let position: Position | null = null;
  const num = /^#?(\d{1,2})[\s.)-]+(.*)$/.exec(rest);
  if (num) { number = Number(num[1]); rest = num[2]; }
  const pos = /^(.*?)[\s,-]+(GK|DF|MF|FW)$/i.exec(rest);
  if (pos) { position = pos[2].toUpperCase() as Position; rest = pos[1]; }
  return { name: requiredText(rest, "Player name", 60), number, position };
}

/** Add players from pasted lines (see parsePlayerLine). */
export async function addPlayers(db: Db, teamId: number, lines: string[]): Promise<Player[]> {
  await mustGetTeam(db, teamId);
  const parsed = lines.map((l) => l.trim()).filter(Boolean).map(parsePlayerLine);
  if (!parsed.length) throw new LeagueError("Enter at least one player.");
  await db.tx(async (t) => {
    for (const p of parsed) {
      await assertNumberFree(t, teamId, p.number); // also sees players added earlier in this list
      await t.run("INSERT INTO players (team_id, name, number, position) VALUES (?, ?, ?, ?)", [teamId, p.name, p.number, p.position]);
    }
  });
  return listPlayers(db, teamId);
}

export async function updatePlayer(
  db: Db,
  playerId: number,
  input: { name: unknown; number: unknown; position: unknown },
): Promise<void> {
  const existing = await db.get("SELECT team_id FROM players WHERE id = ?", [playerId]);
  if (!existing) throw new LeagueError("Player not found.");
  const name = requiredText(input.name, "Player name", 60);
  const number = optionalNumber(input.number, "Shirt number", 99);
  const position = parsePosition(input.position);
  await assertNumberFree(db, Number(existing.team_id), number, playerId);
  await db.run("UPDATE players SET name = ?, number = ?, position = ? WHERE id = ?", [name, number, position, playerId]);
}

export async function deletePlayer(db: Db, playerId: number): Promise<void> {
  const used = (await db.get(
    "SELECT COUNT(*) AS n FROM match_events WHERE player_id = ? OR assist_player_id = ?",
    [playerId, playerId],
  )) as Row;
  if (Number(used.n) > 0) {
    throw new LeagueError(
      "This player has goals, assists or cards recorded. Remove those match events first, so the stats stay correct.",
    );
  }
  await db.run("DELETE FROM players WHERE id = ?", [playerId]);
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

function toStat(r: Row): PlayerStat {
  return {
    playerId: Number(r.player_id),
    name: String(r.name),
    number: r.number == null ? null : Number(r.number),
    teamId: Number(r.team_id),
    teamName: String(r.team_name),
    count: Number(r.n),
  };
}

const STAT_FROM = `
  FROM match_events e
  JOIN matches m ON m.id = e.match_id
  JOIN players p ON p.id = __PLAYER__
  JOIN teams t ON t.id = p.team_id
  WHERE m.season_id = ?`;

/** Top scorers (own goals not counted), with how many of their goals were penalties. */
export async function topScorers(db: Db, seasonId: number, limit = 20): Promise<(PlayerStat & { penalties: number })[]> {
  const rows = await db.all(
    `SELECT p.id AS player_id, p.name, p.number, t.id AS team_id, t.name AS team_name, COUNT(*) AS n,
            COUNT(*) FILTER (WHERE e.penalty) AS pens
     ${STAT_FROM.replace("__PLAYER__", "e.player_id")} AND e.type = 'goal'
     GROUP BY p.id, t.id ORDER BY n DESC, p.name LIMIT ?`,
    [seasonId, limit],
  );
  return rows.map((r) => ({ ...toStat(r), penalties: Number(r.pens) }));
}

export async function topAssists(db: Db, seasonId: number, limit = 20): Promise<PlayerStat[]> {
  const rows = await db.all(
    `SELECT p.id AS player_id, p.name, p.number, t.id AS team_id, t.name AS team_name, COUNT(*) AS n
     ${STAT_FROM.replace("__PLAYER__", "e.assist_player_id")} AND e.type = 'goal'
     GROUP BY p.id, t.id ORDER BY n DESC, p.name LIMIT ?`,
    [seasonId, limit],
  );
  return rows.map(toStat);
}

/** Players with at least one card, most red cards first. */
export async function discipline(db: Db, seasonId: number, limit = 50): Promise<DisciplineStat[]> {
  const rows = await db.all(
    `SELECT p.id AS player_id, p.name, p.number, t.id AS team_id, t.name AS team_name,
            COUNT(*) FILTER (WHERE e.type = 'red') AS red, COUNT(*) FILTER (WHERE e.type = 'yellow') AS yellow
     ${STAT_FROM.replace("__PLAYER__", "e.player_id")} AND e.type IN ('red', 'yellow')
     GROUP BY p.id, t.id ORDER BY red DESC, yellow DESC, p.name LIMIT ?`,
    [seasonId, limit],
  );
  return rows.map((r) => {
    const { playerId, name, number, teamId, teamName } = toStat({ ...r, n: 0 });
    return { playerId, name, number, teamId, teamName, red: Number(r.red), yellow: Number(r.yellow) };
  });
}

/** Cards given to coaches, per coach and team. */
export async function coachCards(
  db: Db, seasonId: number,
): Promise<{ name: string; teamId: number; teamName: string; yellow: number; red: number }[]> {
  const rows = await db.all(
    `SELECT e.coach_name, t.id AS team_id, t.name AS team_name,
            COUNT(*) FILTER (WHERE e.type = 'red') AS red, COUNT(*) FILTER (WHERE e.type = 'yellow') AS yellow
     FROM match_events e
     JOIN matches m ON m.id = e.match_id
     JOIN teams t ON t.id = e.team_id
     WHERE m.season_id = ? AND e.coach_name IS NOT NULL
     GROUP BY e.coach_name, t.id ORDER BY red DESC, yellow DESC, e.coach_name`,
    [seasonId],
  );
  return rows.map((r) => ({
    name: String(r.coach_name), teamId: Number(r.team_id), teamName: String(r.team_name), yellow: Number(r.yellow), red: Number(r.red),
  }));
}

export type SquadRow = Player & { goals: number; assists: number; yellow: number; red: number };

/** A team's squad with each player's season totals. */
export async function squadWithStats(db: Db, teamId: number): Promise<SquadRow[]> {
  const rows = await db.all(
    `SELECT p.*,
       (SELECT COUNT(*) FROM match_events e WHERE e.player_id = p.id AND e.type = 'goal') AS goals,
       (SELECT COUNT(*) FROM match_events e WHERE e.assist_player_id = p.id AND e.type = 'goal') AS assists,
       (SELECT COUNT(*) FROM match_events e WHERE e.player_id = p.id AND e.type = 'yellow') AS yellow,
       (SELECT COUNT(*) FROM match_events e WHERE e.player_id = p.id AND e.type = 'red') AS red
     FROM players p WHERE p.team_id = ?
     ORDER BY p.number IS NULL, p.number, p.name`,
    [teamId],
  );
  return rows.map((r) => ({
    ...toPlayer(r),
    goals: Number(r.goals),
    assists: Number(r.assists),
    yellow: Number(r.yellow),
    red: Number(r.red),
  }));
}
