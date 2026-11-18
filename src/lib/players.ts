import type { DatabaseSync } from "node:sqlite";
import { mustGetTeam } from "./league";
import { POSITIONS, type DisciplineStat, type Player, type PlayerStat, type Position } from "./types";
import { LeagueError, type Row, isBlank, optionalNumber, requiredText, tx } from "./validate";

function toPlayer(r: Row): Player {
  return {
    id: Number(r.id),
    teamId: Number(r.team_id),
    name: String(r.name),
    number: r.number == null ? null : Number(r.number),
    position: r.position == null ? null : (String(r.position) as Position),
  };
}

export function listPlayers(db: DatabaseSync, teamId: number): Player[] {
  return db
    .prepare("SELECT * FROM players WHERE team_id = ? ORDER BY number IS NULL, number, name")
    .all(teamId)
    .map(toPlayer);
}

export function countPlayersByTeam(db: DatabaseSync, seasonId: number): Map<number, number> {
  const rows = db
    .prepare(
      `SELECT t.id, COUNT(p.id) AS n FROM teams t LEFT JOIN players p ON p.team_id = t.id
       WHERE t.season_id = ? GROUP BY t.id`,
    )
    .all(seasonId);
  return new Map(rows.map((r) => [Number(r.id), Number(r.n)]));
}

function parsePosition(v: unknown): Position | null {
  if (isBlank(v)) return null;
  const p = String(v).trim().toUpperCase();
  if (!POSITIONS.includes(p as Position)) throw new LeagueError(`Position must be one of ${POSITIONS.join(", ")}.`);
  return p as Position;
}

function assertNumberFree(db: DatabaseSync, teamId: number, number: number | null, exceptId = 0) {
  if (number == null) return;
  const taken = db
    .prepare("SELECT name FROM players WHERE team_id = ? AND number = ? AND id != ?")
    .get(teamId, number, exceptId);
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
export function addPlayers(db: DatabaseSync, teamId: number, lines: string[]): Player[] {
  mustGetTeam(db, teamId);
  const parsed = lines.map((l) => l.trim()).filter(Boolean).map(parsePlayerLine);
  if (!parsed.length) throw new LeagueError("Enter at least one player.");
  const insert = db.prepare("INSERT INTO players (team_id, name, number, position) VALUES (?, ?, ?, ?)");
  tx(db, () => {
    for (const p of parsed) {
      assertNumberFree(db, teamId, p.number);
      insert.run(teamId, p.name, p.number, p.position);
    }
  });
  return listPlayers(db, teamId);
}

export function updatePlayer(
  db: DatabaseSync,
  playerId: number,
  input: { name: unknown; number: unknown; position: unknown },
): void {
  const existing = db.prepare("SELECT team_id FROM players WHERE id = ?").get(playerId);
  if (!existing) throw new LeagueError("Player not found.");
  const name = requiredText(input.name, "Player name", 60);
  const number = optionalNumber(input.number, "Shirt number", 99);
  const position = parsePosition(input.position);
  assertNumberFree(db, Number(existing.team_id), number, playerId);
  db.prepare("UPDATE players SET name = ?, number = ?, position = ? WHERE id = ?").run(name, number, position, playerId);
}

export function deletePlayer(db: DatabaseSync, playerId: number): void {
  const used = db
    .prepare("SELECT COUNT(*) AS n FROM match_events WHERE player_id = ? OR assist_player_id = ?")
    .get(playerId, playerId) as Row;
  if (Number(used.n) > 0) {
    throw new LeagueError(
      "This player has goals, assists or cards recorded. Remove those match events first, so the stats stay correct.",
    );
  }
  db.prepare("DELETE FROM players WHERE id = ?").run(playerId);
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

/** Top scorers (own goals not counted). */
export function topScorers(db: DatabaseSync, seasonId: number, limit = 20): PlayerStat[] {
  return db
    .prepare(
      `SELECT p.id AS player_id, p.name, p.number, t.id AS team_id, t.name AS team_name, COUNT(*) AS n
       ${STAT_FROM.replace("__PLAYER__", "e.player_id")} AND e.type = 'goal'
       GROUP BY p.id ORDER BY n DESC, p.name LIMIT ?`,
    )
    .all(seasonId, limit)
    .map(toStat);
}

export function topAssists(db: DatabaseSync, seasonId: number, limit = 20): PlayerStat[] {
  return db
    .prepare(
      `SELECT p.id AS player_id, p.name, p.number, t.id AS team_id, t.name AS team_name, COUNT(*) AS n
       ${STAT_FROM.replace("__PLAYER__", "e.assist_player_id")} AND e.type = 'goal'
       GROUP BY p.id ORDER BY n DESC, p.name LIMIT ?`,
    )
    .all(seasonId, limit)
    .map(toStat);
}

/** Players with at least one card, most red cards first. */
export function discipline(db: DatabaseSync, seasonId: number, limit = 50): DisciplineStat[] {
  return db
    .prepare(
      `SELECT p.id AS player_id, p.name, p.number, t.id AS team_id, t.name AS team_name,
              SUM(e.type = 'red') AS red, SUM(e.type = 'yellow') AS yellow
       ${STAT_FROM.replace("__PLAYER__", "e.player_id")} AND e.type IN ('red', 'yellow')
       GROUP BY p.id ORDER BY red DESC, yellow DESC, p.name LIMIT ?`,
    )
    .all(seasonId, limit)
    .map((r) => {
      const { playerId, name, number, teamId, teamName } = toStat({ ...r, n: 0 });
      return { playerId, name, number, teamId, teamName, red: Number(r.red), yellow: Number(r.yellow) };
    });
}

export type SquadRow = Player & { goals: number; assists: number; yellow: number; red: number };

/** A team's squad with each player's season totals. */
export function squadWithStats(db: DatabaseSync, teamId: number): SquadRow[] {
  const rows = db
    .prepare(
      `SELECT p.*,
         (SELECT COUNT(*) FROM match_events e WHERE e.player_id = p.id AND e.type = 'goal') AS goals,
         (SELECT COUNT(*) FROM match_events e WHERE e.assist_player_id = p.id AND e.type = 'goal') AS assists,
         (SELECT COUNT(*) FROM match_events e WHERE e.player_id = p.id AND e.type = 'yellow') AS yellow,
         (SELECT COUNT(*) FROM match_events e WHERE e.player_id = p.id AND e.type = 'red') AS red
       FROM players p WHERE p.team_id = ?
       ORDER BY p.number IS NULL, p.number, p.name`,
    )
    .all(teamId);
  return rows.map((r) => ({
    ...toPlayer(r),
    goals: Number(r.goals),
    assists: Number(r.assists),
    yellow: Number(r.yellow),
    red: Number(r.red),
  }));
}
