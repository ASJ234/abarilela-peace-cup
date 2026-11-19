/**
 * Fills the database with demo seasons that show every feature:
 *   npm run seed                 add the demo seasons (uses DATABASE_URL from .env.local)
 *   npm run seed -- --replace    first delete ALL seasons and their data (accounts are kept)
 *
 * - "Peace League 2026": a finished home-and-away league. The team top of the table is the
 *   league champion; optional play-offs were also played (a semi-final on penalties, a
 *   third-place match and a final).
 * - "Community Cup 2026": two groups, then semi-finals drawn by the knockout generator
 *   (A1 v B2, B1 v A2), one decided by a shoot-out. The final and third-place match are coming
 *   up. Pinned to the home page.
 * - "Youth Cup 2026": four groups of three, matchday 1 played and the rest to come.
 *
 * Every team has a coach and a 15-player squad; matches have venues and referees; played
 * matches have scorers (some penalties and own goals), assists, and player and coach cards.
 * Existing officials are added to the seasons, and fans get a favourite team.
 * The data is random but repeatable (a fixed seed), so runs give the same results.
 */
import fs from "node:fs";
import path from "node:path";
import * as knockout from "../src/lib/knockout";
import * as league from "../src/lib/league";
import * as matches from "../src/lib/matches";
import * as officials from "../src/lib/officials";
import * as players from "../src/lib/players";
import { assertSchema } from "../src/lib/schema";
import type { Db } from "../src/lib/sql";
import type { Format, Match } from "../src/lib/types";
import * as users from "../src/lib/users";

let db: Db;

// Repeatable randomness (mulberry32).
let state = 20261119;
function rand() {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)];
const chance = (p: number) => rand() < p;
const minute = (from = 1, to = 90) => from + Math.floor(rand() * (to - from + 1));

const FIRST = ["John", "Peter", "Sam", "David", "Ali", "Moses", "Brian", "Isaac", "Joel", "Okot", "Ivan", "Denis", "Paul", "Simon", "Kevin", "Allan", "Ronald", "Emmanuel", "Geoffrey", "Patrick"];
const LAST = ["Okello", "Mugisha", "Ouma", "Kato", "Hassan", "Opio", "Ssali", "Akena", "Wasswa", "Odongo", "Lubega", "Otim", "Mukasa", "Ojok", "Acaye", "Oryem", "Ocen", "Atim"];
const SHAPE = ["GK", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "FW", "FW", "FW", "GK", "MF", "DF", "FW"];
const REFEREES = ["James Ochieng", "Sarah Akello", "Robert Okwir", "Grace Lamaro", "Moses Obua", "Florence Adong", "Charles Opiyo"];
const VENUES = ["Abarilela Main Ground", "Abarilela Primary School", "St. Peter's Field", "Market Square Pitch", "Riverside Playing Field"];

const DAY = 24 * 60 * 60 * 1000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
/** The date `days` from today (negative = in the past). */
const fromToday = (days: number) => iso(new Date(Date.now() + days * DAY));
const weekly = (startDays: number, count: number) => Array.from({ length: count }, (_, i) => fromToday(startDays + i * 7));

async function createSeason(name: string, format: Format, teamNames: string[], highlightTop: number, relegation: number) {
  const season = await league.createSeason(db, { name, format, win: 3, draw: 1, loss: 0, highlightTop, relegation });
  await league.addTeams(db, season.id, teamNames);
  for (const t of await league.listTeams(db, season.id)) {
    await league.setTeamCoach(db, t.id, `${pick(["Coach", "Mr."])} ${pick(FIRST)} ${pick(LAST)}`);
    await players.addPlayers(db, t.id, SHAPE.map((pos, i) => `${i + 1} ${pick(FIRST)} ${pick(LAST)} ${pos}`));
  }
  return season;
}

/** Gives every match in the season a venue and a referee. */
async function setVenuesAndReferees(seasonId: number) {
  for (const m of await matches.listMatches(db, seasonId)) {
    if (m.played) continue;
    await matches.updateMatch(db, m.id, {
      homeTeamId: m.home.id, awayTeamId: m.away.id, date: m.date, kickoff: m.kickoff,
      venue: m.venue ?? pick(VENUES), referee: pick(REFEREES), stage: m.stage, round: m.round || "",
    });
  }
}

/**
 * Plays a match: a score (or the one given), then the goal events to match it, with
 * penalties, own goals, assists, and cards for players and now and then a coach.
 * A level knockout match also gets a shoot-out.
 */
