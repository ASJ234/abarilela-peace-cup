import { strict as assert } from "node:assert";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, it } from "node:test";
import { generateRoundRobin, roundsNeeded } from "../src/lib/fixtures";
import * as league from "../src/lib/league";
import * as matches from "../src/lib/matches";
import * as players from "../src/lib/players";
import { scheduleMatches, SchedulingError } from "../src/lib/scheduler";
import { splitNameList } from "../src/lib/validate";
import { migrate } from "../src/lib/schema";
import { computeStandings } from "../src/lib/standings";
import type { Match } from "../src/lib/types";

// ---------------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------------

describe("generateRoundRobin", () => {
  for (const n of [2, 3, 4, 5, 6, 7, 8, 10, 20]) {
    it(`${n} teams: everyone meets everyone, nobody plays twice in a round, home games balanced`, () => {
      const ids = Array.from({ length: n }, (_, i) => i);
      const rounds = generateRoundRobin(ids, { doubleRound: false });
      assert.equal(rounds.length, roundsNeeded(n, false));
      const pairs = new Set<string>();
      const home = new Array(n).fill(0);
      for (const round of rounds) {
        const seen = new Set<number>();
        for (const { home: h, away: a } of round) {
          assert.ok(!seen.has(h) && !seen.has(a), "team plays twice in one round");
          seen.add(h); seen.add(a);
          pairs.add([h, a].sort().join("-"));
          home[h]++;
        }
      }
      assert.equal(pairs.size, (n * (n - 1)) / 2);
      assert.ok(Math.max(...home) - Math.min(...home) <= 1, `home games unbalanced: ${home}`);
    });
  }

  it("double round robin: every ordered pairing once, second leg mirrors the first", () => {
    const rounds = generateRoundRobin([1, 2, 3, 4, 5, 6], { doubleRound: true });
    assert.equal(rounds.length, 10);
    assert.equal(new Set(rounds.flat().map((m) => `${m.home}>${m.away}`)).size, 30);
    for (const m of rounds[5]) assert.ok(rounds[0].some((x) => x.home === m.away && x.away === m.home));
  });
});

describe("scheduleMatches", () => {
  const ms = generateRoundRobin([1, 2, 3, 4], { doubleRound: false, shuffle: false }).flat(); // 6 matches, 3 rounds

  it("puts a whole matchday on each date by default", () => {
    const s = scheduleMatches(ms, ["2026-01-01", "2026-01-02", "2026-01-03"]);
    assert.deepEqual(s.map((x) => x.date), ["2026-01-01", "2026-01-01", "2026-01-02", "2026-01-02", "2026-01-03", "2026-01-03"]);
  });

  it("allows any number of matches per day when teams may play more than once", () => {
    const s = scheduleMatches(ms, ["2026-01-01"], { oncePerDay: false });
    assert.equal(s.length, 6);
    assert.ok(s.every((x) => x.date === "2026-01-01"));
  });

  it("respects a per-day cap and hands out kick-off times in order", () => {
    const s = scheduleMatches(ms, ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05", "2026-01-06"], {
      maxPerDay: 1, kickoffTimes: ["15:00"],
    });
    assert.equal(new Set(s.map((x) => x.date)).size, 6);
    assert.ok(s.every((x) => x.kickoff === "15:00"));
    const two = scheduleMatches(ms, ["2026-01-01", "2026-01-02", "2026-01-03"], { kickoffTimes: ["14:00", "16:00"] });
    assert.deepEqual(two.slice(0, 2).map((x) => x.kickoff), ["14:00", "16:00"]);
  });

  it("never schedules a team twice on one date by default", () => {
    const big = generateRoundRobin([1, 2, 3, 4, 5, 6, 7], { doubleRound: true }).flat();
    const dates = Array.from({ length: 30 }, (_, i) => `2026-02-${String(i + 1).padStart(2, "0")}`.slice(0, 10));
    const s = scheduleMatches(big, dates.filter((d) => !Number.isNaN(Date.parse(d))), { maxPerDay: 3 });
    const byDate = new Map<string, number[]>();
    for (const x of s) byDate.set(x.date, [...(byDate.get(x.date) ?? []), x.match.home, x.match.away]);
    for (const teams of byDate.values()) assert.equal(new Set(teams).size, teams.length);
  });

  it("reports how many matches didn't fit", () => {
    assert.throws(() => scheduleMatches(ms, ["2026-01-01"]), (e: unknown) => e instanceof SchedulingError && e.unscheduled === 4);
  });
});

