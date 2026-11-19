import type { Db } from "./sql";
import { getTables, listMatches } from "./matches";
import { mustGetSeason } from "./league";
import type { Match, Season } from "./types";
import { LeagueError, optionalDate, optionalText, optionalTime } from "./validate";

/**
 * Knockout rounds: the first round drawn from the group (or league) tables, then
 * each later round from the winners of the one before.
 *
 * First-round pairings follow the usual cross-over bracket (as at the World Cup and
 * the Euros): groups are paired A–B, C–D…, and within each pair the teams are seeded
 * A1, B1, A2, B2…, then placed 1 v last, so a group winner meets the other group's
 * lowest qualifier. Teams from the same group never meet in the first round, and
 * each group's winner and runner-up start in opposite halves of the bracket:
 *
 * - 2 groups, top 2:  A1 v B2, B1 v A2 (semi-finals)
 * - 2 groups, top 4:  A1 v B4, B2 v A3 | B1 v A4, A2 v B3 (quarter-finals)
 * - 4 groups, top 2:  A1 v B2, C1 v D2 | B1 v A2, D1 v C2 (quarter-finals)
 * - one table, top 4: 1 v 4, 2 v 3 (semi-finals)
 *
 * The listed order is the bracket order: the winners of matches 1 and 2 meet next,
 * then 3 and 4, and so on.
 */

export type Seed = { teamId: number; name: string; /** e.g. "A1" (group A winner), or "3" for a single table. */ label: string };
export type Pairing = { home: Seed; away: Seed };

/** The name of a knockout round with this many matches. */
export function stageName(matches: number): string {
  if (matches === 1) return "Final";
  if (matches === 2) return "Semi-final";
  if (matches === 4) return "Quarter-final";
  return `Round of ${matches * 2}`;
}

const isPowerOfTwo = (n: number) => n >= 2 && (n & (n - 1)) === 0;

/** Seed numbers in bracket order: 2 → [1,2]; 4 → [1,4,2,3]; 8 → [1,8,4,5,2,7,3,6]. */
export function bracketOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

/** Pairs consecutive seeds of a bracket: [1,8,4,5] → 1 v 8, 4 v 5. */
function pairUp(seeds: Seed[]): Pairing[] {
  const order = bracketOrder(seeds.length);
  const out: Pairing[] = [];
  for (let i = 0; i < order.length; i += 2) out.push({ home: seeds[order[i] - 1], away: seeds[order[i + 1] - 1] });
  return out;
}

export type TableForDraw = { name: string | null; rows: { teamId: number; name: string }[] };

/** Why a number of qualifiers per group can't make a bracket, or null if it can. */
export function qualifyProblem(tables: TableForDraw[], perGroup: number): string | null {
  const g = tables.length;
  const total = g * perGroup;
  if (!Number.isInteger(perGroup) || perGroup < 1) return "Choose how many teams go through.";
  if (g === 0) return "There are no tables yet.";
  if (g > 1 && g % 2 === 1) {
    return `With ${g} groups the groups can't be paired up. Knockouts can be drawn with 1, 2, 4 or 8 groups.`;
  }
  if (!isPowerOfTwo(total)) {
    return `${total} teams can't make a knockout bracket. The number going through must be 2, 4, 8, 16 or 32.`;
  }
  const short = tables.find((t) => t.rows.length < perGroup);
  if (short) return `${short.name ?? "The table"} has only ${short.rows.length} team${short.rows.length === 1 ? "" : "s"}.`;
  return null;
}

/** First-round pairings from the final tables (see the comment at the top of this file). */
export function firstRoundPairings(tables: TableForDraw[], perGroup: number): Pairing[] {
  const problem = qualifyProblem(tables, perGroup);
  if (problem) throw new LeagueError(problem);

  // "Group A" → "A1"; a group with a longer name, e.g. "North" → "North 1".
  const letter = (t: TableForDraw, i: number) => {
    const l = t.name ? t.name.replace(/^group\s+/i, "") : String.fromCharCode(65 + i);
    return l.length > 1 ? `${l} ` : l;
  };
  const seed = (t: TableForDraw, gi: number, pos: number): Seed => ({
    teamId: t.rows[pos].teamId,
    name: t.rows[pos].name,
    label: tables.length === 1 ? String(pos + 1) : `${letter(t, gi)}${pos + 1}`,
  });

  if (tables.length === 1) return pairUp(tables[0].rows.slice(0, perGroup).map((_, i) => seed(tables[0], 0, i)));

  // Each pair of groups is its own small bracket, seeded A1, B1, A2, B2…
  const brackets: Pairing[][] = [];
  for (let gi = 0; gi < tables.length; gi += 2) {
    const seeds: Seed[] = [];
    for (let pos = 0; pos < perGroup; pos++) seeds.push(seed(tables[gi], gi, pos), seed(tables[gi + 1], gi + 1, pos));
    brackets.push(pairUp(seeds));
  }
  if (perGroup === 1) return brackets.flat();
  // Top halves of every pair's bracket first, then the bottom halves, so group winners
  // are spread across both halves of the whole draw.
  const half = brackets[0].length / 2;
  return [...brackets.flatMap((b) => b.slice(0, half)), ...brackets.flatMap((b) => b.slice(half))];
}

