import { strict as assert } from "node:assert";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, it } from "node:test";
import { generateRoundRobin, roundsNeeded } from "../src/lib/fixtures";
import * as league from "../src/lib/league";
import * as matches from "../src/lib/matches";
import * as players from "../src/lib/players";
import { scheduleMatches, SchedulingError } from "../src/lib/scheduler";
import { splitNameList } from "../src/lib/validate";
import type { Db } from "../src/lib/sql";
import { copySqliteToPostgres } from "../scripts/sqlite/copy";
import { migrate as migrateSqlite } from "../scripts/sqlite/legacy-schema";
import { assertSchema } from "../src/lib/schema";
import { applyMigrations } from "./migrations";
import * as users from "../src/lib/users";
import { freshPg } from "./pglite";
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

  it("double round robin: every ordered pairing once, second leg mirrors the first", async () => {
    const rounds = generateRoundRobin([1, 2, 3, 4, 5, 6], { doubleRound: true });
    assert.equal(rounds.length, 10);
    assert.equal(new Set(rounds.flat().map((m) => `${m.home}>${m.away}`)).size, 30);
    for (const m of rounds[5]) assert.ok(rounds[0].some((x) => x.home === m.away && x.away === m.home));
  });
});

describe("scheduleMatches", () => {
  const ms = generateRoundRobin([1, 2, 3, 4], { doubleRound: false, shuffle: false }).flat(); // 6 matches, 3 rounds

  it("puts a whole matchday on each date by default", async () => {
    const s = scheduleMatches(ms, ["2026-01-01", "2026-01-02", "2026-01-03"]);
    assert.deepEqual(s.map((x) => x.date), ["2026-01-01", "2026-01-01", "2026-01-02", "2026-01-02", "2026-01-03", "2026-01-03"]);
  });

  it("allows any number of matches per day when teams may play more than once", async () => {
    const s = scheduleMatches(ms, ["2026-01-01"], { oncePerDay: false });
    assert.equal(s.length, 6);
    assert.ok(s.every((x) => x.date === "2026-01-01"));
  });

  it("respects a per-day cap and hands out kick-off times in order", async () => {
    const s = scheduleMatches(ms, ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05", "2026-01-06"], {
      maxPerDay: 1, kickoffTimes: ["15:00"],
    });
    assert.equal(new Set(s.map((x) => x.date)).size, 6);
    assert.ok(s.every((x) => x.kickoff === "15:00"));
    const two = scheduleMatches(ms, ["2026-01-01", "2026-01-02", "2026-01-03"], { kickoffTimes: ["14:00", "16:00"] });
    assert.deepEqual(two.slice(0, 2).map((x) => x.kickoff), ["14:00", "16:00"]);
  });

  it("never schedules a team twice on one date by default", async () => {
    const big = generateRoundRobin([1, 2, 3, 4, 5, 6, 7], { doubleRound: true }).flat();
    const dates = Array.from({ length: 30 }, (_, i) => `2026-02-${String(i + 1).padStart(2, "0")}`.slice(0, 10));
    const s = scheduleMatches(big, dates.filter((d) => !Number.isNaN(Date.parse(d))), { maxPerDay: 3 });
    const byDate = new Map<string, number[]>();
    for (const x of s) byDate.set(x.date, [...(byDate.get(x.date) ?? []), x.match.home, x.match.away]);
    for (const teams of byDate.values()) assert.equal(new Set(teams).size, teams.length);
  });

  it("reports how many matches didn't fit", async () => {
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
    id: ++id, round, date: `2026-01-${String(round).padStart(2, "0")}`, kickoff: null, venue: null, referee: null,
    groupId: null, groupName: null, stage: null,
    home: teams[h - 1], away: teams[a - 1], homeScore: hs, awayScore: as, homePens: null, awayPens: null, bracketSlot: null,
    played: hs != null,
  });
  const points = { win: 3, draw: 1, loss: 0 };

  it("awards 3/1/0 and counts goals, ignoring unplayed matches", async () => {
    const table = computeStandings(teams, [m(1, 1, 2, 2, 0), m(1, 3, 4, 1, 1), m(2, 2, 3, null, null)], points);
    const byId = Object.fromEntries(table.map((r) => [r.teamId, r]));
    assert.deepEqual([byId[1].played, byId[1].won, byId[1].points, byId[1].goalDiff, byId[1].form], [1, 1, 3, 2, ["W"]]);
    assert.deepEqual([byId[2].lost, byId[2].points, byId[2].goalDiff], [1, 0, -2]);
    assert.deepEqual([byId[3].drawn, byId[3].points], [1, 1]);
    assert.equal(byId[5].played, 0);
  });

  it("orders by points, then goal difference, then goals scored, then name", async () => {
    const table = computeStandings(teams, [m(1, 1, 4, 1, 0), m(1, 2, 5, 3, 2), m(2, 3, 4, 4, 0)], points);
    assert.deepEqual(table.map((r) => r.name), ["City Stars", "Bees", "Arsenal Lions", "Eagles", "Dons"]);
  });

  it("marks the top-N and relegation zones", async () => {
    const table = computeStandings(teams, [], points, { highlightTop: 2, relegation: 1 });
    assert.deepEqual(table.map((r) => r.zone), ["top", "top", null, null, "relegation"]);
  });

  it("uses custom points and keeps only the last 5 results as form", async () => {
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

async function freshDb(format: "league" | "groups" = "league") {
  const db = await freshPg();
  const seasonId = (await league.createSeason(db, {
    name: "Peace Cup 2026", format, win: 3, draw: 1, loss: 0, highlightTop: 2, relegation: 0,
  })).id;
  return { db, seasonId };
}

describe("migrations and moving from SQLite", () => {
  it("the migration files can be run again safely, and the schema check passes", async () => {
    const db = await freshPg();
    await league.createSeason(db, { name: "Kept", win: 3, draw: 1, loss: 0, highlightTop: 4, relegation: 0 });
    await applyMigrations(db); // e.g. pasted into the SQL Editor twice
    await assertSchema(db);
    assert.equal((await league.listSeasons(db)).length, 1, "running them again keeps the data");
  });

  it("the schema check explains what to do on an empty database", async () => {
    const db = await freshPg();
    await db.exec("DROP TABLE sessions");
    await assert.rejects(assertSchema(db), /missing tables: sessions.*SQL Editor.*supabase\/migrations/);
    await applyMigrations(db); // puts it back for the other tests
  });

  it("copies an old (version-1) SQLite database into Postgres, keeping ids, and new rows continue after them", async () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`CREATE TABLE seasons (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, points_win INTEGER NOT NULL DEFAULT 3,
      points_draw INTEGER NOT NULL DEFAULT 1, points_loss INTEGER NOT NULL DEFAULT 0, highlight_top INTEGER NOT NULL DEFAULT 4,
      relegation INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE teams (id INTEGER PRIMARY KEY AUTOINCREMENT, season_id INTEGER NOT NULL, name TEXT NOT NULL COLLATE NOCASE);
      CREATE TABLE playing_dates (season_id INTEGER NOT NULL, date TEXT NOT NULL, PRIMARY KEY (season_id, date));
      CREATE TABLE matches (id INTEGER PRIMARY KEY AUTOINCREMENT, season_id INTEGER NOT NULL, round INTEGER NOT NULL, date TEXT,
        home_team_id INTEGER NOT NULL, away_team_id INTEGER NOT NULL, home_score INTEGER, away_score INTEGER);
      INSERT INTO seasons (id, name) VALUES (7, 'Old');
      INSERT INTO teams (id, season_id, name) VALUES (3, 7, 'A'), (5, 7, 'B');
      INSERT INTO matches (season_id, round, date, home_team_id, away_team_id, home_score, away_score) VALUES (7, 1, '2026-01-01', 3, 5, 2, 1);`);
    const db = await freshPg();
    const copied = await copySqliteToPostgres(sqlite, db);
    assert.deepEqual([copied.seasons, copied.teams, copied.matches, copied.users], [1, 2, 1, 0]);

    const season = (await league.getSeason(db, 7))!;
    const [table] = await matches.getTables(db, season);
    assert.deepEqual([table.rows[0].name, table.rows[0].teamId, table.rows[0].points], ["A", 3, 3]);
    const [added] = await league.addTeams(db, 7, ["C"]).then((ts) => ts.filter((t) => t.name === "C"));
    assert.equal(added.id, 6, "new ids continue after the copied ones");
  });

  it("copies accounts so passwords and sign-ins keep working, and refuses to copy into a database with data", async () => {
    const sqlite = new DatabaseSync(":memory:");
    migrateSqlite(sqlite);
    sqlite.exec(`INSERT INTO seasons (name) VALUES ('S'); INSERT INTO teams (season_id, name) VALUES (1, 'Lions');`);
    sqlite.prepare("INSERT INTO users (username, name, password_hash, role, favourite_team_id) VALUES (?, ?, ?, ?, ?)")
      .run("Grace", "Grace N", users.hashPassword("pw123456"), "admin", 1);
    sqlite.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ('abc', 1, 9999999999)").run();
    const db = await freshPg();
    // Like Supabase: other schemas have tables with the same names but different columns.
    await db.exec("CREATE SCHEMA IF NOT EXISTS auth; CREATE TABLE IF NOT EXISTS auth.sessions (id uuid, user_id uuid, aal text)");
    await copySqliteToPostgres(sqlite, db);

    const grace = (await users.authenticate(db, "grace", "pw123456"))!;
    assert.deepEqual([grace.role, grace.favouriteTeamId], ["admin", 1]);
    assert.equal(Number((await db.get("SELECT COUNT(*) AS n FROM sessions"))!.n), 1);
    await assert.rejects(copySqliteToPostgres(sqlite, db), /already has data.*nothing was changed/);
    assert.equal((await users.listUsers(db)).length, 1);
  });
});

describe("league fixtures", () => {
  let db: Db;
  let seasonId: number;
  beforeEach(async () => ({ db, seasonId } = await freshDb()));

  it("league format: home and away, one matchday per date by default", async () => {
    await league.addTeams(db, seasonId, ["A", "B", "C", "D"]);
    await league.setPlayingDates(db, seasonId, weekly(6));
    const ms = await matches.generateFixtures(db, seasonId, { shuffle: true });
    const ordered = new Set(ms.map((m) => `${m.home.id}>${m.away.id}`));
    assert.equal(ordered.size, 12, "every pair meets twice, once at each ground");
    assert.equal(ms.length, 12);
    const dates = weekly(6);
    for (const m of ms) assert.equal(m.date, dates[m.round - 1]);
  });

  it("can play the whole league on fewer dates, with kick-off times", async () => {
    await league.addTeams(db, seasonId, ["A", "B", "C", "D"]);
    await league.setPlayingDates(db, seasonId, weekly(3));
    const ms = await matches.generateFixtures(db, seasonId, {
      shuffle: false, oncePerDay: false, maxPerDay: 4, kickoffTimes: ["10:00", "12:00", "14:00", "16:00"],
    });
    assert.equal(ms.length, 12);
    assert.equal(new Set(ms.map((m) => m.date)).size, 3);
    assert.deepEqual(ms.slice(0, 4).map((m) => m.kickoff), ["10:00", "12:00", "14:00", "16:00"]);
  });

  it("explains what to do when the dates run out", async () => {
    await league.addTeams(db, seasonId, ["A", "B", "C", "D"]);
    await league.setPlayingDates(db, seasonId, weekly(3));
    await assert.rejects(
      matches.generateFixtures(db, seasonId, { shuffle: false }),
      /6 matches could not be scheduled.*12 matches need to fit on 3 dates/,
    );
  });

  it("results update the table and lock regeneration", async () => {
    await league.addTeams(db, seasonId, ["A", "B"]);
    await league.setPlayingDates(db, seasonId, weekly(2));
    const [first] = await matches.generateFixtures(db, seasonId, { shuffle: false });
    await matches.saveResult(db, first.id, "2", "1");
    const [table] = await matches.getTables(db, (await league.getSeason(db, seasonId))!);
    assert.equal(table.rows[0].name, first.home.name);
    assert.equal(table.rows[0].points, 3);
    await assert.rejects(matches.generateFixtures(db, seasonId, { shuffle: false }), /already been entered/);
    await assert.rejects(league.removeTeam(db, first.home.id), /has 2 fixtures/);
    await matches.saveResult(db, first.id, "", "");
    assert.equal((await matches.resultCount(db, seasonId)), 0);
  });
});

describe("group stage format", () => {
  let db: Db;
  let seasonId: number;
  beforeEach(async () => ({ db, seasonId } = await freshDb("groups")));

  it("draws teams evenly into groups, each pair in a group meets once, one table per group", async () => {
    await league.addLetteredGroups(db, seasonId, 2);
    await league.addTeams(db, seasonId, ["A", "B", "C", "D", "E", "F", "G", "H"]);
    await league.drawGroups(db, seasonId);
    const teams = await league.listTeams(db, seasonId);
    const groups = await league.listGroups(db, seasonId);
    assert.deepEqual(groups.map((g) => g.name), ["Group A", "Group B"]);
    for (const g of groups) assert.equal(teams.filter((t) => t.groupId === g.id).length, 4);

    await league.setPlayingDates(db, seasonId, weekly(3));
    const ms = await matches.generateFixtures(db, seasonId, { shuffle: true });
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

    const tables = await matches.getTables(db, (await league.getSeason(db, seasonId))!);
    assert.equal(tables.length, 2);
    assert.deepEqual(tables.map((t) => t.rows.length), [4, 4]);
    assert.deepEqual(tables[0].rows.map((r) => r.zone), ["top", "top", null, null]);
  });

  it("refuses to generate while a team has no group", async () => {
    await league.addLetteredGroups(db, seasonId, 2);
    await league.addTeams(db, seasonId, ["A", "B", "C", "D", "E"]);
    await league.drawGroups(db, seasonId);
    await league.addTeams(db, seasonId, ["Latecomers"]);
    await league.setPlayingDates(db, seasonId, weekly(10));
    await assert.rejects(matches.generateFixtures(db, seasonId, { shuffle: false }), /Not in a group: Latecomers/);
  });

  it("manual matches: same-group matches are filed under the group, cross-group ones need a stage", async () => {
    const [ga, gb] = await league.addLetteredGroups(db, seasonId, 2);
    await league.addTeams(db, seasonId, ["A1", "A2"], ga.id);
    await league.addTeams(db, seasonId, ["B1", "B2"], gb.id);
    const t = Object.fromEntries((await league.listTeams(db, seasonId)).map((x) => [x.name, x.id]));

    const id = await matches.createMatch(db, seasonId, { homeTeamId: t.A1, awayTeamId: t.A2, date: "2026-03-01", kickoff: "15:00" });
    assert.equal((await matches.getMatch(db, id))!.groupId, ga.id);

    await assert.rejects(matches.createMatch(db, seasonId, { homeTeamId: t.A1, awayTeamId: t.B1 }), /aren't in the same group/);
    const finalId = await matches.createMatch(db, seasonId, { homeTeamId: t.A1, awayTeamId: t.B1, stage: "Final" });
    await matches.saveResult(db, finalId, 5, 0);
    const tables = await matches.getTables(db, (await league.getSeason(db, seasonId))!);
    assert.ok(tables.every((tb) => tb.rows.every((r) => r.played === 0)), "stage matches don't count toward tables");

    await assert.rejects(league.deleteGroup(db, ga.id), /has fixtures/);
  });
});

describe("formats", () => {
  it("league format refuses groups; group stage needs at least 2 groups", async () => {
    const { db, seasonId } = await freshDb("league");
    await assert.rejects(league.addLetteredGroups(db, seasonId, 2), /league format/);
    const g = await freshDb("groups");
    await league.addTeams(g.db, g.seasonId, ["A", "B", "C", "D"]);
    await league.setPlayingDates(g.db, g.seasonId, weekly(5));
    await assert.rejects(matches.generateFixtures(g.db, g.seasonId, { shuffle: false }), /at least 2 groups/);
  });

  it("the format can change only while there are no league/group fixtures", async () => {
    const { db, seasonId } = await freshDb("league");
    const base = { name: "X", win: 3, draw: 1, loss: 0, highlightTop: 4, relegation: 0 };
    await league.addTeams(db, seasonId, ["A", "B"]);
    await league.setPlayingDates(db, seasonId, weekly(2));
    await matches.generateFixtures(db, seasonId, { shuffle: false });
    await assert.rejects(league.updateSeason(db, seasonId, { ...base, format: "groups" }), /format can't change/);
    await league.updateSeason(db, seasonId, { ...base }); // omitting the format keeps it
    await matches.clearLeagueFixtures(db, seasonId);
    assert.equal((await league.updateSeason(db, seasonId, { ...base, format: "groups" })).format, "groups");
  });

  it("an old SQLite database's seasons that use groups become group stage when copied", async () => {
    const sqlite = new DatabaseSync(":memory:");
    migrateSqlite(sqlite);
    sqlite.exec("PRAGMA user_version = 2");
    // Simulate a v2 database: no format column yet.
    sqlite.exec(`ALTER TABLE seasons DROP COLUMN format`);
    sqlite.exec(`DROP TABLE sessions; DROP TABLE users; DROP INDEX idx_seasons_single_pin; ALTER TABLE seasons DROP COLUMN pinned; ALTER TABLE match_events DROP COLUMN added_minute;`); // added by later migrations
    sqlite.exec(`INSERT INTO seasons (name) VALUES ('Cup'), ('League')`);
    sqlite.exec(`INSERT INTO league_groups (season_id, name) VALUES (1, 'Group A')`);
    const db = await freshPg();
    await copySqliteToPostgres(sqlite, db);
    assert.deepEqual([(await league.getSeason(db, 1))!.format, (await league.getSeason(db, 2))!.format], ["groups", "league"]);
  });
});

describe("messy input: blank lines and extra spaces", () => {
  it("skips blank lines and tidies spaces in team names", async () => {
    const { db, seasonId } = await freshDb();
    await league.addTeams(db, seasonId, ["", "  Riverside FC  ", "", "   ", "\tHill Stars\t", "", "Market    Rangers", "\r"]);
    assert.deepEqual((await league.listTeams(db, seasonId)).map((t) => t.name), ["Hill Stars", "Market Rangers", "Riverside FC"]);
  });

  it("splits pasted lists on new lines and commas", async () => {
    assert.deepEqual(splitNameList("Riverside FC, Hill Stars,Market Rangers\n\n  Unity Boys  ,, ,\r\nLakeside"), [
      "Riverside FC", "Hill Stars", "Market Rangers", "Unity Boys", "Lakeside",
    ]);
    assert.deepEqual(splitNameList(" , \n ,"), []);
    const { db, seasonId } = await freshDb();
    await league.addTeams(db, seasonId, splitNameList("Lions, Eagles\nStars,  Bees "));
    assert.deepEqual((await league.listTeams(db, seasonId)).map((t) => t.name), ["Bees", "Eagles", "Lions", "Stars"]);
    await assert.rejects(league.addTeams(db, seasonId, splitNameList("Hawks, lions")), /"lions" is already in this season/);
    assert.equal((await league.listTeams(db, seasonId)).length, 4, "a rejected list adds nothing");
  });

  it("treats names that differ only by spaces or capitals as the same team", async () => {
    const { db, seasonId } = await freshDb();
    await league.addTeams(db, seasonId, ["Riverside FC"]);
    await assert.rejects(league.addTeams(db, seasonId, ["Riverside   FC"]), /already in this season/);
    await assert.rejects(league.addTeams(db, seasonId, ["  riverside fc "]), /already in this season/);
    await assert.rejects(league.addTeams(db, seasonId, ["New Team", "new   team"]), /already in this season/);
    await assert.rejects(league.addTeams(db, seasonId, ["", "   ", ""]), /at least one team/);
  });

  it("tidies groups, players, renames and season names too", async () => {
    const { db, seasonId } = await freshDb("groups");
    await league.addGroups(db, seasonId, ["", "  North   Zone ", "", "South"]);
    assert.deepEqual((await league.listGroups(db, seasonId)).map((g) => g.name), ["North Zone", "South"]);
    await assert.rejects(league.addGroups(db, seasonId, ["north zone"]), /already exists/);

    const [team] = await league.addTeams(db, seasonId, ["Lions"]);
    await league.renameTeam(db, team.id, "   Mighty    Lions  ");
    assert.equal((await league.listTeams(db, seasonId))[0].name, "Mighty Lions");

    await players.addPlayers(db, team.id, ["", "  10   John    Okello   FW ", "", "\t7 Ali  Hassan"]);
    assert.deepEqual((await players.listPlayers(db, team.id)).map((p) => [p.number, p.name, p.position]), [[7, "Ali Hassan", null], [10, "John Okello", "FW"]]);

    const s = await league.createSeason(db, { name: "  Peace   Cup  2027 ", win: 3, draw: 1, loss: 0, highlightTop: 4, relegation: 0 });
    assert.equal(s.name, "Peace Cup 2027");
  });
});

describe("fixture CRUD", () => {
  let db: Db;
  let seasonId: number;
  beforeEach(async () => ({ db, seasonId } = await freshDb()));

  it("creates, edits and deletes matches, and locks a played match's details", async () => {
    await league.addTeams(db, seasonId, ["A", "B", "C"]);
    const t = Object.fromEntries((await league.listTeams(db, seasonId)).map((x) => [x.name, x.id]));
    await assert.rejects(matches.createMatch(db, seasonId, { homeTeamId: t.A, awayTeamId: t.A }), /can't play itself/);
    await assert.rejects(matches.createMatch(db, seasonId, { homeTeamId: t.A, awayTeamId: t.B, kickoff: "25:00" }), /valid time/);

    const id = await matches.createMatch(db, seasonId, { homeTeamId: t.A, awayTeamId: t.B, date: "2026-04-04", venue: "Main ground" });
    const edit = { homeTeamId: t.B, awayTeamId: t.A, date: "2026-04-05", kickoff: "16:30", venue: "" };
    await matches.saveResult(db, id, 3, 1);
    await assert.rejects(matches.updateMatch(db, id, edit), /already been played/);
    assert.equal((await matches.getMatch(db, id))!.date, "2026-04-04");

    await matches.saveResult(db, id, "", ""); // clearing the score unlocks it
    await matches.updateMatch(db, id, edit);
    const m = (await matches.getMatch(db, id))!;
    assert.deepEqual([m.home.name, m.homeScore, m.date, m.kickoff, m.venue], ["B", null, "2026-04-05", "16:30", null]);

    await matches.deleteMatch(db, id);
    assert.equal((await matches.getMatch(db, id)), null);
  });
});

describe("players, events and stats", () => {
  let db: Db;
  let seasonId: number;
  let t: Record<string, number>;
  let matchId: number;
  let p: Record<string, number>;

  beforeEach(async () => {
    ({ db, seasonId } = await freshDb());
    await league.addTeams(db, seasonId, ["Lions", "Eagles"]);
    t = Object.fromEntries((await league.listTeams(db, seasonId)).map((x) => [x.name, x.id]));
    await players.addPlayers(db, t.Lions, ["1 Sam Ouma GK", "9 John Okello FW", "10 Peter Mugisha MF"]);
    await players.addPlayers(db, t.Eagles, ["4 David Kato DF", "Ali Hassan"]);
    p = Object.fromEntries([...(await players.listPlayers(db, t.Lions)), ...(await players.listPlayers(db, t.Eagles))].map((x) => [x.name, x.id]));
    matchId = await matches.createMatch(db, seasonId, { homeTeamId: t.Lions, awayTeamId: t.Eagles, date: "2026-05-01" });
  });

  it("parses squad lines", async () => {
    assert.deepEqual(players.parsePlayerLine("10 Peter Mugisha mf"), { name: "Peter Mugisha", number: 10, position: "MF" });
    assert.deepEqual(players.parsePlayerLine("#7. Ali"), { name: "Ali", number: 7, position: null });
    assert.deepEqual(players.parsePlayerLine("Just A Name"), { name: "Just A Name", number: null, position: null });
    await assert.rejects(players.addPlayers(db, t.Lions, ["9 Someone Else"]), /Shirt number 9 is already worn by John Okello/);
  });

  it("records goals, assists, own goals and cards, and ranks the stats", async () => {
    await matches.addEvent(db, matchId, { type: "goal", teamId: t.Lions, playerId: p["John Okello"], assistId: p["Peter Mugisha"], minute: 12 });
    await matches.addEvent(db, matchId, { type: "goal", teamId: t.Lions, playerId: p["John Okello"], minute: 70 });
    await matches.addEvent(db, matchId, { type: "own_goal", teamId: t.Lions, playerId: p["David Kato"], minute: 80 });
    await matches.addEvent(db, matchId, { type: "goal", teamId: t.Eagles, playerId: p["Ali Hassan"], assistId: p["David Kato"] });
    await matches.addEvent(db, matchId, { type: "yellow", teamId: t.Eagles, playerId: p["David Kato"], minute: 30 });
    await matches.addEvent(db, matchId, { type: "red", teamId: t.Eagles, playerId: p["David Kato"], minute: 85 });
    await matches.addEvent(db, matchId, { type: "yellow", teamId: t.Lions, playerId: p["Peter Mugisha"] });

    const events = await matches.listEvents(db, matchId);
    assert.equal(events.length, 7);
    assert.deepEqual(matches.goalsRecorded(events, (await matches.getMatch(db, matchId))!), { home: 3, away: 1 });

    assert.deepEqual((await players.topScorers(db, seasonId)).map((s) => [s.name, s.count]), [["John Okello", 2], ["Ali Hassan", 1]]);
    assert.deepEqual((await players.topAssists(db, seasonId)).map((s) => [s.name, s.count]), [["David Kato", 1], ["Peter Mugisha", 1]]);
    assert.deepEqual((await players.discipline(db, seasonId)).map((s) => [s.name, s.red, s.yellow]), [["David Kato", 1, 1], ["Peter Mugisha", 0, 1]]);

    const squad = await players.squadWithStats(db, t.Lions);
    assert.deepEqual(squad.map((r) => [r.name, r.goals, r.assists]), [["Sam Ouma", 0, 0], ["John Okello", 2, 0], ["Peter Mugisha", 0, 1]]);

    await assert.rejects(players.deletePlayer(db, p["John Okello"]), /Remove those match events first/);
    await players.deletePlayer(db, p["Sam Ouma"]);
  });

  it("records added time like 90+3 and orders it after the 90th minute", async () => {
    assert.deepEqual(matches.parseMinute("90+3"), { minute: 90, addedMinute: 3 });
    assert.deepEqual(matches.parseMinute(" 45 + 2' "), { minute: 45, addedMinute: 2 });
    assert.deepEqual(matches.parseMinute("37"), { minute: 37, addedMinute: null });
    assert.deepEqual(matches.parseMinute(""), { minute: null, addedMinute: null });
    assert.throws(() => matches.parseMinute("90+"), /90\+3 for added time/);
    assert.throws(() => matches.parseMinute("ninety"), /90\+3 for added time/);
    assert.throws(() => matches.parseMinute("90+0"), /Added time/);
    assert.throws(() => matches.parseMinute("90+45"), /Added time/);
    assert.deepEqual(matches.parseMinute("30+2"), { minute: 30, addedMinute: 2 }); // any minute may have added time

    const goal = (minute: string) =>
      matches.addEvent(db, matchId, { type: "goal", teamId: t.Lions, playerId: p["John Okello"], minute });
    await goal("90+3");
    await goal("90");
    await goal("90+1");
    await goal("88");
    assert.deepEqual(
      (await matches.listEvents(db, matchId)).map((e) => [e.minute, e.addedMinute]),
      [[88, null], [90, null], [90, 1], [90, 3]],
    );
  });

  it("validates events", async () => {
    const add = (e: Partial<matches.EventInput>) => () =>
      matches.addEvent(db, matchId, { type: "goal", teamId: t.Lions, playerId: p["John Okello"], ...e });
    await assert.rejects(add({ playerId: p["Ali Hassan"] }), /isn't in this team's squad/);
    await assert.rejects(add({ type: "own_goal" }), /choose a player from the team that conceded/);
    await assert.rejects(add({ assistId: p["John Okello"] }), /can't assist their own goal/);
    // The database refuses a self-assist too, even when written directly.
    const goal = await matches.addEvent(db, matchId, { type: "goal", teamId: t.Lions, playerId: p["John Okello"] });
    await assert.rejects(db.run("UPDATE match_events SET assist_player_id = player_id WHERE id = ?", [goal]), /no_self_assist/);
    await matches.deleteEvent(db, goal);
    await assert.rejects(add({ assistId: p["Ali Hassan"] }), /must come from the scoring team/);
    await assert.rejects(add({ minute: 200 }), /Minute/);
    await assert.rejects(add({ type: "penalty" }), /Choose what happened/);

    const other = (await league.addTeams(db, seasonId, ["Outsiders"])).find((x) => x.name === "Outsiders")!;
    await assert.rejects(add({ teamId: other.id }), /one of the two teams/);
  });

  it("guards against changing teams once events exist, and deleting a match removes its events", async () => {
    await matches.addEvent(db, matchId, { type: "goal", teamId: t.Lions, playerId: p["John Okello"] });
    const third = (await league.addTeams(db, seasonId, ["Third"])).find((x) => x.name === "Third")!;
    await assert.rejects(matches.updateMatch(db, matchId, { homeTeamId: third.id, awayTeamId: t.Eagles }), /Remove them before changing the teams/);
    await matches.deleteMatch(db, matchId);
    assert.equal((await players.topScorers(db, seasonId)).length, 0);
  });
});