describe("computeStandings", () => {
  const teams = [
    { id: 1, name: "Arsenal Lions" }, { id: 2, name: "Bees" }, { id: 3, name: "City Stars" },
    { id: 4, name: "Dons" }, { id: 5, name: "Eagles" },
  ];
  let id = 0;
  const m = (round: number, h: number, a: number, hs: number | null, as: number | null): Match => ({
    id: ++id, round, date: `2026-01-${String(round).padStart(2, "0")}`, kickoff: null, venue: null,
    groupId: null, groupName: null, stage: null,
    home: teams[h - 1], away: teams[a - 1], homeScore: hs, awayScore: as, played: hs != null,
  });
  const points = { win: 3, draw: 1, loss: 0 };

  it("awards 3/1/0 and counts goals, ignoring unplayed matches", () => {
    const table = computeStandings(teams, [m(1, 1, 2, 2, 0), m(1, 3, 4, 1, 1), m(2, 2, 3, null, null)], points);
    const byId = Object.fromEntries(table.map((r) => [r.teamId, r]));
    assert.deepEqual([byId[1].played, byId[1].won, byId[1].points, byId[1].goalDiff, byId[1].form], [1, 1, 3, 2, ["W"]]);
    assert.deepEqual([byId[2].lost, byId[2].points, byId[2].goalDiff], [1, 0, -2]);
    assert.deepEqual([byId[3].drawn, byId[3].points], [1, 1]);
    assert.equal(byId[5].played, 0);
  });

  it("orders by points, then goal difference, then goals scored, then name", () => {
    const table = computeStandings(teams, [m(1, 1, 4, 1, 0), m(1, 2, 5, 3, 2), m(2, 3, 4, 4, 0)], points);
    assert.deepEqual(table.map((r) => r.name), ["City Stars", "Bees", "Arsenal Lions", "Eagles", "Dons"]);
  });

  it("marks the top-N and relegation zones", () => {
    const table = computeStandings(teams, [], points, { highlightTop: 2, relegation: 1 });
    assert.deepEqual(table.map((r) => r.zone), ["top", "top", null, null, "relegation"]);
  });

  it("uses custom points and keeps only the last 5 results as form", () => {
    const ms = [1, 2, 3, 4, 5, 6].map((r) => m(r, 1, 2, r === 1 ? 0 : 1, 0));
    const [top] = computeStandings(teams.slice(0, 2), ms, { win: 2, draw: 1, loss: 0 });
    assert.equal(top.points, 11); // one 0-0 draw (1) + five wins (5 x 2)
    assert.deepEqual(top.form, ["W", "W", "W", "W", "W"]);
  });
});

// ---------------------------------------------------------------------------
// Database workflows
// ---------------------------------------------------------------------------

const weekly = (n: number) =>
  Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 0, 3 + 7 * i)).toISOString().slice(0, 10));

function freshDb(format: "league" | "groups" = "league") {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  const seasonId = league.createSeason(db, {
    name: "Peace Cup 2026", format, win: 3, draw: 1, loss: 0, highlightTop: 2, relegation: 0,
  }).id;
  return { db, seasonId };
}

