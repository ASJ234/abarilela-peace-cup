/**
 * Fills the database with two demo seasons so you can see both formats:
 *   npm run seed            (uses DATABASE_URL from .env.local)
 * - "Demo League": 8 teams in one table, home and away, first rounds played.
 * - "Demo Cup": 8 teams in 2 groups (each pair meets once) plus a Final.
 * Every team gets a 15-player squad; played matches get scorers, assists and cards.
 */
import * as league from "../src/lib/league";
import * as matches from "../src/lib/matches";
import { connect } from "../src/lib/pg";
import * as players from "../src/lib/players";
import { assertSchema } from "../src/lib/schema";
import type { Format } from "../src/lib/types";

const { db, close } = connect();

const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];
const FIRST = ["John", "Peter", "Sam", "David", "Ali", "Moses", "Brian", "Isaac", "Joel", "Okot", "Ivan", "Denis", "Paul", "Simon", "Kevin", "Allan"];
const LAST = ["Okello", "Mugisha", "Ouma", "Kato", "Hassan", "Opio", "Ssali", "Akena", "Wasswa", "Odongo", "Lubega", "Otim", "Mukasa", "Ojok"];
const SHAPE = ["GK", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "FW", "FW", "FW", "GK", "MF", "DF", "FW"];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const today = iso(new Date());

function weeklyFrom(weeksAgo: number, count: number) {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - weeksAgo * 7);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i * 7);
    return iso(d);
  });
}

/** Score every match dated before today, with scorers, assists and cards. */
async function playPastMatches(seasonId: number) {
  const goals = () => Math.floor(Math.random() * Math.random() * 5);
  for (const m of (await matches.listMatches(db, seasonId)).filter((x) => x.date && x.date < today)) {
    const score = { [m.home.id]: goals(), [m.away.id]: goals() };
    await matches.saveResult(db, m.id, score[m.home.id], score[m.away.id]);
    for (const side of [m.home.id, m.away.id]) {
      const squad = (await players.listPlayers(db, side)).filter((p) => p.position !== "GK");
      for (let g = 0; g < score[side]; g++) {
        const scorer = pick(squad);
        const assist = Math.random() < 0.7 ? pick(squad.filter((p) => p.id !== scorer.id)) : null;
        await matches.addEvent(db, m.id, { type: "goal", teamId: side, playerId: scorer.id, assistId: assist?.id, minute: 1 + Math.floor(Math.random() * 90) });
      }
      if (Math.random() < 0.6) await matches.addEvent(db, m.id, { type: "yellow", teamId: side, playerId: pick(squad).id, minute: 1 + Math.floor(Math.random() * 90) });
      if (Math.random() < 0.12) await matches.addEvent(db, m.id, { type: "red", teamId: side, playerId: pick(squad).id, minute: 46 + Math.floor(Math.random() * 44) });
    }
  }
}

async function createDemo(name: string, format: Format, teamNames: string[], highlightTop: number, relegation: number) {
  const season = await league.createSeason(db, { name, format, win: 3, draw: 1, loss: 0, highlightTop, relegation });
  await league.addTeams(db, season.id, teamNames);
  for (const t of await league.listTeams(db, season.id)) {
    await players.addPlayers(db, t.id, SHAPE.map((pos, i) => `${i + 1} ${pick(FIRST)} ${pick(LAST)} ${pos}`));
  }
  return season;
}

async function main() {
  await assertSchema(db);

  // --- Group-stage cup -------------------------------------------------------
  const cup = await createDemo("Demo Peace Cup (groups)", "groups", [
    "Abarilela United", "Riverside FC", "Hill Stars", "Market Rangers",
    "Lakeside Athletic", "Unity Boys", "Valley Warriors", "Peace Makers FC",
  ], 2, 0);
  await league.addLetteredGroups(db, cup.id, 2);
  await league.drawGroups(db, cup.id);
  await league.setPlayingDates(db, cup.id, weeklyFrom(2, 3)); // 3 matchdays: 2 played, 1 to come
  await matches.generateFixtures(db, cup.id, { shuffle: true, kickoffTimes: ["10:00", "12:30", "15:00", "17:30"] });
  await playPastMatches(cup.id);
  const cupTeams = await league.listTeams(db, cup.id);
  const finalDate = new Date();
  finalDate.setUTCDate(finalDate.getUTCDate() + 21);
  await matches.createMatch(db, cup.id, {
    homeTeamId: cupTeams[0].id, awayTeamId: cupTeams[1].id, stage: "Final",
    date: iso(finalDate), kickoff: "16:00", venue: "Abarilela Main Ground",
  });

  // --- Home-and-away league --------------------------------------------------
  const lg = await createDemo("Demo League (home & away)", "league", [
    "Northside FC", "Eastgate Rovers", "Southfield Stars", "Westwood City",
    "Central United", "Harbour Athletic", "Highland Eagles", "Meadow Rangers",
  ], 4, 2);
  await league.setPlayingDates(db, lg.id, weeklyFrom(5, 14)); // 14 matchdays: 5 played
  await matches.generateFixtures(db, lg.id, { shuffle: true, kickoffTimes: ["11:00", "13:00", "15:00", "17:00"] });
  await playPastMatches(lg.id);

  for (const s of [cup, lg]) {
    console.log(`Seeded "${s.name}" (id ${s.id}): ${(await league.listTeams(db, s.id)).length} teams, ${await matches.fixtureCount(db, s.id)} matches, ${await matches.resultCount(db, s.id)} played.`);
  }
}

main().finally(() => close());
