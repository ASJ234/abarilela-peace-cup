import type { Db } from "./sql";
import { generateRoundRobin } from "./fixtures";
import { listDates, listGroups, listTeams, mustGetSeason } from "./league";
import { SchedulingError, scheduleMatches } from "./scheduler";
import { computeStandings } from "./standings";
import { PLAYED_MATCH_LOCKED, type EventType, type GroupTable, type Match, type MatchEvent, type Season, matchTimeline } from "./types";
import {
  LeagueError, type Row, isBlank, optionalDate, optionalId, optionalNumber, optionalText, optionalTime, wholeNumber,
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
    referee: r.referee == null ? null : String(r.referee),
    groupId: r.group_id == null ? null : Number(r.group_id),
    groupName: r.group_name == null ? null : String(r.group_name),
    stage: r.stage == null ? null : String(r.stage),
    home: { id: Number(r.home_team_id), name: String(r.home_name) },
    away: { id: Number(r.away_team_id), name: String(r.away_name) },
    homeScore,
    awayScore,
    homePens: r.home_pens == null ? null : Number(r.home_pens),
    awayPens: r.away_pens == null ? null : Number(r.away_pens),
    bracketSlot: r.bracket_slot == null ? null : Number(r.bracket_slot),
    played: homeScore != null && awayScore != null,
  };
}

export async function listMatches(db: Db, seasonId: number, opts: { teamId?: number } = {}): Promise<Match[]> {
  const rows = opts.teamId != null
    ? await db.all(
        `${MATCH_SELECT} WHERE m.season_id = ? AND (m.home_team_id = ? OR m.away_team_id = ?) ${MATCH_ORDER}`,
        [seasonId, opts.teamId, opts.teamId],
      )
    : await db.all(`${MATCH_SELECT} WHERE m.season_id = ? ${MATCH_ORDER}`, [seasonId]);
  return rows.map(toMatch);
}

export async function getMatch(db: Db, matchId: number): Promise<(Match & { seasonId: number }) | null> {
  if (!Number.isInteger(matchId)) return null;
  const r = await db.get(`${MATCH_SELECT} WHERE m.id = ?`, [matchId]);
  return r ? { ...toMatch(r), seasonId: Number(r.season_id) } : null;
}

async function mustGetMatch(db: Db, matchId: number) {
  const m = await getMatch(db, matchId);
  if (!m) throw new LeagueError("Match not found.");
  return m;
}

async function count(db: Db, sql: string, ...args: number[]): Promise<number> {
  return Number((await db.get(sql, args) as Row).n);
}
export const fixtureCount = (db: Db, seasonId: number) =>
  count(db, "SELECT COUNT(*) AS n FROM matches WHERE season_id = ?", seasonId);
export const resultCount = (db: Db, seasonId: number) =>
  count(db, "SELECT COUNT(*) AS n FROM matches WHERE season_id = ? AND home_score IS NOT NULL", seasonId);
/** League/group-phase counts (stage IS NULL): these are what fixture generation manages. */
export const leagueFixtureCount = (db: Db, seasonId: number) =>
  count(db, "SELECT COUNT(*) AS n FROM matches WHERE season_id = ? AND stage IS NULL", seasonId);
export const leagueResultCount = (db: Db, seasonId: number) =>
  count(db, "SELECT COUNT(*) AS n FROM matches WHERE season_id = ? AND stage IS NULL AND home_score IS NOT NULL", seasonId);

/**
 * The league table, or one table per group when the season uses groups.
 * Only league/group matches (no stage) count; knockout matches don't.
 */
