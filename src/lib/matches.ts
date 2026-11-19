import type { DatabaseSync } from "node:sqlite";
import { generateRoundRobin } from "./fixtures";
import { listDates, listGroups, listTeams, mustGetSeason } from "./league";
import { SchedulingError, scheduleMatches } from "./scheduler";
import { computeStandings } from "./standings";
import type { EventType, GroupTable, Match, MatchEvent, Season } from "./types";
import {
  LeagueError, type Row, isBlank, optionalDate, optionalId, optionalNumber, optionalText, optionalTime, tx, wholeNumber,
} from "./validate";

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const MATCH_SELECT = `
  SELECT m.*, h.name AS home_name, a.name AS away_name, g.name AS group_name
  FROM matches m
  JOIN teams h ON h.id = m.home_team_id
  JOIN teams a ON a.id = m.away_team_id
  LEFT JOIN league_groups g ON g.id = m.group_id`;

// Dated matches first, in date/kick-off order; undated (TBC) at the end.
const MATCH_ORDER = `ORDER BY m.date IS NULL, m.date, m.kickoff IS NULL, m.kickoff, m.round, m.id`;

function toMatch(r: Row): Match {
  const homeScore = r.home_score == null ? null : Number(r.home_score);
  const awayScore = r.away_score == null ? null : Number(r.away_score);
  return {
    id: Number(r.id),
    round: Number(r.round),
    date: r.date == null ? null : String(r.date),
    kickoff: r.kickoff == null ? null : String(r.kickoff),
    venue: r.venue == null ? null : String(r.venue),
    groupId: r.group_id == null ? null : Number(r.group_id),
    groupName: r.group_name == null ? null : String(r.group_name),
    stage: r.stage == null ? null : String(r.stage),
    home: { id: Number(r.home_team_id), name: String(r.home_name) },
    away: { id: Number(r.away_team_id), name: String(r.away_name) },
    homeScore,
    awayScore,
    played: homeScore != null && awayScore != null,
  };
}

export function listMatches(db: DatabaseSync, seasonId: number, opts: { teamId?: number } = {}): Match[] {
  if (opts.teamId != null) {
    return db
      .prepare(`${MATCH_SELECT} WHERE m.season_id = ? AND (m.home_team_id = ? OR m.away_team_id = ?) ${MATCH_ORDER}`)
      .all(seasonId, opts.teamId, opts.teamId)
      .map(toMatch);
  }
  return db.prepare(`${MATCH_SELECT} WHERE m.season_id = ? ${MATCH_ORDER}`).all(seasonId).map(toMatch);
}

export function getMatch(db: DatabaseSync, matchId: number): (Match & { seasonId: number }) | null {
  if (!Number.isInteger(matchId)) return null;
  const r = db.prepare(`${MATCH_SELECT} WHERE m.id = ?`).get(matchId);
  return r ? { ...toMatch(r), seasonId: Number(r.season_id) } : null;
}

function mustGetMatch(db: DatabaseSync, matchId: number) {
  const m = getMatch(db, matchId);
  if (!m) throw new LeagueError("Match not found.");
  return m;
}

function count(db: DatabaseSync, sql: string, ...args: number[]): number {
  return Number((db.prepare(sql).get(...args) as Row).n);
}
export const fixtureCount = (db: DatabaseSync, seasonId: number) =>
  count(db, "SELECT COUNT(*) AS n FROM matches WHERE season_id = ?", seasonId);
export const resultCount = (db: DatabaseSync, seasonId: number) =>
  count(db, "SELECT COUNT(*) AS n FROM matches WHERE season_id = ? AND home_score IS NOT NULL", seasonId);
/** League/group-phase counts (stage IS NULL): these are what fixture generation manages. */
export const leagueFixtureCount = (db: DatabaseSync, seasonId: number) =>
  count(db, "SELECT COUNT(*) AS n FROM matches WHERE season_id = ? AND stage IS NULL", seasonId);