describe("migrations", () => {
  it("upgrades a version-1 database in place, keeping its data", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`CREATE TABLE seasons (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, points_win INTEGER NOT NULL DEFAULT 3,
      points_draw INTEGER NOT NULL DEFAULT 1, points_loss INTEGER NOT NULL DEFAULT 0, highlight_top INTEGER NOT NULL DEFAULT 4,
      relegation INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE teams (id INTEGER PRIMARY KEY AUTOINCREMENT, season_id INTEGER NOT NULL, name TEXT NOT NULL COLLATE NOCASE);
      CREATE TABLE playing_dates (season_id INTEGER NOT NULL, date TEXT NOT NULL, PRIMARY KEY (season_id, date));
      CREATE TABLE matches (id INTEGER PRIMARY KEY AUTOINCREMENT, season_id INTEGER NOT NULL, round INTEGER NOT NULL, date TEXT,
        home_team_id INTEGER NOT NULL, away_team_id INTEGER NOT NULL, home_score INTEGER, away_score INTEGER);
      INSERT INTO seasons (name) VALUES ('Old');
      INSERT INTO teams (season_id, name) VALUES (1, 'A'), (1, 'B');
      INSERT INTO matches (season_id, round, date, home_team_id, away_team_id, home_score, away_score) VALUES (1, 1, '2026-01-01', 1, 2, 2, 1);`);
    migrate(db);
    const season = league.getSeason(db, 1)!;
    const [table] = matches.getTables(db, season);
    assert.equal(table.rows[0].name, "A");
    assert.equal(table.rows[0].points, 3);
    migrate(db); // running again is a no-op
  });
});

describe("league fixtures", () => {
  let db: DatabaseSync;
  let seasonId: number;
  beforeEach(() => ({ db, seasonId } = freshDb()));

  it("league format: home and away, one matchday per date by default", () => {
    league.addTeams(db, seasonId, ["A", "B", "C", "D"]);
    league.setPlayingDates(db, seasonId, weekly(6));
    const ms = matches.generateFixtures(db, seasonId, { shuffle: true });
    const ordered = new Set(ms.map((m) => `${m.home.id}>${m.away.id}`));
    assert.equal(ordered.size, 12, "every pair meets twice, once at each ground");
    assert.equal(ms.length, 12);
    const dates = weekly(6);
    for (const m of ms) assert.equal(m.date, dates[m.round - 1]);
  });

  it("can play the whole league on fewer dates, with kick-off times", () => {
    league.addTeams(db, seasonId, ["A", "B", "C", "D"]);
    league.setPlayingDates(db, seasonId, weekly(3));
    const ms = matches.generateFixtures(db, seasonId, {
      shuffle: false, oncePerDay: false, maxPerDay: 4, kickoffTimes: ["10:00", "12:00", "14:00", "16:00"],
    });
    assert.equal(ms.length, 12);
    assert.equal(new Set(ms.map((m) => m.date)).size, 3);
    assert.deepEqual(ms.slice(0, 4).map((m) => m.kickoff), ["10:00", "12:00", "14:00", "16:00"]);
  });

  it("explains what to do when the dates run out", () => {
    league.addTeams(db, seasonId, ["A", "B", "C", "D"]);
    league.setPlayingDates(db, seasonId, weekly(3));
    assert.throws(
      () => matches.generateFixtures(db, seasonId, { shuffle: false }),
      /6 matches could not be scheduled.*12 matches need to fit on 3 dates/,
    );
  });

  it("results update the table and lock regeneration", () => {
    league.addTeams(db, seasonId, ["A", "B"]);
    league.setPlayingDates(db, seasonId, weekly(2));
    const [first] = matches.generateFixtures(db, seasonId, { shuffle: false });
    matches.saveResult(db, first.id, "2", "1");
    const [table] = matches.getTables(db, league.getSeason(db, seasonId)!);
    assert.equal(table.rows[0].name, first.home.name);
    assert.equal(table.rows[0].points, 3);
    assert.throws(() => matches.generateFixtures(db, seasonId, { shuffle: false }), /already been entered/);
    assert.throws(() => league.removeTeam(db, first.home.id), /has 2 fixtures/);
    matches.saveResult(db, first.id, "", "");
    assert.equal(matches.resultCount(db, seasonId), 0);
  });
});