async function play(m: Match, score?: [number, number]) {
  const goals = () => Math.floor(rand() * rand() * 5);
  const [hs, as] = score ?? [goals(), goals()];
  const knockoutDraw = m.stage != null && hs === as;
  const pens = knockoutDraw ? (chance(0.5) ? [5, 4] : [3, 4]) : null;
  await matches.saveResult(db, m.id, hs, as, pens ? { home: pens[0], away: pens[1] } : {});

  const squads = new Map<number, Awaited<ReturnType<typeof players.listPlayers>>>();
  for (const id of [m.home.id, m.away.id]) squads.set(id, (await players.listPlayers(db, id)).filter((p) => p.position !== "GK"));

  for (const [side, opp, n] of [[m.home.id, m.away.id, hs], [m.away.id, m.home.id, as]] as const) {
    const squad = squads.get(side)!;
    for (let g = 0; g < n; g++) {
      if (chance(0.06)) {
        // Own goal: credited to `side`, scored by a defender of the other team.
        await matches.addEvent(db, m.id, { type: "own_goal", teamId: side, playerId: pick(squads.get(opp)!).id, minute: minute() });
        continue;
      }
      const scorer = pick(squad);
      const penalty = chance(0.15);
      const assist = !penalty && chance(0.7) ? pick(squad.filter((p) => p.id !== scorer.id)) : null;
      const late = chance(0.08);
      await matches.addEvent(db, m.id, {
        type: "goal", teamId: side, playerId: scorer.id, assistId: assist?.id, penalty: penalty ? "on" : undefined,
        minute: late ? `90+${1 + Math.floor(rand() * 5)}` : minute(),
      });
    }
    if (chance(0.6)) await matches.addEvent(db, m.id, { type: "yellow", teamId: side, playerId: pick(squad).id, minute: minute() });
    if (chance(0.25)) await matches.addEvent(db, m.id, { type: "yellow", teamId: side, playerId: pick(squad).id, minute: minute(46) });
    if (chance(0.08)) await matches.addEvent(db, m.id, { type: "red", teamId: side, playerId: pick(squad).id, minute: minute(46) });
    if (chance(0.1)) await matches.addEvent(db, m.id, { type: "yellow", teamId: side, playerId: matches.COACH, minute: minute(30) });
  }
}

async function playPast(seasonId: number, filter: (m: Match) => boolean = () => true) {
  const today = fromToday(0);
  for (const m of await matches.listMatches(db, seasonId)) {
    if (!m.played && m.date && m.date < today && filter(m)) await play(m);
  }
}

const stageMatches = async (seasonId: number, stage: string) =>
  (await matches.listMatches(db, seasonId)).filter((m) => m.stage === stage);

/** Clears every season and everything in it, as supabase/reset_data.sql does. Accounts are kept. */
async function deleteAllSeasons() {
  const sql = fs.readFileSync(path.join(import.meta.dirname, "..", "supabase", "reset_data.sql"), "utf8");
  await db.exec(sql);
}