export const leagueResultCount = (db: DatabaseSync, seasonId: number) =>
  count(db, "SELECT COUNT(*) AS n FROM matches WHERE season_id = ? AND stage IS NULL AND home_score IS NOT NULL", seasonId);

/**
 * The league table, or one table per group when the season uses groups.
 * Only league/group matches (no stage) count; knockout matches don't.
 */
export function getTables(db: DatabaseSync, season: Season): GroupTable[] {
  const teams = listTeams(db, season.id);
  const league = listMatches(db, season.id).filter((m) => m.stage == null);
  if (season.format === "league") {
    return [{ group: null, rows: computeStandings(teams, league, season.points, season) }];
  }
  return listGroups(db, season.id).map((g) => ({
    group: g,
    rows: computeStandings(
      teams.filter((t) => t.groupId === g.id),
      league.filter((m) => m.groupId === g.id),
      season.points,
      season,
    ),
  }));
}

// ---------------------------------------------------------------------------
// Fixture CRUD
// ---------------------------------------------------------------------------

export type MatchInput = {
  homeTeamId: unknown;
  awayTeamId: unknown;
  date?: unknown;
  kickoff?: unknown;
  venue?: unknown;
  stage?: unknown;
  round?: unknown;
};

/**
 * Validates a match. With no stage it is a league/group match: when the season
 * has groups, both teams must be in the same group and the match is filed under it.
 */
function parseMatch(db: DatabaseSync, seasonId: number, input: MatchInput) {
  const homeId = optionalId(input.homeTeamId);
  const awayId = optionalId(input.awayTeamId);
  if (homeId == null || awayId == null) throw new LeagueError("Choose both a home and an away team.");
  if (homeId === awayId) throw new LeagueError("A team can't play itself.");
  const teams = new Map(listTeams(db, seasonId).map((t) => [t.id, t]));
  const home = teams.get(homeId);
  const away = teams.get(awayId);
  if (!home || !away) throw new LeagueError("Both teams must belong to this season.");

  const stage = optionalText(input.stage, "Stage", 40);
  let groupId: number | null = null;
  if (stage == null && mustGetSeason(db, seasonId).format === "groups") {
    if (home.groupId == null || home.groupId !== away.groupId) {
      throw new LeagueError(
        `${home.name} and ${away.name} aren't in the same group. For a match between groups, ` +
          `enter a stage such as "Quarter-final" (stage matches don't count toward group tables).`,
      );
    }
    groupId = home.groupId;
  }

  return {
    homeId, awayId, groupId, stage,
    date: optionalDate(input.date),
    kickoff: optionalTime(input.kickoff),
    venue: optionalText(input.venue, "Venue", 80),
    round: optionalNumber(input.round, "Matchday", 500) ?? 0,
  };
}

