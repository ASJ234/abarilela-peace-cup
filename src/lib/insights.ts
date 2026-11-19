import type { Db } from "./sql";
import { getTeam, listSeasons } from "./league";
import { getTables, listMatches } from "./matches";
import type { Match, Season, StandingRow } from "./types";

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

export async function seasonNumbers(db: Db, seasonId: number): Promise<SeasonNumbers> {
  // One round trip for every number.
  const r = await db.get(
    `SELECT
       (SELECT COUNT(*) FROM teams WHERE season_id = $1) AS teams,
       (SELECT COUNT(*) FROM players p JOIN teams t ON t.id = p.team_id WHERE t.season_id = $1) AS players,
       (SELECT COUNT(*) FROM matches WHERE season_id = $1) AS matches,
       (SELECT COUNT(*) FROM matches WHERE season_id = $1 AND home_score IS NOT NULL) AS played,
       (SELECT COALESCE(SUM(home_score + away_score), 0) FROM matches WHERE season_id = $1 AND home_score IS NOT NULL) AS goals,
       (SELECT COUNT(*) FROM match_events e JOIN matches m ON m.id = e.match_id WHERE m.season_id = $1 AND e.type = 'yellow') AS yellow,
       (SELECT COUNT(*) FROM match_events e JOIN matches m ON m.id = e.match_id WHERE m.season_id = $1 AND e.type = 'red') AS red`,
    [seasonId],
  );
  const n = (k: string) => Number(r?.[k] ?? 0);
  const played = n("played");
  const goals = n("goals");
  return {
    teams: n("teams"),
    players: n("players"),
    matches: n("matches"),
    played,
    goals,
    goalsPerMatch: played ? Math.round((goals / played) * 10) / 10 : 0,
    yellow: n("yellow"),
    red: n("red"),
  };
}

/** Per-season counts for season lists (switcher, official panel, competitions), in one query. */
export type SeasonCounts = { teams: number; groups: number; matches: number; played: number };

export async function seasonCounts(db: Db): Promise<Map<number, SeasonCounts>> {
  const rows = await db.all(
    `SELECT s.id,
       (SELECT COUNT(*) FROM teams t WHERE t.season_id = s.id) AS teams,
       (SELECT COUNT(*) FROM league_groups g WHERE g.season_id = s.id) AS groups,
       (SELECT COUNT(*) FROM matches m WHERE m.season_id = s.id) AS matches,
       (SELECT COUNT(*) FROM matches m WHERE m.season_id = s.id AND m.home_score IS NOT NULL) AS played
     FROM seasons s`,
  );
  return new Map(rows.map((r) => [
    Number(r.id),
    { teams: Number(r.teams), groups: Number(r.groups), matches: Number(r.matches), played: Number(r.played) },
  ]));
}

const NO_COUNTS: SeasonCounts = { teams: 0, groups: 0, matches: 0, played: 0 };
export const countsFor = (counts: Map<number, SeasonCounts>, seasonId: number) => counts.get(seasonId) ?? NO_COUNTS;

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
export async function fairPlay(db: Db, seasonId: number): Promise<FairPlayRow[]> {
  const raw = await db.all(
    `SELECT t.id, t.name,
       (SELECT COUNT(*) FROM match_events e WHERE e.team_id = t.id AND e.type = 'yellow') AS yellow,
       (SELECT COUNT(*) FROM match_events e WHERE e.team_id = t.id AND e.type = 'red') AS red,
       (SELECT COUNT(*) FROM matches m WHERE (m.home_team_id = t.id OR m.away_team_id = t.id) AND m.home_score IS NOT NULL) AS played
     FROM teams t WHERE t.season_id = ?`,
    [seasonId],
  );
  const rows = raw
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

export async function teamSnapshot(db: Db, teamId: number, season: Season): Promise<TeamSnapshot | null> {
  const team = await getTeam(db, teamId);
  if (!team || team.seasonId !== season.id) return null;
  const [tables, ms] = await Promise.all([getTables(db, season), listMatches(db, season.id, { teamId })]);
  const table = tables.find((t) => t.rows.some((r) => r.teamId === teamId));
  return {
    team: { id: team.id, name: team.name, seasonId: team.seasonId },
    season,
    row: table?.rows.find((r) => r.teamId === teamId) ?? null,
    tableName: table?.group?.name ?? null,
    next: upcoming(ms, 1)[0] ?? null,
    last: latestResults(ms, 1)[0] ?? null,
  };
}

// ---------------------------------------------------------------------------
// Which season the home page features
// ---------------------------------------------------------------------------

export type FeaturedReason = "pinned" | "next-match" | "latest-result" | "newest";
export type Featured = { season: Season; reason: FeaturedReason };

/**
 * The season shown on the home page:
 * 1. the season the admin pinned, if any;
 * 2. otherwise the season whose next (not yet kicked-off) match is soonest,
 *    so a running season isn't replaced by a newly created, empty one;
 * 3. otherwise the season with the most recent result (e.g. just finished);
 * 4. otherwise the newest season.
 */
export async function featuredSeason(db: Db, now: Date = new Date()): Promise<Featured | null> {
  const seasons = await listSeasons(db); // newest first
  if (seasons.length === 0) return null;

  const pinned = seasons.find((s) => s.pinned);
  if (pinned) return { season: pinned, reason: "pinned" };

  const t = localNow(now);
  const next = await db.get(
    `SELECT season_id, MIN(date || ' ' || COALESCE(kickoff, '00:00')) AS at
       FROM matches
      WHERE home_score IS NULL AND date IS NOT NULL
        AND (date > ? OR (date = ? AND (kickoff IS NULL OR kickoff > ?)))
      GROUP BY season_id
      ORDER BY at, season_id DESC
      LIMIT 1`,
    [t.date, t.date, t.time],
  );
  if (next) return { season: seasons.find((s) => s.id === Number(next.season_id))!, reason: "next-match" };

  // NULLS LAST: Postgres puts NULLs first when sorting DESC (SQLite put them last).
  const last = await db.get(
    `SELECT season_id FROM matches
      WHERE home_score IS NOT NULL
      ORDER BY date IS NULL, date DESC, kickoff DESC NULLS LAST, id DESC
      LIMIT 1`,
  );
  if (last) return { season: seasons.find((s) => s.id === Number(last.season_id))!, reason: "latest-result" };

  return { season: seasons[0], reason: "newest" };
}