describe("group stage format", () => {
  let db: DatabaseSync;
  let seasonId: number;
  beforeEach(() => ({ db, seasonId } = freshDb("groups")));

  it("draws teams evenly into groups, each pair in a group meets once, one table per group", () => {
    league.addLetteredGroups(db, seasonId, 2);
    league.addTeams(db, seasonId, ["A", "B", "C", "D", "E", "F", "G", "H"]);
    league.drawGroups(db, seasonId);
    const teams = league.listTeams(db, seasonId);
    const groups = league.listGroups(db, seasonId);
    assert.deepEqual(groups.map((g) => g.name), ["Group A", "Group B"]);
    for (const g of groups) assert.equal(teams.filter((t) => t.groupId === g.id).length, 4);

    league.setPlayingDates(db, seasonId, weekly(3));
    const ms = matches.generateFixtures(db, seasonId, { shuffle: true });
    assert.equal(ms.length, 12); // 6 per group, no return legs
    const pairs = new Set(ms.map((m) => [m.home.id, m.away.id].sort().join("-")));
    assert.equal(pairs.size, 12, "no pair plays twice in the group stage");
    const groupOf = new Map(teams.map((t) => [t.id, t.groupId]));
    for (const m of ms) {
      assert.equal(groupOf.get(m.home.id), m.groupId);
      assert.equal(groupOf.get(m.away.id), m.groupId);
    }
    // Matchday 1 of both groups is on the first date: 4 matches.
    assert.equal(ms.filter((m) => m.date === weekly(1)[0]).length, 4);

    const tables = matches.getTables(db, league.getSeason(db, seasonId)!);
    assert.equal(tables.length, 2);
    assert.deepEqual(tables.map((t) => t.rows.length), [4, 4]);
    assert.deepEqual(tables[0].rows.map((r) => r.zone), ["top", "top", null, null]);
  });

  it("refuses to generate while a team has no group", () => {
    league.addLetteredGroups(db, seasonId, 2);
    league.addTeams(db, seasonId, ["A", "B", "C", "D", "E"]);
    league.drawGroups(db, seasonId);
    league.addTeams(db, seasonId, ["Latecomers"]);
    league.setPlayingDates(db, seasonId, weekly(10));
    assert.throws(() => matches.generateFixtures(db, seasonId, { shuffle: false }), /Not in a group: Latecomers/);
  });

  it("manual matches: same-group matches are filed under the group, cross-group ones need a stage", () => {
    const [ga, gb] = league.addLetteredGroups(db, seasonId, 2);
    league.addTeams(db, seasonId, ["A1", "A2"], ga.id);
    league.addTeams(db, seasonId, ["B1", "B2"], gb.id);
    const t = Object.fromEntries(league.listTeams(db, seasonId).map((x) => [x.name, x.id]));

    const id = matches.createMatch(db, seasonId, { homeTeamId: t.A1, awayTeamId: t.A2, date: "2026-03-01", kickoff: "15:00" });
    assert.equal(matches.getMatch(db, id)!.groupId, ga.id);

    assert.throws(() => matches.createMatch(db, seasonId, { homeTeamId: t.A1, awayTeamId: t.B1 }), /aren't in the same group/);
    const finalId = matches.createMatch(db, seasonId, { homeTeamId: t.A1, awayTeamId: t.B1, stage: "Final" });
    matches.saveResult(db, finalId, 5, 0);
    const tables = matches.getTables(db, league.getSeason(db, seasonId)!);
    assert.ok(tables.every((tb) => tb.rows.every((r) => r.played === 0)), "stage matches don't count toward tables");

    assert.throws(() => league.deleteGroup(db, ga.id), /has fixtures/);
  });
});

describe("formats", () => {
  it("league format refuses groups; group stage needs at least 2 groups", () => {
    const { db, seasonId } = freshDb("league");
    assert.throws(() => league.addLetteredGroups(db, seasonId, 2), /league format/);
    const g = freshDb("groups");
    league.addTeams(g.db, g.seasonId, ["A", "B", "C", "D"]);
    league.setPlayingDates(g.db, g.seasonId, weekly(5));
    assert.throws(() => matches.generateFixtures(g.db, g.seasonId, { shuffle: false }), /at least 2 groups/);
  });

  it("the format can change only while there are no league/group fixtures", () => {
    const { db, seasonId } = freshDb("league");
    const base = { name: "X", win: 3, draw: 1, loss: 0, highlightTop: 4, relegation: 0 };
    league.addTeams(db, seasonId, ["A", "B"]);
    league.setPlayingDates(db, seasonId, weekly(2));
    matches.generateFixtures(db, seasonId, { shuffle: false });
    assert.throws(() => league.updateSeason(db, seasonId, { ...base, format: "groups" }), /format can't change/);
    league.updateSeason(db, seasonId, { ...base }); // omitting the format keeps it
    matches.clearLeagueFixtures(db, seasonId);
    assert.equal(league.updateSeason(db, seasonId, { ...base, format: "groups" }).format, "groups");
  });

  it("migration marks existing seasons that use groups as group stage", () => {
    const db = new DatabaseSync(":memory:");
    migrate(db);
    db.exec("PRAGMA user_version = 2");
    // Simulate a v2 database: no format column yet.
    db.exec(`ALTER TABLE seasons DROP COLUMN format`);
    db.exec(`INSERT INTO seasons (name) VALUES ('Cup'), ('League')`);
    db.exec(`INSERT INTO league_groups (season_id, name) VALUES (1, 'Group A')`);
    migrate(db);
    assert.deepEqual([league.getSeason(db, 1)!.format, league.getSeason(db, 2)!.format], ["groups", "league"]);
  });
});

describe("messy input: blank lines and extra spaces", () => {
  it("skips blank lines and tidies spaces in team names", () => {
    const { db, seasonId } = freshDb();
    league.addTeams(db, seasonId, ["", "  Riverside FC  ", "", "   ", "\tHill Stars\t", "", "Market    Rangers", "\r"]);
    assert.deepEqual(league.listTeams(db, seasonId).map((t) => t.name), ["Hill Stars", "Market Rangers", "Riverside FC"]);
  });

  it("splits pasted lists on new lines and commas", () => {
    assert.deepEqual(splitNameList("Riverside FC, Hill Stars,Market Rangers\n\n  Unity Boys  ,, ,\r\nLakeside"), [
      "Riverside FC", "Hill Stars", "Market Rangers", "Unity Boys", "Lakeside",
    ]);
    assert.deepEqual(splitNameList(" , \n ,"), []);
    const { db, seasonId } = freshDb();
    league.addTeams(db, seasonId, splitNameList("Lions, Eagles\nStars,  Bees "));
    assert.deepEqual(league.listTeams(db, seasonId).map((t) => t.name), ["Bees", "Eagles", "Lions", "Stars"]);
    assert.throws(() => league.addTeams(db, seasonId, splitNameList("Hawks, lions")), /"lions" is already in this season/);
    assert.equal(league.listTeams(db, seasonId).length, 4, "a rejected list adds nothing");
  });

  it("treats names that differ only by spaces or capitals as the same team", () => {
    const { db, seasonId } = freshDb();
    league.addTeams(db, seasonId, ["Riverside FC"]);
    assert.throws(() => league.addTeams(db, seasonId, ["Riverside   FC"]), /already in this season/);
    assert.throws(() => league.addTeams(db, seasonId, ["  riverside fc "]), /already in this season/);
    assert.throws(() => league.addTeams(db, seasonId, ["New Team", "new   team"]), /already in this season/);
    assert.throws(() => league.addTeams(db, seasonId, ["", "   ", ""]), /at least one team/);
  });

  it("tidies groups, players, renames and season names too", () => {
    const { db, seasonId } = freshDb("groups");
    league.addGroups(db, seasonId, ["", "  North   Zone ", "", "South"]);
    assert.deepEqual(league.listGroups(db, seasonId).map((g) => g.name), ["North Zone", "South"]);
    assert.throws(() => league.addGroups(db, seasonId, ["north zone"]), /already exists/);

    const [team] = league.addTeams(db, seasonId, ["Lions"]);
    league.renameTeam(db, team.id, "   Mighty    Lions  ");
    assert.equal(league.listTeams(db, seasonId)[0].name, "Mighty Lions");

    players.addPlayers(db, team.id, ["", "  10   John    Okello   FW ", "", "\t7 Ali  Hassan"]);
    assert.deepEqual(players.listPlayers(db, team.id).map((p) => [p.number, p.name, p.position]), [[7, "Ali Hassan", null], [10, "John Okello", "FW"]]);

    const s = league.createSeason(db, { name: "  Peace   Cup  2027 ", win: 3, draw: 1, loss: 0, highlightTop: 4, relegation: 0 });
    assert.equal(s.name, "Peace Cup 2027");
  });
});

describe("fixture CRUD", () => {
  let db: DatabaseSync;
  let seasonId: number;
  beforeEach(() => ({ db, seasonId } = freshDb()));

  it("creates, edits (including swapping home/away with the score) and deletes matches", () => {
    league.addTeams(db, seasonId, ["A", "B", "C"]);
    const t = Object.fromEntries(league.listTeams(db, seasonId).map((x) => [x.name, x.id]));
    assert.throws(() => matches.createMatch(db, seasonId, { homeTeamId: t.A, awayTeamId: t.A }), /can't play itself/);
    assert.throws(() => matches.createMatch(db, seasonId, { homeTeamId: t.A, awayTeamId: t.B, kickoff: "25:00" }), /valid time/);

    const id = matches.createMatch(db, seasonId, { homeTeamId: t.A, awayTeamId: t.B, date: "2026-04-04", venue: "Main ground" });
    matches.saveResult(db, id, 3, 1);
    matches.updateMatch(db, id, { homeTeamId: t.B, awayTeamId: t.A, date: "2026-04-05", kickoff: "16:30", venue: "" });
    const m = matches.getMatch(db, id)!;
    assert.deepEqual([m.home.name, m.homeScore, m.awayScore, m.date, m.kickoff, m.venue], ["B", 1, 3, "2026-04-05", "16:30", null]);

    matches.deleteMatch(db, id);
    assert.equal(matches.getMatch(db, id), null);
  });
});

describe("players, events and stats", () => {
  let db: DatabaseSync;
  let seasonId: number;
  let t: Record<string, number>;
  let matchId: number;
  let p: Record<string, number>;

  beforeEach(() => {
    ({ db, seasonId } = freshDb());
    league.addTeams(db, seasonId, ["Lions", "Eagles"]);
    t = Object.fromEntries(league.listTeams(db, seasonId).map((x) => [x.name, x.id]));
    players.addPlayers(db, t.Lions, ["1 Sam Ouma GK", "9 John Okello FW", "10 Peter Mugisha MF"]);
    players.addPlayers(db, t.Eagles, ["4 David Kato DF", "Ali Hassan"]);
    p = Object.fromEntries([...players.listPlayers(db, t.Lions), ...players.listPlayers(db, t.Eagles)].map((x) => [x.name, x.id]));
    matchId = matches.createMatch(db, seasonId, { homeTeamId: t.Lions, awayTeamId: t.Eagles, date: "2026-05-01" });
  });

  it("parses squad lines", () => {
    assert.deepEqual(players.parsePlayerLine("10 Peter Mugisha mf"), { name: "Peter Mugisha", number: 10, position: "MF" });
    assert.deepEqual(players.parsePlayerLine("#7. Ali"), { name: "Ali", number: 7, position: null });
    assert.deepEqual(players.parsePlayerLine("Just A Name"), { name: "Just A Name", number: null, position: null });
    assert.throws(() => players.addPlayers(db, t.Lions, ["9 Someone Else"]), /Shirt number 9 is already worn by John Okello/);
  });

  it("records goals, assists, own goals and cards, and ranks the stats", () => {
    matches.addEvent(db, matchId, { type: "goal", teamId: t.Lions, playerId: p["John Okello"], assistId: p["Peter Mugisha"], minute: 12 });
    matches.addEvent(db, matchId, { type: "goal", teamId: t.Lions, playerId: p["John Okello"], minute: 70 });
    matches.addEvent(db, matchId, { type: "own_goal", teamId: t.Lions, playerId: p["David Kato"], minute: 80 });
    matches.addEvent(db, matchId, { type: "goal", teamId: t.Eagles, playerId: p["Ali Hassan"], assistId: p["David Kato"] });
    matches.addEvent(db, matchId, { type: "yellow", teamId: t.Eagles, playerId: p["David Kato"], minute: 30 });
    matches.addEvent(db, matchId, { type: "red", teamId: t.Eagles, playerId: p["David Kato"], minute: 85 });
    matches.addEvent(db, matchId, { type: "yellow", teamId: t.Lions, playerId: p["Peter Mugisha"] });

    const events = matches.listEvents(db, matchId);
    assert.equal(events.length, 7);
    assert.deepEqual(matches.goalsRecorded(events, matches.getMatch(db, matchId)!), { home: 3, away: 1 });

    assert.deepEqual(players.topScorers(db, seasonId).map((s) => [s.name, s.count]), [["John Okello", 2], ["Ali Hassan", 1]]);
    assert.deepEqual(players.topAssists(db, seasonId).map((s) => [s.name, s.count]), [["David Kato", 1], ["Peter Mugisha", 1]]);
    assert.deepEqual(players.discipline(db, seasonId).map((s) => [s.name, s.red, s.yellow]), [["David Kato", 1, 1], ["Peter Mugisha", 0, 1]]);

    const squad = players.squadWithStats(db, t.Lions);
    assert.deepEqual(squad.map((r) => [r.name, r.goals, r.assists]), [["Sam Ouma", 0, 0], ["John Okello", 2, 0], ["Peter Mugisha", 0, 1]]);

    assert.throws(() => players.deletePlayer(db, p["John Okello"]), /Remove those match events first/);
    players.deletePlayer(db, p["Sam Ouma"]);
  });

  it("validates events", () => {
    const add = (e: Partial<matches.EventInput>) => () =>
      matches.addEvent(db, matchId, { type: "goal", teamId: t.Lions, playerId: p["John Okello"], ...e });
    assert.throws(add({ playerId: p["Ali Hassan"] }), /isn't in this team's squad/);
    assert.throws(add({ type: "own_goal" }), /choose a player from the team that conceded/);
    assert.throws(add({ assistId: p["John Okello"] }), /can't assist their own goal/);
    assert.throws(add({ assistId: p["Ali Hassan"] }), /must come from the scoring team/);
    assert.throws(add({ minute: 200 }), /Minute/);
    assert.throws(add({ type: "penalty" }), /Choose what happened/);

    const other = league.addTeams(db, seasonId, ["Outsiders"]).find((x) => x.name === "Outsiders")!;
    assert.throws(add({ teamId: other.id }), /one of the two teams/);
  });

  it("guards against changing teams once events exist, and deleting a match removes its events", () => {
    matches.addEvent(db, matchId, { type: "goal", teamId: t.Lions, playerId: p["John Okello"] });
    const third = league.addTeams(db, seasonId, ["Third"]).find((x) => x.name === "Third")!;
    assert.throws(() => matches.updateMatch(db, matchId, { homeTeamId: third.id, awayTeamId: t.Eagles }), /Remove them before changing the teams/);
    matches.deleteMatch(db, matchId);
    assert.equal(players.topScorers(db, seasonId).length, 0);
  });
});