/** The team that went through: higher score, or the shoot-out winner. Null if not decided. */
export function winnerOf(m: Match): { id: number; name: string } | null {
  if (!m.played) return null;
  if (m.homeScore! !== m.awayScore!) return m.homeScore! > m.awayScore! ? m.home : m.away;
  if (m.homePens == null || m.awayPens == null) return null;
  return m.homePens > m.awayPens ? m.home : m.away;
}

export function loserOf(m: Match): { id: number; name: string } | null {
  const w = winnerOf(m);
  return w == null ? null : w.id === m.home.id ? m.away : m.home;
}

// ---------------------------------------------------------------------------
// Planning and creating rounds
// ---------------------------------------------------------------------------

export type KnockoutPlan =
  | { kind: "first"; options: { perGroup: number; stage: string; pairings: Pairing[] }[]; blocked: string | null; groups: number }
  | { kind: "next"; stage: string; from: string; pairings: Pairing[]; blocked: string | null; thirdPlace: Pairing | null }
  | { kind: "done"; final: Match };

/** Matches created by the knockout generator, by round (most matches first). */
function generatedRounds(matches: Match[]): Match[][] {
  const byStage = new Map<string, Match[]>();
  for (const m of matches) {
    if (m.bracketSlot == null || m.stage == null) continue;
    byStage.set(m.stage, [...(byStage.get(m.stage) ?? []), m]);
  }
  return [...byStage.values()]
    .map((ms) => ms.sort((a, b) => a.bracketSlot! - b.bracketSlot!))
    .sort((a, b) => b.length - a.length);
}

/**
 * What the officials can do next: draw the first knockout round from the tables
 * (with a choice of how many go through), draw the next round from the winners,
 * or nothing (the final has been drawn).
 */
export async function planKnockout(db: Db, season: Season): Promise<KnockoutPlan> {
  const matches = await listMatches(db, season.id);
  const rounds = generatedRounds(matches);

  if (rounds.length === 0) {
    const tables = (await getTables(db, season)).map((t) => ({ name: t.group?.name ?? null, rows: t.rows }));
    const options = [1, 2, 4, 8, 16]
      .filter((k) => !(tables.length === 1 && k === 1) && qualifyProblem(tables, k) == null)
      .map((k) => {
        const pairings = firstRoundPairings(tables, k);
        return { perGroup: k, stage: stageName(pairings.length), pairings };
      });
    const groupMatches = matches.filter((m) => m.stage == null);
    const unplayed = groupMatches.filter((m) => !m.played).length;
    const phase = season.format === "groups" ? "group" : "league";
    const blocked =
      groupMatches.length === 0 ? `Generate and play the ${phase} matches first.`
      : unplayed > 0 ? `${unplayed} ${phase} match${unplayed === 1 ? " hasn't" : "es haven't"} been played yet. The draw uses the final tables.`
      : options.length === 0 ? (qualifyProblem(tables, 2) ?? "These tables can't make a knockout bracket.")
      : null;
    return { kind: "first", options, blocked, groups: tables.length };
  }

  const current = rounds[rounds.length - 1];
  if (current.length === 1) return { kind: "done", final: current[0] };

  const waiting = current.filter((m) => !m.played).length;
  const level = current.find((m) => m.played && winnerOf(m) == null);
  const blocked =
    waiting > 0 ? `${waiting} ${current[0].stage} match${waiting === 1 ? " hasn't" : "es haven't"} been played yet.`
    : level ? `${level.home.name} v ${level.away.name} ended level. Enter the penalty shoot-out score on the Matches tab.`
    : null;
  const seed = (m: Match, team: { id: number; name: string } | null, what: string): Seed =>
    team ? { teamId: team.id, name: team.name, label: `${what} ${m.bracketSlot}` } : { teamId: 0, name: "To be decided", label: `${what} ${m.bracketSlot}` };

  const pairings: Pairing[] = [];
  for (let i = 0; i < current.length; i += 2) {
    pairings.push({ home: seed(current[i], winnerOf(current[i]), "Winner"), away: seed(current[i + 1], winnerOf(current[i + 1]), "Winner") });
  }
  const thirdPlace = current.length === 2
    ? { home: seed(current[0], loserOf(current[0]), "Loser"), away: seed(current[1], loserOf(current[1]), "Loser") }
    : null;
  return { kind: "next", stage: stageName(current.length / 2), from: current[0].stage!, pairings, blocked, thirdPlace };
}

