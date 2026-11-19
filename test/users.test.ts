import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, it } from "node:test";
import * as insights from "../src/lib/insights";
import * as league from "../src/lib/league";
import * as matches from "../src/lib/matches";
import * as players from "../src/lib/players";
import type { Db } from "../src/lib/sql";
import * as users from "../src/lib/users";
import { copySqliteToPostgres } from "../scripts/sqlite/copy";
import { migrate as migrateSqlite } from "../scripts/sqlite/legacy-schema";
import { freshPg } from "./pglite";

/** Runs the old SQLite migrations on `old`, then copies it into an empty Postgres database. */
async function copied(old: DatabaseSync): Promise<Db> {
  const db = await freshPg();
  await copySqliteToPostgres(old, db);
  return db;
}

const fresh = freshPg;

describe("accounts", () => {
  let db: Db;
  beforeEach(async () => { db = await fresh(); });

  it("signs up fans with a username, stores only a password hash, and signs in case-insensitively", async () => {
    const u = await users.signUp(db, { username: "  Joel_A ", name: "  Joel   Ariko ", password: "secret123" });
    assert.deepEqual([u.username, u.name, u.role], ["joel_a", "Joel Ariko", "fan"]);
    const stored = String((await db.get("SELECT password_hash FROM users"))!.password_hash);
    assert.ok(stored.startsWith("scrypt$") && !stored.includes("secret123"));
    assert.equal((await users.authenticate(db, "JOEL_A", "secret123"))?.id, u.id);
    assert.equal((await users.authenticate(db, "joel_a", "wrong-pass")), null);
    assert.equal((await users.authenticate(db, "nobody", "secret123")), null);
  });

  it("display name defaults to the username", async () => {
    assert.equal((await users.signUp(db, { username: "grace", password: "12345678" })).name, "grace");
  });

  it("validates sign-up input", async () => {
    await users.signUp(db, { username: "taken", password: "12345678" });
    await assert.rejects(users.signUp(db, { username: "TAKEN", password: "12345678" }), /is taken/);
    for (const bad of ["ab", "has space", "emoji⚽", "a".repeat(31), "me@mail.com"]) {
      await assert.rejects(users.signUp(db, { username: bad, password: "12345678" }), /3–30 characters/, bad);
    }
    await assert.rejects(users.signUp(db, { username: "okname", password: "short" }), /at least 8/);
  });

  it("npm run admin: creates the one admin, or resets the admin's password", async () => {
    const admin = await users.setUpAdmin(db, "Admin", "firstpass1");
    assert.deepEqual([admin.username, admin.role], ["admin", "admin"]);
    const token = await users.createSession(db, admin.id);
    await users.setUpAdmin(db, "ADMIN", "newpass99"); // same account: password reset
    assert.equal((await users.authenticate(db, "admin", "firstpass1")), null, "old password no longer works");
    assert.ok((await users.authenticate(db, "admin", "newpass99")));
    assert.equal((await users.sessionUser(db, token)), null, "old sign-ins end");
    assert.equal((await users.listUsers(db)).filter((u) => u.role === "admin").length, 1);
  });

  it("there is only ever one admin; --replace hands the role over and the old admin becomes a fan", async () => {
    const first = await users.setUpAdmin(db, "first", "12345678");
    const fan = await users.signUp(db, { username: "fan1", password: "12345678" });
    await assert.rejects(users.setUpAdmin(db, "fan1", "newpass99"), /"first" is already the admin.*--replace/);
    await assert.rejects(users.setUpAdmin(db, "someone_new", "newpass99"), /already the admin/);
    assert.equal((await users.getUser(db, fan.id))!.role, "fan", "refused attempt changed nothing");

    const firstToken = await users.createSession(db, first.id);
    assert.equal((await users.setUpAdmin(db, "fan1", "newpass99", { replace: true })).role, "admin");
    assert.equal((await users.getUser(db, first.id))!.role, "fan");
    assert.equal((await users.sessionUser(db, firstToken)), null, "old admin is signed out");
    assert.equal((await users.getAdmin(db))!.username, "fan1");

    // The database itself refuses a second admin.
    await assert.rejects(db.run("UPDATE users SET role = 'admin' WHERE id = ?", [first.id]), /unique constraint/);
  });

  it("an old SQLite database with several admins keeps only the oldest when copied", async () => {
    const old = new DatabaseSync(":memory:");
    migrateSqlite(old);
    old.exec(`DROP INDEX idx_users_single_admin; DROP INDEX idx_seasons_single_pin; ALTER TABLE seasons DROP COLUMN pinned;
      ALTER TABLE match_events DROP COLUMN added_minute;
      PRAGMA user_version = 5;`); // pretend migrations 6 to 8 haven't run
    const h = users.hashPassword("12345678");
    for (const name of ["oldest", "second", "third"]) {
      old.prepare("INSERT INTO users (username, name, password_hash, role) VALUES (?, ?, ?, 'admin')").run(name, name, h);
    }
    const db = await copied(old);
    assert.deepEqual((await users.listUsers(db)).map((u) => [u.username, u.role]), [["oldest", "admin"], ["second", "fan"], ["third", "fan"]]);
  });

  it("admin CRUD: create, update, reset password and delete fans and officials", async () => {
    const admin = await users.setUpAdmin(db, "boss", "12345678");
    const s = await league.createSeason(db, { name: "S", win: 3, draw: 1, loss: 0, highlightTop: 4, relegation: 0 });
    const [lions] = await league.addTeams(db, s.id, ["Lions"]);

    // Create
    const ref = await users.adminCreateUser(db, admin, { username: "Ref.One", name: "Referee One", password: "refpass123", role: "official", favouriteTeamId: lions.id });
    assert.deepEqual([ref.username, ref.name, ref.role, ref.favouriteTeamId], ["ref.one", "Referee One", "official", lions.id]);
    assert.ok(users.canManageLeague((await users.authenticate(db, "ref.one", "refpass123"))));
    await assert.rejects(users.adminCreateUser(db, admin, { username: "REF.ONE", password: "x12345678" }), /is taken/);
    await assert.rejects(users.adminCreateUser(db, admin, { username: "boss2", password: "x12345678", role: "admin" }), /Fan or Official/);

    // Update (username, name, role, team); demotion signs out
    const token = await users.createSession(db, ref.id);
    const upd = await users.adminUpdateUser(db, admin, ref.id, { username: "ref_1", name: "", role: "fan", favouriteTeamId: "" });
    assert.deepEqual([upd.username, upd.name, upd.role, upd.favouriteTeamId], ["ref_1", "ref_1", "fan", null]);
    assert.equal((await users.sessionUser(db, token)), null, "demoted official signed out");
    assert.ok((await users.authenticate(db, "ref_1", "refpass123")), "password unchanged by edits");
    const fan = await users.signUp(db, { username: "fan", password: "12345678" });
    await assert.rejects(users.adminUpdateUser(db, admin, ref.id, { username: "FAN" }), /is taken/);
    assert.equal((await users.adminUpdateUser(db, admin, fan.id, { username: "fan", role: "official" })).role, "official");

    // Reset password signs out everywhere
    const t2 = await users.createSession(db, fan.id);
    await users.adminResetPassword(db, admin, fan.id, "brandnew1");
    assert.equal((await users.sessionUser(db, t2)), null);
    assert.equal((await users.authenticate(db, "fan", "12345678")), null);
    assert.ok((await users.authenticate(db, "fan", "brandnew1")));
    await assert.rejects(users.adminResetPassword(db, admin, fan.id, "short"), /at least 8/);

    // Delete
    const t3 = await users.createSession(db, fan.id);
    await users.adminDeleteUser(db, admin, fan.id);
    assert.equal((await users.getUser(db, fan.id)), null);
    assert.equal((await users.sessionUser(db, t3)), null, "deleted user's sessions are gone");
    assert.equal((await users.authenticate(db, "fan", "brandnew1")), null);
  });

  it("only the admin can manage users, and the admin account is protected", async () => {
    const admin = await users.setUpAdmin(db, "boss", "12345678");
    const off = await users.adminCreateUser(db, admin, { username: "official", password: "12345678", role: "official" });
    const fan = await users.signUp(db, { username: "fan", password: "12345678" });
    for (const actor of [off, fan]) {
      await assert.rejects(users.adminCreateUser(db, actor, { username: "x_user", password: "12345678" }), /Only the admin/);
      await assert.rejects(users.adminUpdateUser(db, actor, fan.id, { username: "fan", role: "official" }), /Only the admin/);
      await assert.rejects(users.adminResetPassword(db, actor, fan.id, "12345678"), /Only the admin/);
      await assert.rejects(users.adminDeleteUser(db, actor, fan.id), /Only the admin/);
    }
    await assert.rejects(users.adminUpdateUser(db, admin, admin.id, { username: "boss", role: "fan" }), /admin account can't be changed/);
    await assert.rejects(users.adminResetPassword(db, admin, admin.id, "12345678"), /admin account can't be changed/);
    await assert.rejects(users.adminDeleteUser(db, admin, admin.id), /admin account can't be changed/);
    await assert.rejects(users.adminDeleteUser(db, admin, 9999), /not found/);
    assert.equal((await users.getAdmin(db))!.id, admin.id);
  });

  it("sessions: only a hash is stored; expired, signed-out and demoted sessions stop working", async () => {
    const admin = await users.setUpAdmin(db, "boss", "12345678");
    const u = await users.signUp(db, { username: "fan", password: "12345678" });
    const token = await users.createSession(db, u.id);
    assert.equal(Number((await db.get("SELECT COUNT(*) AS n FROM sessions WHERE token_hash = ?", [token]))!.n), 0, "raw token not stored");
    assert.equal((await users.sessionUser(db, token))?.id, u.id);
    assert.equal((await users.sessionUser(db, "made-up-token")), null);
    await users.deleteSession(db, token);
    assert.equal((await users.sessionUser(db, token)), null);
    assert.equal((await users.sessionUser(db, (await users.createSession(db, u.id, -1)))), null, "expired");
    await users.adminUpdateUser(db, admin, u.id, { username: "fan", role: "official" });
    const t2 = await users.createSession(db, u.id);
    await users.adminUpdateUser(db, admin, u.id, { username: "fan", role: "fan" });
    assert.equal((await users.sessionUser(db, t2)), null, "demotion signs the user out");
  });

  it("profile, favourite team and password changes", async () => {
    const s = await league.createSeason(db, { name: "S", win: 3, draw: 1, loss: 0, highlightTop: 4, relegation: 0 });
    const [lions] = await league.addTeams(db, s.id, ["Lions"]);
    const u = await users.signUp(db, { username: "fan", name: "Fan", password: "12345678", favouriteTeamId: lions.id });
    assert.equal(u.favouriteTeamId, lions.id);
    await users.updateProfile(db, u.id, { name: "New Name", favouriteTeamId: "" });
    assert.deepEqual([(await users.getUser(db, u.id))!.name, (await users.getUser(db, u.id))!.favouriteTeamId], ["New Name", null]);
    await assert.rejects(users.updateProfile(db, u.id, { name: "X", favouriteTeamId: 9999 }), /doesn't exist/);
    await assert.rejects(users.changePassword(db, u.id, "wrong", "newpassword"), /current password/);
    await users.changePassword(db, u.id, "12345678", "newpassword");
    assert.ok((await users.authenticate(db, "fan", "newpassword")));
  });

  it("an old SQLite database's email accounts become usernames when copied, and the emails are dropped", async () => {
    const old = new DatabaseSync(":memory:");
    migrateSqlite(old);
    // Rebuild a version-4 users table (email column) with two accounts.
    old.exec(`DROP TABLE sessions; DROP TABLE users; PRAGMA user_version = 4;
      DROP INDEX idx_seasons_single_pin; ALTER TABLE seasons DROP COLUMN pinned; ALTER TABLE match_events DROP COLUMN added_minute;
      CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
        password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'fan', favourite_team_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);`);
    old.prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)").run("Grace.N@Mail.com", "Grace", users.hashPassword("pw123456"), "fan");
    old.prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)").run("grace.n@other.org", "Grace 2", users.hashPassword("pw123456"), "fan");
    const db = await copied(old);
    assert.deepEqual((await users.listUsers(db)).map((u) => u.username).sort(), ["grace.n_1", "grace.n_2"]);
    assert.ok(await users.authenticate(db, "grace.n_1", "pw123456"), "passwords keep working");
    const cols = (await db.all("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'")).map((c) => c.column_name);
    assert.ok(!cols.includes("email"));
  });
});

describe("home page insights", () => {
  it("numbers, records, fair play and a team snapshot", async () => {
    const db = await fresh();
    const s = await league.createSeason(db, { name: "S", win: 3, draw: 1, loss: 0, highlightTop: 2, relegation: 0 });
    await league.addTeams(db, s.id, ["Lions", "Eagles", "Stars"]);
    const t = Object.fromEntries((await league.listTeams(db, s.id)).map((x) => [x.name, x.id]));
    await players.addPlayers(db, t.Lions, ["9 Striker"]);
    await players.addPlayers(db, t.Eagles, ["4 Defender"]);
    const p = { striker: (await players.listPlayers(db, t.Lions))[0].id, defender: (await players.listPlayers(db, t.Eagles))[0].id };
    const m1 = await matches.createMatch(db, s.id, { homeTeamId: t.Lions, awayTeamId: t.Eagles, date: "2026-01-01" });
    const m2 = await matches.createMatch(db, s.id, { homeTeamId: t.Eagles, awayTeamId: t.Stars, date: "2026-01-08" });
    await matches.createMatch(db, s.id, { homeTeamId: t.Stars, awayTeamId: t.Lions, date: "2999-01-01", kickoff: "15:00" });
    await matches.saveResult(db, m1, 4, 0);
    await matches.saveResult(db, m2, 3, 3);
    await matches.addEvent(db, m1, { type: "red", teamId: t.Eagles, playerId: p.defender });
    await matches.addEvent(db, m1, { type: "yellow", teamId: t.Lions, playerId: p.striker });

    const n = await insights.seasonNumbers(db, s.id);
    assert.deepEqual([n.teams, n.players, n.matches, n.played, n.goals, n.goalsPerMatch, n.yellow, n.red], [3, 2, 3, 2, 10, 5, 1, 1]);

    const all = await matches.listMatches(db, s.id);
    const rec = insights.seasonRecords(all);
    assert.equal(rec.biggestWin?.id, m1);
    assert.equal(rec.mostGoals?.id, m2);
    assert.deepEqual(insights.latestResults(all, 5).map((m) => m.id), [m2, m1]);
    assert.equal(insights.upcoming(all, 5).length, 1);

    // Today's match: upcoming before kick-off, not after (until a result is entered).
    const today = await matches.createMatch(db, s.id, { homeTeamId: t.Lions, awayTeamId: t.Stars, date: "2027-03-06", kickoff: "15:00" });
    const at = (hhmm: string) => new Date(`2027-03-06T${hhmm}:00`);
    const fixtures = await matches.listMatches(db, s.id);
    const ids = (d: Date) => insights.upcoming(fixtures, 5, d).map((m) => m.id);
    assert.ok(ids(at("14:59")).includes(today));
    assert.ok(!ids(at("15:00")).includes(today));
    await matches.deleteMatch(db, today);

    assert.deepEqual((await insights.fairPlay(db, s.id)).map((r) => [r.name, r.points]), [["Stars", 0], ["Lions", 1], ["Eagles", 3]]);

    const snap = (await insights.teamSnapshot(db, t.Lions, (await league.getSeason(db, s.id))!))!;
    assert.deepEqual([snap.row?.position, snap.row?.points, snap.last?.id, snap.next?.kickoff], [1, 3, m1, "15:00"]);
  });
});

describe("supabase/reset_data.sql", () => {
  it("deletes every season and its data, keeps accounts (clearing favourite teams), and restarts ids", async () => {
    const db = await fresh();
    const s = await league.createSeason(db, { name: "Old", win: 3, draw: 1, loss: 0, highlightTop: 4, relegation: 0 });
    const [lions, eagles] = await league.addTeams(db, s.id, ["Lions", "Eagles"]);
    await players.addPlayers(db, lions.id, ["9 Striker"]);
    const m = await matches.createMatch(db, s.id, { homeTeamId: lions.id, awayTeamId: eagles.id });
    await matches.addEvent(db, m, { type: "goal", teamId: lions.id, playerId: (await players.listPlayers(db, lions.id))[0].id });
    const fan = await users.signUp(db, { username: "fan", password: "12345678", favouriteTeamId: lions.id });
    const token = await users.createSession(db, fan.id);

    await db.exec(fs.readFileSync(path.join(process.cwd(), "supabase", "reset_data.sql"), "utf8"));

    for (const table of ["seasons", "league_groups", "teams", "playing_dates", "matches", "players", "match_events"]) {
      assert.equal(Number((await db.get(`SELECT COUNT(*) AS n FROM ${table}`))!.n), 0, table);
    }
    assert.equal((await users.getUser(db, fan.id))?.favouriteTeamId, null);
    assert.equal((await users.sessionUser(db, token))?.id, fan.id, "still signed in");
    const again = await league.createSeason(db, { name: "New", win: 3, draw: 1, loss: 0, highlightTop: 4, relegation: 0 });
    assert.equal(again.id, 1);
  });
});

describe("home page season", () => {
  const at = (iso: string) => new Date(`${iso}:00`);
  async function setup() {
    const db = await fresh();
    const mk = async (name: string) => {
      const s = await league.createSeason(db, { name, win: 3, draw: 1, loss: 0, highlightTop: 4, relegation: 0 });
      const [a, b] = await league.addTeams(db, s.id, ["A", "B"]);
      return { id: s.id, a: a.id, b: b.id };
    };
    return { db, mk };
  }

  it("no seasons: nothing to feature; only seasons without matches: the newest", async () => {
    const { db, mk } = await setup();
    assert.equal((await insights.featuredSeason(db)), null);
    await mk("Old");
    const newest = await mk("New");
    assert.deepEqual([(await insights.featuredSeason(db))?.season.id, (await insights.featuredSeason(db))?.reason], [newest.id, "newest"]);
  });

  it("a running season stays featured when a newer, empty season is created", async () => {
    const { db, mk } = await setup();
    const running = await mk("2026");
    await matches.createMatch(db, running.id, { homeTeamId: running.a, awayTeamId: running.b, date: "2026-05-02", kickoff: "15:00" });
    await mk("2027 (no fixtures yet)");
    assert.deepEqual([(await insights.featuredSeason(db, at("2026-05-01T12:00")))?.season.id, (await insights.featuredSeason(db, at("2026-05-01T12:00")))?.reason], [running.id, "next-match"]);
  });

  it("the season with the soonest next match wins; a match that has kicked off no longer counts", async () => {
    const { db, mk } = await setup();
    const league1 = await mk("League");
    const cup = await mk("Cup");
    await matches.createMatch(db, league1.id, { homeTeamId: league1.a, awayTeamId: league1.b, date: "2026-05-02", kickoff: "15:00" });
    await matches.createMatch(db, cup.id, { homeTeamId: cup.a, awayTeamId: cup.b, date: "2026-05-09" });
    assert.equal((await insights.featuredSeason(db, at("2026-05-01T09:00")))?.season.id, league1.id);
    assert.equal((await insights.featuredSeason(db, at("2026-05-02T16:00")))?.season.id, cup.id, "league match kicked off; cup is next");
  });

  it("when nothing is upcoming, the season with the latest result is featured", async () => {
    const { db, mk } = await setup();
    const finished = await mk("Finished");
    const older = await mk("Older");
    const m1 = await matches.createMatch(db, finished.id, { homeTeamId: finished.a, awayTeamId: finished.b, date: "2026-04-20" });
    const m2 = await matches.createMatch(db, older.id, { homeTeamId: older.a, awayTeamId: older.b, date: "2026-03-01" });
    await matches.saveResult(db, m1, 1, 0);
    await matches.saveResult(db, m2, 2, 2);
    assert.deepEqual([(await insights.featuredSeason(db, at("2026-06-01T12:00")))?.season.id, (await insights.featuredSeason(db, at("2026-06-01T12:00")))?.reason], [finished.id, "latest-result"]);
  });

  it("the admin's pin overrides everything; only one pin; unpin returns to automatic; only the admin can pin", async () => {
    const { db, mk } = await setup();
    const running = await mk("Running");
    const other = await mk("Other");
    await matches.createMatch(db, running.id, { homeTeamId: running.a, awayTeamId: running.b, date: "2999-01-01" });
    const admin = await users.setUpAdmin(db, "boss", "12345678");
    const official = await users.adminCreateUser(db, admin, { username: "ref", password: "12345678", role: "official" });

    await assert.rejects(league.setPinnedSeason(db, official, other.id), /Only the admin/);
    await league.setPinnedSeason(db, admin, other.id);
    assert.deepEqual([(await insights.featuredSeason(db))?.season.id, (await insights.featuredSeason(db))?.reason], [other.id, "pinned"]);

    await league.setPinnedSeason(db, admin, running.id); // moving the pin
    assert.deepEqual((await league.listSeasons(db)).filter((s) => s.pinned).map((s) => s.id), [running.id]);
    await assert.rejects(db.run("UPDATE seasons SET pinned = 1 WHERE id = ?", [other.id]), /unique constraint/, "database allows one pin");

    await league.setPinnedSeason(db, admin, null);
    assert.equal((await insights.featuredSeason(db))?.reason, "next-match");

    await league.setPinnedSeason(db, admin, other.id);
    await league.deleteSeason(db, other.id);
    assert.equal((await insights.featuredSeason(db))?.season.id, running.id, "deleting the pinned season falls back to automatic");
    await assert.rejects(league.setPinnedSeason(db, admin, 9999), /Season not found/);
  });
});