export async function getTables(db: Db, season: Season): Promise<GroupTable[]> {
  const [teams, all, groups] = await Promise.all([
    listTeams(db, season.id),
    listMatches(db, season.id),
    season.format === "groups" ? listGroups(db, season.id) : Promise.resolve([]),
  ]);
  const league = all.filter((m) => m.stage == null);
  if (season.format === "league") {
    return [{ group: null, rows: computeStandings(teams, league, season.points, season) }];
  }
  return groups.map((g) => ({
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
  referee?: unknown;
  stage?: unknown;
  round?: unknown;
};

/**
 * Validates a match. With no stage it is a league/group match: when the season
 * has groups, both teams must be in the same group and the match is filed under it.
 */
async function parseMatch(db: Db, seasonId: number, input: MatchInput) {
  const homeId = optionalId(input.homeTeamId);
  const awayId = optionalId(input.awayTeamId);
  if (homeId == null || awayId == null) throw new LeagueError("Choose both a home and an away team.");
  if (homeId === awayId) throw new LeagueError("A team can't play itself.");
  const teams = new Map((await listTeams(db, seasonId)).map((t) => [t.id, t]));
  const home = teams.get(homeId);
  const away = teams.get(awayId);
  if (!home || !away) throw new LeagueError("Both teams must belong to this season.");

  const stage = optionalText(input.stage, "Stage", 40);
  let groupId: number | null = null;
  if (stage == null && (await mustGetSeason(db, seasonId)).format === "groups") {
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
    referee: optionalText(input.referee, "Referee", 60),
    round: optionalNumber(input.round, "Matchday", 500) ?? 0,
  };
}

export async function createMatch(db: Db, seasonId: number, input: MatchInput): Promise<number> {
  await mustGetSeason(db, seasonId);
  const m = await parseMatch(db, seasonId, input);
  const r = await db.get(
    `INSERT INTO matches (season_id, round, date, kickoff, venue, referee, stage, group_id, home_team_id, away_team_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [seasonId, m.round, m.date, m.kickoff, m.venue, m.referee, m.stage, m.groupId, m.homeId, m.awayId],
  );
  return Number(r!.id);
}

/** Edits an unplayed match. A match with a score is locked (see PLAYED_MATCH_LOCKED). */
export async function updateMatch(db: Db, matchId: number, input: MatchInput): Promise<void> {
  const existing = await mustGetMatch(db, matchId);
  if (existing.played) throw new LeagueError(PLAYED_MATCH_LOCKED);
  const m = await parseMatch(db, existing.seasonId, input);
  const teamsChanged = m.homeId !== existing.home.id || m.awayId !== existing.away.id;
  const swapped = m.homeId === existing.away.id && m.awayId === existing.home.id;
  if (teamsChanged && !swapped && (await listEvents(db, matchId)).length > 0) {
    throw new LeagueError("This match has goals or cards recorded. Remove them before changing the teams.");
  }
  await db.run(
    `UPDATE matches SET round = ?, date = ?, kickoff = ?, venue = ?, referee = ?, stage = ?, group_id = ?,
       home_team_id = ?, away_team_id = ? WHERE id = ?`,
    [m.round, m.date, m.kickoff, m.venue, m.referee, m.stage, m.groupId, m.homeId, m.awayId, matchId],
  );
}

/** Sets (or, when blank, clears) the referee. Allowed after the match too, unlike other details. */
export async function setReferee(db: Db, matchId: number, referee: unknown): Promise<void> {
  await mustGetMatch(db, matchId);
  await db.run("UPDATE matches SET referee = ? WHERE id = ?", [optionalText(referee, "Referee", 60), matchId]);
}

export async function deleteMatch(db: Db, matchId: number): Promise<number> {
  const m = await mustGetMatch(db, matchId);
  await db.run("DELETE FROM matches WHERE id = ?", [matchId]); // events cascade
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
export async function generateFixtures(db: Db, seasonId: number, opts: GenerateOptions): Promise<Match[]> {
  const season = await mustGetSeason(db, seasonId);
  const doubleRound = season.format === "league";
  if ((await leagueResultCount(db, seasonId)) > 0) {
    throw new LeagueError(
      "Results have already been entered for league/group matches. Clear those fixtures first if you really want to start over.",
    );
  }

  const teams = await listTeams(db, seasonId);
  let buckets: { groupId: number | null; label: string; teamIds: number[] }[];

  if (season.format === "groups") {
    const groups = await listGroups(db, seasonId);
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

  const dates = await listDates(db, seasonId);
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

  await db.tx(async (t) => {
    await t.run("DELETE FROM matches WHERE season_id = ? AND stage IS NULL", [seasonId]);
    // One multi-row INSERT per batch: far fewer round trips to the database than one per match.
    for (let i = 0; i < scheduled.length; i += 200) {
      const batch = scheduled.slice(i, i + 200);
      await t.run(
        `INSERT INTO matches (season_id, round, date, kickoff, group_id, home_team_id, away_team_id)
         VALUES ${batch.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ")}`,
        batch.flatMap((s) => [seasonId, s.match.round, s.date, s.kickoff, s.match.groupId, s.match.home, s.match.away]),
      );
    }
  });
  return listMatches(db, seasonId);
}

/** Removes all league/group fixtures (and their results and events). Stage matches are kept. */
export async function clearLeagueFixtures(db: Db, seasonId: number): Promise<void> {
  await db.run("DELETE FROM matches WHERE season_id = ? AND stage IS NULL", [seasonId]);
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** Record a score. Passing two empty values clears the result. Returns the match's season id. */
/**
 * Saves (or, with both scores blank, clears) a result. A knockout match (one with a
 * stage) that ends level can also have a penalty shoot-out score; the shoot-out is
 * dropped whenever the match isn't a draw.
 */
export async function saveResult(
  db: Db, matchId: number, home: unknown, away: unknown, pens: { home?: unknown; away?: unknown } = {},
): Promise<number> {
  const m = await mustGetMatch(db, matchId);
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

  let hp: number | null = null;
  let ap: number | null = null;
  const pensGiven = !isBlank(pens.home) || !isBlank(pens.away);
  if (pensGiven && hs != null && hs === as) {
    if (m.stage == null) {
      throw new LeagueError("Only a knockout match (one with a stage, such as Semi-final) can have a penalty shoot-out.");
    }
    if (isBlank(pens.home) || isBlank(pens.away)) throw new LeagueError("Enter both teams' shoot-out scores, or leave both empty.");
    hp = wholeNumber(pens.home, "Home penalties", 99);
    ap = wholeNumber(pens.away, "Away penalties", 99);
    if (hp === ap) throw new LeagueError("A penalty shoot-out can't end level. Check the shoot-out score.");
  }
  await db.run(
    "UPDATE matches SET home_score = ?, away_score = ?, home_pens = ?, away_pens = ? WHERE id = ?",
    [hs, as, hp, ap, matchId],
  );
  return m.seasonId;
}

// ---------------------------------------------------------------------------
// Match events: goals, assists, cards
// ---------------------------------------------------------------------------

export const EVENT_TYPES: EventType[] = ["goal", "own_goal", "yellow", "red"];

export async function listEvents(db: Db, matchId: number): Promise<MatchEvent[]> {
  const rows = await db.all(
    `SELECT e.*, p.name AS player_name, p.number AS player_number, ap.name AS assist_name
     FROM match_events e
     LEFT JOIN players p ON p.id = e.player_id
     LEFT JOIN players ap ON ap.id = e.assist_player_id
     WHERE e.match_id = ?
     ORDER BY e.minute IS NULL, e.minute, COALESCE(e.added_minute, 0), e.id`,
    [matchId],
  );
  return rows.map((r) => ({
      id: Number(r.id),
      matchId: Number(r.match_id),
      type: r.type as EventType,
      teamId: Number(r.team_id),
      player: r.player_id == null
        ? null
        : { id: Number(r.player_id), name: String(r.player_name), number: r.player_number == null ? null : Number(r.player_number) },
      coach: r.coach_name == null ? null : String(r.coach_name),
      assist: r.assist_player_id == null ? null : { id: Number(r.assist_player_id), name: String(r.assist_name) },
      penalty: r.penalty === true || r.penalty === 1 || r.penalty === "t",
      minute: r.minute == null ? null : Number(r.minute),
      addedMinute: r.added_minute == null ? null : Number(r.added_minute),
    }));
}

/**
 * `playerId` is a player's id, or "coach" for a card given to the team's coach (the name
 * comes from `coachName`, or else the team's saved coach). `penalty` marks a penalty goal.
 */
export type EventInput = {
  type: unknown; teamId: unknown; playerId: unknown; assistId?: unknown; minute?: unknown; penalty?: unknown; coachName?: unknown;
};

/** The value of the "player" choice that means the team's coach. */
export const COACH = "coach";

const MAX_MINUTE = 150;
const MAX_ADDED = 30;

/**
 * Reads the minute an event happened: "37", or "90+3" / "45 + 2" for added time.
 * Blank means unknown. Returns the base minute and the added minutes (null if none).
 */
export function parseMinute(value: unknown): { minute: number | null; addedMinute: number | null } {
  if (isBlank(value)) return { minute: null, addedMinute: null };
  const m = /^(\d{1,3})\s*(?:\+\s*(\d{1,2}))?\s*'?$/.exec(String(value).trim());
  if (!m) throw new LeagueError("Minute must be a number like 37, or 90+3 for added time.");
  const minute = Number(m[1]);
  if (minute > MAX_MINUTE) throw new LeagueError(`Minute must be between 0 and ${MAX_MINUTE}.`);
  if (m[2] == null) return { minute, addedMinute: null };
  const added = Number(m[2]);
  if (added < 1 || added > MAX_ADDED) throw new LeagueError(`Added time must be between 1 and ${MAX_ADDED} minutes.`);
  return { minute, addedMinute: added };
}

/**
 * Adds a goal, own goal, yellow or red card.
 * - goal: scorer (and optional assister) from `teamId`, the scoring team. A penalty has no assist.
 * - own_goal: `teamId` is the team credited; the player is from the opponent.
 * - yellow/red: a player from `teamId`, or that team's coach.
 */
export async function addEvent(db: Db, matchId: number, input: EventInput): Promise<number> {
  const m = await mustGetMatch(db, matchId);
  const type = String(input.type) as EventType;
  if (!EVENT_TYPES.includes(type)) throw new LeagueError("Choose what happened: goal, own goal, yellow or red card.");
  const teamId = optionalId(input.teamId);
  if (teamId !== m.home.id && teamId !== m.away.id) throw new LeagueError("Choose one of the two teams in this match.");
  const opponentId = teamId === m.home.id ? m.away.id : m.home.id;
  const { minute, addedMinute } = parseMinute(input.minute);
  const isCard = type === "yellow" || type === "red";

  if (String(input.playerId ?? "") === COACH) {
    if (!isCard) throw new LeagueError("Only a card can be given to a coach. Choose a player for a goal.");
    const saved = await db.get("SELECT coach FROM teams WHERE id = ?", [teamId]);
    const name = isBlank(input.coachName) ? saved?.coach : input.coachName;
    if (isBlank(name)) throw new LeagueError("Enter the coach's name.");
    const coachName = optionalText(name, "Coach's name", 60)!;
    return addCard(db, matchId, type, "coach_name = ?", coachName, async (tx, cardType) => {
      const r = await tx.get(
        `INSERT INTO match_events (match_id, type, team_id, coach_name, minute, added_minute)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
        [matchId, cardType, teamId, coachName, minute, addedMinute],
      );
      return Number(r!.id);
    }, teamId);
  }

  const playerId = optionalId(input.playerId);
  if (playerId == null) throw new LeagueError("Choose a player.");
  const playerTeam = await db.get("SELECT team_id FROM players WHERE id = ?", [playerId]);
  const expectedTeam = type === "own_goal" ? opponentId : teamId;
  if (!playerTeam || Number(playerTeam.team_id) !== expectedTeam) {
    throw new LeagueError(
      type === "own_goal" ? "For an own goal, choose a player from the team that conceded." : "That player isn't in this team's squad.",
    );
  }

  if (isCard) {
    return addCard(db, matchId, type, "player_id = ?", playerId, async (tx, cardType) => {
      const r = await tx.get(
        `INSERT INTO match_events (match_id, type, team_id, player_id, minute, added_minute)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
        [matchId, cardType, teamId, playerId, minute, addedMinute],
      );
      return Number(r!.id);
    });
  }

  const penalty = type === "goal" && (input.penalty === true || input.penalty === "on" || input.penalty === "1");
  let assistId: number | null = null;
  if (type === "goal" && !penalty) {
    assistId = optionalId(input.assistId);
    if (assistId != null) {
      if (assistId === playerId) throw new LeagueError("A player can't assist their own goal.");
      const at = await db.get("SELECT team_id FROM players WHERE id = ?", [assistId]);
      if (!at || Number(at.team_id) !== teamId) throw new LeagueError("The assist must come from the scoring team.");
    }
  }

  const r = await db.get(
    `INSERT INTO match_events (match_id, type, team_id, player_id, assist_player_id, minute, added_minute, penalty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [matchId, type, teamId, playerId, assistId, minute, addedMinute, penalty],
  );
  return Number(r!.id);
}

/**
 * Records a card for one person (picked out by `holder` = `value`, plus `teamId` for a coach).
 * Nobody can be booked after being sent off, and a second yellow also records the red card
 * it brings, at the same minute.
 */
async function addCard(
  db: Db, matchId: number, type: EventType, holder: string, value: unknown,
  insert: (tx: Db, type: EventType) => Promise<number>, teamId?: number,
): Promise<number> {
  return db.tx(async (tx) => {
    const cards = await tx.all(
      `SELECT type FROM match_events WHERE match_id = ? AND type IN ('yellow', 'red') AND ${holder}${teamId == null ? "" : " AND team_id = ?"}`,
      teamId == null ? [matchId, value] : [matchId, value, teamId],
    );
    const yellows = cards.filter((c) => c.type === "yellow").length;
    if (yellows >= 2 || cards.some((c) => c.type === "red")) {
      throw new LeagueError("They have already been sent off in this match, so no more cards can be recorded for them.");
    }
    const id = await insert(tx, type);
    if (type === "yellow" && yellows === 1) await insert(tx, "red");
    return id;
  });
}

/** Removes a goal or card. Removing a second yellow also removes the red card it brought. */
export async function deleteEvent(db: Db, eventId: number): Promise<void> {
  await db.tx(async (tx) => {
    const row = await tx.get("SELECT match_id FROM match_events WHERE id = ?", [eventId]);
    if (!row) return;
    const entry = matchTimeline(await listEvents(tx, Number(row.match_id)))
      .find((x) => x.event.id === eventId || x.red?.id === eventId);
    const ids = entry?.secondYellow && entry.red ? [entry.event.id, entry.red.id] : [eventId];
    await tx.run(`DELETE FROM match_events WHERE id IN (${ids.map(() => "?").join(", ")})`, ids);
  });
}

/** Goals recorded as events per side, to compare with the entered score. */
export function goalsRecorded(events: MatchEvent[], match: Match): { home: number; away: number } {
  const goals = events.filter((e) => e.type === "goal" || e.type === "own_goal");
  return {
    home: goals.filter((e) => e.teamId === match.home.id).length,
    away: goals.filter((e) => e.teamId === match.away.id).length,
  };
}