/** Adds the demo seasons to `target` (after deleting every season first when `replace`). */
export async function seedDemo(target: Db, { replace = false } = {}) {
  db = target;
  await assertSchema(db);
  if (replace) {
    await deleteAllSeasons();
    console.log("Deleted all seasons and their data (accounts kept).");
  }

  // --- League: finished, with optional play-offs ------------------------------
  const lg = await createSeason("Peace League 2026", "league", [
    "Northside FC", "Eastgate Rovers", "Southfield Stars", "Westwood City", "Central United", "Harbour Athletic",
  ], 4, 1);
  await league.setPlayingDates(db, lg.id, weekly(-84, 10)); // 10 matchdays, all in the past
  await matches.generateFixtures(db, lg.id, { shuffle: true, random: rand, kickoffTimes: ["11:00", "13:30", "16:00"] });
  await setVenuesAndReferees(lg.id);
  await playPast(lg.id);
  // Optional play-offs: top 4 → semi-finals → final and third place.
  await knockout.createFirstRound(db, lg.id, 4, { date: fromToday(-14), kickoff: "15:00", venue: "Abarilela Main Ground" });
  await setVenuesAndReferees(lg.id);
  const [lgSemi1, lgSemi2] = await stageMatches(lg.id, "Semi-final");
  await play(lgSemi1, [2, 1]);
  await play(lgSemi2, [1, 1]); // decided on penalties
  await knockout.createNextRound(db, lg.id, { date: fromToday(-7), kickoff: "16:00", venue: "Abarilela Main Ground", thirdPlace: true });
  await setVenuesAndReferees(lg.id);
  await play((await stageMatches(lg.id, "Third place"))[0], [3, 2]);
  await play((await stageMatches(lg.id, "Final"))[0], [2, 0]);

  // --- Community Cup: groups done, semis played, final coming up -------------
  const cup = await createSeason("Community Cup 2026", "groups", [
    "Abarilela United", "Riverside FC", "Hill Stars", "Market Rangers",
    "Lakeside Athletic", "Unity Boys", "Valley Warriors", "Peace Makers FC",
  ], 2, 0);
  await league.addLetteredGroups(db, cup.id, 2);
  await league.drawGroups(db, cup.id, rand);
  await league.setPlayingDates(db, cup.id, weekly(-42, 3)); // 3 matchdays, all played
  await matches.generateFixtures(db, cup.id, { shuffle: true, random: rand, kickoffTimes: ["10:00", "12:30", "15:00", "17:30"] });
  await setVenuesAndReferees(cup.id);
  await playPast(cup.id);
  await knockout.createFirstRound(db, cup.id, 2, { date: fromToday(-10), venue: "Abarilela Main Ground" });
  const [cupSemi1, cupSemi2] = await stageMatches(cup.id, "Semi-final");
  await matches.updateMatch(db, cupSemi1.id, { homeTeamId: cupSemi1.home.id, awayTeamId: cupSemi1.away.id, date: cupSemi1.date, kickoff: "13:00", venue: cupSemi1.venue, referee: "Sarah Akello", stage: "Semi-final" });
  await matches.updateMatch(db, cupSemi2.id, { homeTeamId: cupSemi2.home.id, awayTeamId: cupSemi2.away.id, date: cupSemi2.date, kickoff: "16:00", venue: cupSemi2.venue, referee: "James Ochieng", stage: "Semi-final" });
  await play((await stageMatches(cup.id, "Semi-final"))[0], [2, 2]); // goes to penalties
  await play((await stageMatches(cup.id, "Semi-final"))[1], [3, 1]);
  await knockout.createNextRound(db, cup.id, { date: fromToday(10), venue: "Abarilela Main Ground", thirdPlace: true });
  for (const [stage, kickoff, referee] of [["Final", "16:00", "Robert Okwir"], ["Third place", "13:00", "Grace Lamaro"]] as const) {
    const m = (await stageMatches(cup.id, stage))[0];
    await matches.updateMatch(db, m.id, { homeTeamId: m.home.id, awayTeamId: m.away.id, date: m.date, kickoff, venue: m.venue, referee, stage });
  }
  await league.setPinnedSeason(db, { role: "admin" }, cup.id);

  // --- Youth Cup: four groups, in progress -------------------------------------
  const youth = await createSeason("Youth Cup 2026", "groups", [
    "Abarilela U17", "Riverside Juniors", "Hill Stars Youth", "Market Colts", "Lakeside Young Stars", "Unity Cubs",
    "Valley Juniors", "Peace Makers Academy", "Northside Colts", "Eastgate Youth", "Harbour Juniors", "Central Academy",
  ], 2, 0);
  await league.addLetteredGroups(db, youth.id, 4);
  await league.drawGroups(db, youth.id, rand);
  await league.setPlayingDates(db, youth.id, weekly(-5, 3)); // matchday 1 played, 2 to come
  await matches.generateFixtures(db, youth.id, { shuffle: true, random: rand, kickoffTimes: ["09:00", "11:00", "14:00", "16:00"] });
  await setVenuesAndReferees(youth.id);
  await playPast(youth.id);

  // --- People: officials on seasons, fans with a favourite team ----------------
  const accounts = await users.listUsers(db);
  const officialAccounts = accounts.filter((u) => u.role === "official");
  const admin = { id: 0, role: "admin" as const };
  for (const [i, o] of officialAccounts.entries()) {
    const seasonsFor = officialAccounts.length === 1 ? [lg, cup, youth] : i % 2 === 0 ? [cup, youth] : [lg];
    for (const s of seasonsFor) await officials.addSeasonOfficial(db, admin, s.id, o.id);
    console.log(`Official @${o.username} manages: ${seasonsFor.map((s) => s.name).join(", ")}`);
  }
  const cupTeams = await league.listTeams(db, cup.id);
  for (const [i, f] of accounts.filter((u) => u.role === "fan").entries()) {
    const team = cupTeams[i % cupTeams.length];
    await users.updateProfile(db, f.id, { name: f.name, favouriteTeamId: team.id });
    console.log(`Fan @${f.username} follows ${team.name}`);
  }

  for (const s of [lg, cup, youth]) {
    const champs = await knockout.seasonChampions(db, s);
    console.log(
      `Seeded "${s.name}": ${(await league.listTeams(db, s.id)).length} teams, ${await matches.fixtureCount(db, s.id)} matches, ` +
        `${await matches.resultCount(db, s.id)} played` +
        `${champs.league ? `; league champions ${champs.league.name}` : ""}${champs.cup ? `; final won by ${champs.cup.name}` : ""}.`,
    );
  }
}