export type RoundDetails = { date?: unknown; kickoff?: unknown; venue?: unknown };

async function insertRound(db: Db, seasonId: number, stage: string, pairings: Pairing[], details: RoundDetails, slots: boolean) {
  const date = optionalDate(details.date);
  const kickoff = optionalTime(details.kickoff);
  const venue = optionalText(details.venue, "Venue", 80);
  await db.tx(async (t) => {
    for (const [i, p] of pairings.entries()) {
      await t.run(
        `INSERT INTO matches (season_id, round, date, kickoff, venue, stage, home_team_id, away_team_id, bracket_slot)
         VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?)`,
        [seasonId, date, kickoff, venue, stage, p.home.teamId, p.away.teamId, slots ? i + 1 : null],
      );
    }
  });
}

/** Creates the first knockout round from the final tables. Returns the round's name and size. */
export async function createFirstRound(db: Db, seasonId: number, perGroup: number, details: RoundDetails = {}) {
  const season = await mustGetSeason(db, seasonId);
  const plan = await planKnockout(db, season);
  if (plan.kind !== "first") throw new LeagueError("The knockout draw has already been made. Create the next round instead.");
  if (plan.blocked) throw new LeagueError(plan.blocked);
  const option = plan.options.find((o) => o.perGroup === perGroup);
  if (!option) throw new LeagueError("That number of teams can't go through. Choose another.");
  await insertRound(db, seasonId, option.stage, option.pairings, details, true);
  return { stage: option.stage, matches: option.pairings.length };
}

/** Creates the next knockout round from the winners (and, before the final, an optional third-place match). */
export async function createNextRound(db: Db, seasonId: number, details: RoundDetails & { thirdPlace?: boolean } = {}) {
  const season = await mustGetSeason(db, seasonId);
  const plan = await planKnockout(db, season);
  if (plan.kind === "first") throw new LeagueError("Draw the first knockout round first.");
  if (plan.kind === "done") throw new LeagueError("The final has already been drawn.");
  if (plan.blocked) throw new LeagueError(plan.blocked);
  await insertRound(db, seasonId, plan.stage, plan.pairings, details, true);
  if (details.thirdPlace && plan.thirdPlace) await insertRound(db, seasonId, "Third place", [plan.thirdPlace], details, false);
  return { stage: plan.stage, matches: plan.pairings.length, thirdPlace: Boolean(details.thirdPlace && plan.thirdPlace) };
}

// ---------------------------------------------------------------------------
// Champions
// ---------------------------------------------------------------------------

export type Champions = {
  /** League format: the team top of the table once every league match is played. */
  league: { id: number; name: string } | null;
  /** The winner of the knockout final (the main prize in a group-stage season, optional play-offs in a league). */
  cup: { id: number; name: string } | null;
};

/**
 * Who has won. In a league the team top of the final table wins the league; knockout
 * play-offs are optional extras. In a group-stage season the knockout final decides it.
 */
export async function seasonChampions(db: Db, season: Season): Promise<Champions> {
  const matches = await listMatches(db, season.id);
  let leagueWinner: Champions["league"] = null;
  if (season.format === "league") {
    const leagueMatches = matches.filter((m) => m.stage == null);
    if (leagueMatches.length > 0 && leagueMatches.every((m) => m.played)) {
      const top = (await getTables(db, season))[0]?.rows[0];
      if (top) leagueWinner = { id: top.teamId, name: top.name };
    }
  }
  const final = matches.find((m) => m.bracketSlot != null && m.stage === "Final");
  return { league: leagueWinner, cup: final ? winnerOf(final) : null };
}