export function createMatch(db: DatabaseSync, seasonId: number, input: MatchInput): number {
  mustGetSeason(db, seasonId);
  const m = parseMatch(db, seasonId, input);
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO matches (season_id, round, date, kickoff, venue, stage, group_id, home_team_id, away_team_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(seasonId, m.round, m.date, m.kickoff, m.venue, m.stage, m.groupId, m.homeId, m.awayId);
  return Number(lastInsertRowid);
}

export function updateMatch(db: DatabaseSync, matchId: number, input: MatchInput): void {
  const existing = mustGetMatch(db, matchId);
  const m = parseMatch(db, existing.seasonId, input);
  const teamsChanged = m.homeId !== existing.home.id || m.awayId !== existing.away.id;
  const swapped = m.homeId === existing.away.id && m.awayId === existing.home.id;
  if (teamsChanged && !swapped && listEvents(db, matchId).length > 0) {
    throw new LeagueError("This match has goals or cards recorded. Remove them before changing the teams.");
  }
  tx(db, () => {
    db.prepare(
      `UPDATE matches SET round = ?, date = ?, kickoff = ?, venue = ?, stage = ?, group_id = ?,
         home_team_id = ?, away_team_id = ? WHERE id = ?`,
    ).run(m.round, m.date, m.kickoff, m.venue, m.stage, m.groupId, m.homeId, m.awayId, matchId);
    // If home and away were swapped, swap the score too so it stays attached to the right team.
    if (swapped) {
      db.prepare("UPDATE matches SET home_score = away_score, away_score = home_score WHERE id = ?").run(matchId);
    }
  });
}

export function deleteMatch(db: DatabaseSync, matchId: number): number {
  const m = mustGetMatch(db, matchId);
  db.prepare("DELETE FROM matches WHERE id = ?").run(matchId); // events cascade
  return m.seasonId;
}

// ---------------------------------------------------------------------------
// Fixture generation
// ---------------------------------------------------------------------------

export type GenerateOptions = {
  shuffle: boolean;
  /** Maximum matches on one date; null = no limit. */
  maxPerDay?: number | null;
  /** A team plays at most one match per date (default true). */
  oncePerDay?: boolean;
  /** Kick-off times handed out in order within each day, e.g. ["14:00", "16:00"]. */
  kickoffTimes?: string[];
  random?: () => number;
};

export function parseKickoffTimes(raw: unknown): string[] {
  return String(raw ?? "")
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((t) => optionalTime(t.length === 4 ? `0${t}` : t)!);
}

/**
 * Generates every league/group match and spreads them over the playing dates.
 * - League format: one round robin over all teams, home and away.
 * - Group stage: a round robin inside each group, each pair meeting once.
 * Replaces existing league/group fixtures; stage matches (e.g. Final) are kept.
 */
export function generateFixtures(db: DatabaseSync, seasonId: number, opts: GenerateOptions): Match[] {
  const season = mustGetSeason(db, seasonId);
  const doubleRound = season.format === "league";
  if (leagueResultCount(db, seasonId) > 0) {
    throw new LeagueError(
      "Results have already been entered for league/group matches. Clear those fixtures first if you really want to start over.",
    );
  }

  const teams = listTeams(db, seasonId);
  let buckets: { groupId: number | null; label: string; teamIds: number[] }[];

  if (season.format === "groups") {
    const groups = listGroups(db, seasonId);
    if (groups.length < 2) throw new LeagueError("Create at least 2 groups first (Teams & groups tab).");
    const unassigned = teams.filter((t) => t.groupId == null);
    if (unassigned.length) {
      throw new LeagueError(`Put every team in a group first. Not in a group: ${unassigned.map((t) => t.name).join(", ")}.`);
    }
    buckets = groups.map((g) => ({
      groupId: g.id,
      label: g.name,
      teamIds: teams.filter((t) => t.groupId === g.id).map((t) => t.id),
    }));
    const tooSmall = buckets.find((b) => b.teamIds.length < 2);
    if (tooSmall) throw new LeagueError(`${tooSmall.label} needs at least 2 teams.`);
  } else {
    if (teams.length < 2) throw new LeagueError("Add at least 2 teams first.");
    buckets = [{ groupId: null, label: "League", teamIds: teams.map((t) => t.id) }];
  }

  const perGroup = buckets.map((b) =>
    generateRoundRobin(b.teamIds, { doubleRound, shuffle: opts.shuffle, random: opts.random }).map(
      (round, r) => round.map((p) => ({ ...p, groupId: b.groupId, round: r + 1 })),
    ),
  );
  // Interleave groups so matchday 1 of every group comes before matchday 2 of any.
  const ordered = [];
  const maxRounds = Math.max(...perGroup.map((g) => g.length));
  for (let r = 0; r < maxRounds; r++) for (const g of perGroup) if (g[r]) ordered.push(...g[r]);

  const dates = listDates(db, seasonId);
  if (!dates.length) throw new LeagueError("Add playing dates first.");

  let scheduled;
  try {
    scheduled = scheduleMatches(ordered, dates, {
      maxPerDay: opts.maxPerDay || null,
      oncePerDay: opts.oncePerDay ?? true,
      kickoffTimes: opts.kickoffTimes,
    });
  } catch (err) {
    if (!(err instanceof SchedulingError)) throw err;
    const tips = ["add more playing dates"];
    if (opts.maxPerDay) tips.push("allow more matches per day");
    if (opts.oncePerDay !== false) tips.push("allow teams to play more than once a day");
    throw new LeagueError(
      `${err.message} ${ordered.length} matches need to fit on ${dates.length} date${dates.length === 1 ? "" : "s"}. ` +
        `Try to ${tips.join(", or ")}.`,
    );
  }

  const insert = db.prepare(
    `INSERT INTO matches (season_id, round, date, kickoff, group_id, home_team_id, away_team_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  tx(db, () => {
    db.prepare("DELETE FROM matches WHERE season_id = ? AND stage IS NULL").run(seasonId);
    for (const s of scheduled) insert.run(seasonId, s.match.round, s.date, s.kickoff, s.match.groupId, s.match.home, s.match.away);
  });
  return listMatches(db, seasonId);
}

/** Removes all league/group fixtures (and their results and events). Stage matches are kept. */
export function clearLeagueFixtures(db: DatabaseSync, seasonId: number): void {
  db.prepare("DELETE FROM matches WHERE season_id = ? AND stage IS NULL").run(seasonId);
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** Record a score. Passing two empty values clears the result. Returns the match's season id. */
export function saveResult(db: DatabaseSync, matchId: number, home: unknown, away: unknown): number {
  const m = mustGetMatch(db, matchId);
  let hs: number | null = null;
  let as: number | null = null;
  if (isBlank(home) && isBlank(away)) {
    // clear
  } else if (isBlank(home) || isBlank(away)) {
    throw new LeagueError("Enter both scores, or leave both empty to clear the result.");
  } else {
    hs = wholeNumber(home, "Home score", 99);
    as = wholeNumber(away, "Away score", 99);
  }
  db.prepare("UPDATE matches SET home_score = ?, away_score = ? WHERE id = ?").run(hs, as, matchId);
  return m.seasonId;
}

// ---------------------------------------------------------------------------
// Match events: goals, assists, cards
// ---------------------------------------------------------------------------

export const EVENT_TYPES: EventType[] = ["goal", "own_goal", "yellow", "red"];

export function listEvents(db: DatabaseSync, matchId: number): MatchEvent[] {
  return db
    .prepare(
      `SELECT e.*, p.name AS player_name, p.number AS player_number, ap.name AS assist_name
       FROM match_events e
       JOIN players p ON p.id = e.player_id
       LEFT JOIN players ap ON ap.id = e.assist_player_id
       WHERE e.match_id = ?
       ORDER BY e.minute IS NULL, e.minute, COALESCE(e.added_minute, 0), e.id`,
    )
    .all(matchId)
    .map((r) => ({
      id: Number(r.id),
      matchId: Number(r.match_id),
      type: r.type as EventType,
      teamId: Number(r.team_id),
      player: { id: Number(r.player_id), name: String(r.player_name), number: r.player_number == null ? null : Number(r.player_number) },
      assist: r.assist_player_id == null ? null : { id: Number(r.assist_player_id), name: String(r.assist_name) },
      minute: r.minute == null ? null : Number(r.minute),
      addedMinute: r.added_minute == null ? null : Number(r.added_minute),
    }));
}

export type EventInput = { type: unknown; teamId: unknown; playerId: unknown; assistId?: unknown; minute?: unknown };

const MAX_MINUTE = 150;
const MAX_ADDED = 30;
/** Added time only follows the end of a half. */
const ADDED_TIME_FROM = [45, 90];

/**
 * Reads the minute an event happened: "37", or "90+3" / "45 + 2" for added time
 * (only after 45 or 90, where each half ends).
 * Blank means unknown. Returns the base minute and the added minutes (null if none).
 */
export function parseMinute(value: unknown): { minute: number | null; addedMinute: number | null } {
  if (isBlank(value)) return { minute: null, addedMinute: null };
  const m = /^(\d{1,3})\s*(?:\+\s*(\d{1,2}))?\s*'?$/.exec(String(value).trim());
  if (!m) throw new LeagueError("Minute must be a number like 37, or 90+3 for added time.");
  const minute = Number(m[1]);
  if (minute > MAX_MINUTE) throw new LeagueError(`Minute must be between 0 and ${MAX_MINUTE}.`);
  if (m[2] == null) return { minute, addedMinute: null };
  if (!ADDED_TIME_FROM.includes(minute)) {
    throw new LeagueError(`Added time comes after 45 or 90 minutes, e.g. 45+2 or 90+3, not ${minute}+${m[2]}.`);
  }
  const added = Number(m[2]);
  if (added < 1 || added > MAX_ADDED) throw new LeagueError(`Added time must be between 1 and ${MAX_ADDED} minutes.`);
  return { minute, addedMinute: added };
}

/**
 * Adds a goal, own goal, yellow or red card.
 * - goal: scorer (and optional assister) from `teamId`, the scoring team.
 * - own_goal: `teamId` is the team credited; the player is from the opponent.
 * - yellow/red: player from `teamId`.
 */
export function addEvent(db: DatabaseSync, matchId: number, input: EventInput): number {
  const m = mustGetMatch(db, matchId);
  const type = String(input.type) as EventType;
  if (!EVENT_TYPES.includes(type)) throw new LeagueError("Choose what happened: goal, own goal, yellow or red card.");
  const teamId = optionalId(input.teamId);
  if (teamId !== m.home.id && teamId !== m.away.id) throw new LeagueError("Choose one of the two teams in this match.");
  const opponentId = teamId === m.home.id ? m.away.id : m.home.id;

  const playerId = optionalId(input.playerId);
  if (playerId == null) throw new LeagueError("Choose a player.");
  const playerTeam = db.prepare("SELECT team_id FROM players WHERE id = ?").get(playerId);
  const expectedTeam = type === "own_goal" ? opponentId : teamId;
  if (!playerTeam || Number(playerTeam.team_id) !== expectedTeam) {
    throw new LeagueError(
      type === "own_goal" ? "For an own goal, choose a player from the team that conceded." : "That player isn't in this team's squad.",
    );
  }

  let assistId: number | null = null;
  if (type === "goal") {
    assistId = optionalId(input.assistId);
    if (assistId != null) {
      if (assistId === playerId) throw new LeagueError("A player can't assist their own goal.");
      const at = db.prepare("SELECT team_id FROM players WHERE id = ?").get(assistId);
      if (!at || Number(at.team_id) !== teamId) throw new LeagueError("The assist must come from the scoring team.");
    }
  }

  const { minute, addedMinute } = parseMinute(input.minute);
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO match_events (match_id, type, team_id, player_id, assist_player_id, minute, added_minute)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(matchId, type, teamId, playerId, assistId, minute, addedMinute);
  return Number(lastInsertRowid);
}

export function deleteEvent(db: DatabaseSync, eventId: number): void {
  db.prepare("DELETE FROM match_events WHERE id = ?").run(eventId);
}

/** Goals recorded as events per side, to compare with the entered score. */
export function goalsRecorded(events: MatchEvent[], match: Match): { home: number; away: number } {
  const goals = events.filter((e) => e.type === "goal" || e.type === "own_goal");
  return {
    home: goals.filter((e) => e.teamId === match.home.id).length,
    away: goals.filter((e) => e.teamId === match.away.id).length,
  };
}
