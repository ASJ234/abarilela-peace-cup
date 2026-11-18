import type { DatabaseSync } from "node:sqlite";
import { getTeam } from "./league";
import { getTables, listMatches } from "./matches";
import type { Match, Season, StandingRow } from "./types";
import type { Row } from "./validate";

/** Headline numbers for a season. */
export type SeasonNumbers = {
  teams: number;
  players: number;
  matches: number;
  played: number;
  goals: number;
  goalsPerMatch: number;
  yellow: number;
  red: number;
};

export function seasonNumbers(db: DatabaseSync, seasonId: number): SeasonNumbers {
  const one = (sql: string) => Number((db.prepare(sql).get(seasonId) as Row).n ?? 0);
  const played = one("SELECT COUNT(*) AS n FROM matches WHERE season_id = ? AND home_score IS NOT NULL");
  const goals = one("SELECT COALESCE(SUM(home_score + away_score), 0) AS n FROM matches WHERE season_id = ? AND home_score IS NOT NULL");
  const cards = (type: string) =>
    one(`SELECT COUNT(*) AS n FROM match_events e JOIN matches m ON m.id = e.match_id WHERE m.season_id = ? AND e.type = '${type}'`);
  return {
    teams: one("SELECT COUNT(*) AS n FROM teams WHERE season_id = ?"),
    players: one("SELECT COUNT(*) AS n FROM players p JOIN teams t ON t.id = p.team_id WHERE t.season_id = ?"),
    matches: one("SELECT COUNT(*) AS n FROM matches WHERE season_id = ?"),
    played,
    goals,
    goalsPerMatch: played ? Math.round((goals / played) * 10) / 10 : 0,
    yellow: cards("yellow"),
    red: cards("red"),
  };
}

/** Local date and time as "YYYY-MM-DD" and "HH:MM" (server time zone). */
function localNow(now: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  };
}

/**
 * Matches that haven't kicked off yet, soonest first (undated ones last).
 * A match today whose kick-off time has passed but has no score yet is
 * "awaiting result", not upcoming.
 */
export function upcoming(matches: Match[], limit: number, now: Date = new Date()): Match[] {
  const t = localNow(now);
  return matches
    .filter((m) => !m.played && (m.date == null || m.date > t.date || (m.date === t.date && (m.kickoff == null || m.kickoff > t.time))))
    .slice(0, limit);
}

/** Most recent results first. */
export function latestResults(matches: Match[], limit: number): Match[] {
  return matches.filter((m) => m.played).reverse().slice(0, limit);
}

export type SeasonRecords = {
  biggestWin: Match | null;
  mostGoals: Match | null;
};

export function seasonRecords(matches: Match[]): SeasonRecords {
  const played = matches.filter((m) => m.played);
  const margin = (m: Match) => Math.abs(m.homeScore! - m.awayScore!);
  const total = (m: Match) => m.homeScore! + m.awayScore!;
  const best = (score: (m: Match) => number) =>
    played.reduce<Match | null>((top, m) => (top == null || score(m) > score(top) ? m : top), null);
  const biggestWin = best(margin);
  const mostGoals = best(total);
  return {
    biggestWin: biggestWin && margin(biggestWin) > 0 ? biggestWin : null,
    mostGoals: mostGoals && total(mostGoals) > 0 ? mostGoals : null,
  };
}

export type FairPlayRow = { teamId: number; name: string; yellow: number; red: number; points: number; played: number };

/**
 * Fair Play ranking: 1 point per yellow, 3 per red; fewest points wins.
 * Only teams that have played are ranked.
 */
export function fairPlay(db: DatabaseSync, seasonId: number): FairPlayRow[] {
  const rows = db
    .prepare(
      `SELECT t.id, t.name,
         (SELECT COUNT(*) FROM match_events e WHERE e.team_id = t.id AND e.type = 'yellow') AS yellow,
         (SELECT COUNT(*) FROM match_events e WHERE e.team_id = t.id AND e.type = 'red') AS red,
         (SELECT COUNT(*) FROM matches m WHERE (m.home_team_id = t.id OR m.away_team_id = t.id) AND m.home_score IS NOT NULL) AS played
       FROM teams t WHERE t.season_id = ?`,
    )
    .all(seasonId)
    .map((r) => {
      const yellow = Number(r.yellow);
      const red = Number(r.red);
      return { teamId: Number(r.id), name: String(r.name), yellow, red, points: yellow + 3 * red, played: Number(r.played) };
    })
    .filter((r) => r.played > 0);
  return rows.sort((a, b) => a.points - b.points || b.played - a.played || a.name.localeCompare(b.name));
}

/** Everything the home page needs to show a fan's favourite team. */
export type TeamSnapshot = {
  team: { id: number; name: string; seasonId: number };
  season: Season;
  row: StandingRow | null;
  tableName: string | null;
  next: Match | null;
  last: Match | null;
};

export function teamSnapshot(db: DatabaseSync, teamId: number, season: Season): TeamSnapshot | null {
  const team = getTeam(db, teamId);
  if (!team || team.seasonId !== season.id) return null;
  const table = getTables(db, season).find((t) => t.rows.some((r) => r.teamId === teamId));
  const ms = listMatches(db, season.id, { teamId });
  return {
    team: { id: team.id, name: team.name, seasonId: team.seasonId },
    season,
    row: table?.rows.find((r) => r.teamId === teamId) ?? null,
    tableName: table?.group?.name ?? null,
    next: upcoming(ms, 1)[0] ?? null,
    last: latestResults(ms, 1)[0] ?? null,
  };
}
