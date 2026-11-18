import { strict as assert } from "node:assert";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, it } from "node:test";
import * as insights from "../src/lib/insights";
import * as league from "../src/lib/league";
import * as matches from "../src/lib/matches";
import * as players from "../src/lib/players";
import { migrate } from "../src/lib/schema";
import * as users from "../src/lib/users";

const fresh = () => { const db = new DatabaseSync(":memory:"); migrate(db); return db; };

describe("accounts", () => {
  let db: DatabaseSync;
  beforeEach(() => { db = fresh(); });

  it("signs up fans with a username, stores only a password hash, and signs in case-insensitively", () => {
    const u = users.signUp(db, { username: "  Joel_A ", name: "  Joel   Ariko ", password: "secret123" });
    assert.deepEqual([u.username, u.name, u.role], ["joel_a", "Joel Ariko", "fan"]);
    const stored = String((db.prepare("SELECT password_hash FROM users").get() as { password_hash: string }).password_hash);
    assert.ok(stored.startsWith("scrypt$") && !stored.includes("secret123"));
    assert.equal(users.authenticate(db, "JOEL_A", "secret123")?.id, u.id);
    assert.equal(users.authenticate(db, "joel_a", "wrong-pass"), null);
    assert.equal(users.authenticate(db, "nobody", "secret123"), null);
  });

  it("display name defaults to the username", () => {
    assert.equal(users.signUp(db, { username: "grace", password: "12345678" }).name, "grace");
  });

  it("validates sign-up input", () => {
    users.signUp(db, { username: "taken", password: "12345678" });
    assert.throws(() => users.signUp(db, { username: "TAKEN", password: "12345678" }), /is taken/);
    for (const bad of ["ab", "has space", "emoji⚽", "a".repeat(31), "me@mail.com"]) {
      assert.throws(() => users.signUp(db, { username: bad, password: "12345678" }), /3–30 characters/, bad);
    }
    assert.throws(() => users.signUp(db, { username: "okname", password: "short" }), /at least 8/);
  });

  it("npm run admin: creates the one admin, or resets the admin's password", () => {
    const admin = users.setUpAdmin(db, "Admin", "firstpass1");
    assert.deepEqual([admin.username, admin.role], ["admin", "admin"]);
    const token = users.createSession(db, admin.id);
    users.setUpAdmin(db, "ADMIN", "newpass99"); // same account: password reset
    assert.equal(users.authenticate(db, "admin", "firstpass1"), null, "old password no longer works");
    assert.ok(users.authenticate(db, "admin", "newpass99"));
    assert.equal(users.sessionUser(db, token), null, "old sign-ins end");
    assert.equal(users.listUsers(db).filter((u) => u.role === "admin").length, 1);
  });

  it("there is only ever one admin; --replace hands the role over and the old admin becomes a fan", () => {
    const first = users.setUpAdmin(db, "first", "12345678");
    const fan = users.signUp(db, { username: "fan1", password: "12345678" });
    assert.throws(() => users.setUpAdmin(db, "fan1", "newpass99"), /"first" is already the admin.*--replace/);
    assert.throws(() => users.setUpAdmin(db, "someone_new", "newpass99"), /already the admin/);
    assert.equal(users.getUser(db, fan.id)!.role, "fan", "refused attempt changed nothing");

    const firstToken = users.createSession(db, first.id);
    assert.equal(users.setUpAdmin(db, "fan1", "newpass99", { replace: true }).role, "admin");
    assert.equal(users.getUser(db, first.id)!.role, "fan");
    assert.equal(users.sessionUser(db, firstToken), null, "old admin is signed out");
    assert.equal(users.getAdmin(db)!.username, "fan1");

    // The database itself refuses a second admin.
    assert.throws(() => db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(first.id), /UNIQUE/);
  });

  it("migration keeps only the oldest admin if a database had several", () => {
    const old = new DatabaseSync(":memory:");
    migrate(old);
    old.exec(`DROP INDEX idx_users_single_admin; DROP INDEX idx_seasons_single_pin; ALTER TABLE seasons DROP COLUMN pinned;
      PRAGMA user_version = 5;`); // pretend migrations 6 and 7 haven't run
    const h = users.hashPassword("12345678");
    for (const name of ["oldest", "second", "third"]) {
      old.prepare("INSERT INTO users (username, name, password_hash, role) VALUES (?, ?, ?, 'admin')").run(name, name, h);
    }
    migrate(old);
    assert.deepEqual(users.listUsers(old).map((u) => [u.username, u.role]), [["oldest", "admin"], ["second", "fan"], ["third", "fan"]]);
  });

  it("admin CRUD: create, update, reset password and delete fans and officials", () => {
    const admin = users.setUpAdmin(db, "boss", "12345678");
    const s = league.createSeason(db, { name: "S", win: 3, draw: 1, loss: 0, highlightTop: 4, relegation: 0 });
    const [lions] = league.addTeams(db, s.id, ["Lions"]);

    // Create
    const ref = users.adminCreateUser(db, admin, { username: "Ref.One", name: "Referee One", password: "refpass123", role: "official", favouriteTeamId: lions.id });
    assert.deepEqual([ref.username, ref.name, ref.role, ref.favouriteTeamId], ["ref.one", "Referee One", "official", lions.id]);
    assert.ok(users.canManageLeague(users.authenticate(db, "ref.one", "refpass123")));
    assert.throws(() => users.adminCreateUser(db, admin, { username: "REF.ONE", password: "x12345678" }), /is taken/);
    assert.throws(() => users.adminCreateUser(db, admin, { username: "boss2", password: "x12345678", role: "admin" }), /Fan or Official/);

    // Update (username, name, role, team); demotion signs out
    const token = users.createSession(db, ref.id);
    const upd = users.adminUpdateUser(db, admin, ref.id, { username: "ref_1", name: "", role: "fan", favouriteTeamId: "" });
    assert.deepEqual([upd.username, upd.name, upd.role, upd.favouriteTeamId], ["ref_1", "ref_1", "fan", null]);
    assert.equal(users.sessionUser(db, token), null, "demoted official signed out");
    assert.ok(users.authenticate(db, "ref_1", "refpass123"), "password unchanged by edits");
    const fan = users.signUp(db, { username: "fan", password: "12345678" });
    assert.throws(() => users.adminUpdateUser(db, admin, ref.id, { username: "FAN" }), /is taken/);
    assert.equal(users.adminUpdateUser(db, admin, fan.id, { username: "fan", role: "official" }).role, "official");

    // Reset password signs out everywhere
    const t2 = users.createSession(db, fan.id);
    users.adminResetPassword(db, admin, fan.id, "brandnew1");
    assert.equal(users.sessionUser(db, t2), null);
    assert.equal(users.authenticate(db, "fan", "12345678"), null);
    assert.ok(users.authenticate(db, "fan", "brandnew1"));
    assert.throws(() => users.adminResetPassword(db, admin, fan.id, "short"), /at least 8/);

    // Delete
    const t3 = users.createSession(db, fan.id);
    users.adminDeleteUser(db, admin, fan.id);
    assert.equal(users.getUser(db, fan.id), null);
    assert.equal(users.sessionUser(db, t3), null, "deleted user's sessions are gone");
    assert.equal(users.authenticate(db, "fan", "brandnew1"), null);
  });

  it("only the admin can manage users, and the admin account is protected", () => {
    const admin = users.setUpAdmin(db, "boss", "12345678");
    const off = users.adminCreateUser(db, admin, { username: "official", password: "12345678", role: "official" });
    const fan = users.signUp(db, { username: "fan", password: "12345678" });
    for (const actor of [off, fan]) {
      assert.throws(() => users.adminCreateUser(db, actor, { username: "x_user", password: "12345678" }), /Only the admin/);
      assert.throws(() => users.adminUpdateUser(db, actor, fan.id, { username: "fan", role: "official" }), /Only the admin/);
      assert.throws(() => users.adminResetPassword(db, actor, fan.id, "12345678"), /Only the admin/);
      assert.throws(() => users.adminDeleteUser(db, actor, fan.id), /Only the admin/);
    }
    assert.throws(() => users.adminUpdateUser(db, admin, admin.id, { username: "boss", role: "fan" }), /admin account can't be changed/);
    assert.throws(() => users.adminResetPassword(db, admin, admin.id, "12345678"), /admin account can't be changed/);
    assert.throws(() => users.adminDeleteUser(db, admin, admin.id), /admin account can't be changed/);
    assert.throws(() => users.adminDeleteUser(db, admin, 9999), /not found/);
    assert.equal(users.getAdmin(db)!.id, admin.id);
  });

  it("sessions: only a hash is stored; expired, signed-out and demoted sessions stop working", () => {
    const admin = users.setUpAdmin(db, "boss", "12345678");
    const u = users.signUp(db, { username: "fan", password: "12345678" });
    const token = users.createSession(db, u.id);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE token_hash = ?").get(token)!.n, 0, "raw token not stored");
    assert.equal(users.sessionUser(db, token)?.id, u.id);
    assert.equal(users.sessionUser(db, "made-up-token"), null);
    users.deleteSession(db, token);
    assert.equal(users.sessionUser(db, token), null);
    assert.equal(users.sessionUser(db, users.createSession(db, u.id, -1)), null, "expired");
    users.adminUpdateUser(db, admin, u.id, { username: "fan", role: "official" });
    const t2 = users.createSession(db, u.id);
    users.adminUpdateUser(db, admin, u.id, { username: "fan", role: "fan" });
    assert.equal(users.sessionUser(db, t2), null, "demotion signs the user out");
  });

  it("profile, favourite team and password changes", () => {
    const s = league.createSeason(db, { name: "S", win: 3, draw: 1, loss: 0, highlightTop: 4, relegation: 0 });
    const [lions] = league.addTeams(db, s.id, ["Lions"]);
    const u = users.signUp(db, { username: "fan", name: "Fan", password: "12345678", favouriteTeamId: lions.id });
    assert.equal(u.favouriteTeamId, lions.id);
    users.updateProfile(db, u.id, { name: "New Name", favouriteTeamId: "" });
    assert.deepEqual([users.getUser(db, u.id)!.name, users.getUser(db, u.id)!.favouriteTeamId], ["New Name", null]);
    assert.throws(() => users.updateProfile(db, u.id, { name: "X", favouriteTeamId: 9999 }), /doesn't exist/);
    assert.throws(() => users.changePassword(db, u.id, "wrong", "newpassword"), /current password/);
    users.changePassword(db, u.id, "12345678", "newpassword");
    assert.ok(users.authenticate(db, "fan", "newpassword"));
  });

  it("migration turns old email accounts into usernames and drops the emails", () => {
    const old = new DatabaseSync(":memory:");
    migrate(old);
    // Rebuild a version-4 users table (email column) with two accounts.
    old.exec(`DROP TABLE sessions; DROP TABLE users; PRAGMA user_version = 4;
      DROP INDEX idx_seasons_single_pin; ALTER TABLE seasons DROP COLUMN pinned;
      CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
        password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'fan', favourite_team_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);`);
    old.prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)").run("Grace.N@Mail.com", "Grace", users.hashPassword("pw123456"), "fan");
    old.prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)").run("grace.n@other.org", "Grace 2", users.hashPassword("pw123456"), "fan");
    migrate(old);
    assert.deepEqual(users.listUsers(old).map((u) => u.username).sort(), ["grace.n_1", "grace.n_2"]);
    assert.ok(users.authenticate(old, "grace.n_1", "pw123456"), "passwords keep working");
    const cols = old.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
    assert.ok(!cols.includes("email"));
  });
});

describe("home page insights", () => {
  it("numbers, records, fair play and a team snapshot", () => {
    const db = fresh();
    const s = league.createSeason(db, { name: "S", win: 3, draw: 1, loss: 0, highlightTop: 2, relegation: 0 });
    league.addTeams(db, s.id, ["Lions", "Eagles", "Stars"]);
    const t = Object.fromEntries(league.listTeams(db, s.id).map((x) => [x.name, x.id]));
    players.addPlayers(db, t.Lions, ["9 Striker"]);
    players.addPlayers(db, t.Eagles, ["4 Defender"]);
    const p = { striker: players.listPlayers(db, t.Lions)[0].id, defender: players.listPlayers(db, t.Eagles)[0].id };
    const m1 = matches.createMatch(db, s.id, { homeTeamId: t.Lions, awayTeamId: t.Eagles, date: "2026-01-01" });
    const m2 = matches.createMatch(db, s.id, { homeTeamId: t.Eagles, awayTeamId: t.Stars, date: "2026-01-08" });
    matches.createMatch(db, s.id, { homeTeamId: t.Stars, awayTeamId: t.Lions, date: "2999-01-01", kickoff: "15:00" });
    matches.saveResult(db, m1, 4, 0);
    matches.saveResult(db, m2, 3, 3);
    matches.addEvent(db, m1, { type: "red", teamId: t.Eagles, playerId: p.defender });
    matches.addEvent(db, m1, { type: "yellow", teamId: t.Lions, playerId: p.striker });

    const n = insights.seasonNumbers(db, s.id);
    assert.deepEqual([n.teams, n.players, n.matches, n.played, n.goals, n.goalsPerMatch, n.yellow, n.red], [3, 2, 3, 2, 10, 5, 1, 1]);

    const all = matches.listMatches(db, s.id);
    const rec = insights.seasonRecords(all);
    assert.equal(rec.biggestWin?.id, m1);
    assert.equal(rec.mostGoals?.id, m2);
    assert.deepEqual(insights.latestResults(all, 5).map((m) => m.id), [m2, m1]);
    assert.equal(insights.upcoming(all, 5).length, 1);

    // Today's match: upcoming before kick-off, not after (until a result is entered).
    const today = matches.createMatch(db, s.id, { homeTeamId: t.Lions, awayTeamId: t.Stars, date: "2027-03-06", kickoff: "15:00" });
    const at = (hhmm: string) => new Date(`2027-03-06T${hhmm}:00`);
    const ids = (d: Date) => insights.upcoming(matches.listMatches(db, s.id), 5, d).map((m) => m.id);
    assert.ok(ids(at("14:59")).includes(today));
    assert.ok(!ids(at("15:00")).includes(today));
    matches.deleteMatch(db, today);

    assert.deepEqual(insights.fairPlay(db, s.id).map((r) => [r.name, r.points]), [["Stars", 0], ["Lions", 1], ["Eagles", 3]]);

    const snap = insights.teamSnapshot(db, t.Lions, league.getSeason(db, s.id)!)!;
    assert.deepEqual([snap.row?.position, snap.row?.points, snap.last?.id, snap.next?.kickoff], [1, 3, m1, "15:00"]);
  });
});

describe("home page season", () => {
  const at = (iso: string) => new Date(`${iso}:00`);
  function setup() {
    const db = fresh();
    const mk = (name: string) => {
      const s = league.createSeason(db, { name, win: 3, draw: 1, loss: 0, highlightTop: 4, relegation: 0 });
      const [a, b] = league.addTeams(db, s.id, ["A", "B"]);
      return { id: s.id, a: a.id, b: b.id };
    };
    return { db, mk };
  }

  it("no seasons: nothing to feature; only seasons without matches: the newest", () => {
    const { db, mk } = setup();
    assert.equal(insights.featuredSeason(db), null);
    mk("Old");
    const newest = mk("New");
    assert.deepEqual([insights.featuredSeason(db)?.season.id, insights.featuredSeason(db)?.reason], [newest.id, "newest"]);
  });

  it("a running season stays featured when a newer, empty season is created", () => {
    const { db, mk } = setup();
    const running = mk("2026");
    matches.createMatch(db, running.id, { homeTeamId: running.a, awayTeamId: running.b, date: "2026-05-02", kickoff: "15:00" });
    mk("2027 (no fixtures yet)");
    assert.deepEqual([insights.featuredSeason(db, at("2026-05-01T12:00"))?.season.id, insights.featuredSeason(db, at("2026-05-01T12:00"))?.reason], [running.id, "next-match"]);
  });

  it("the season with the soonest next match wins; a match that has kicked off no longer counts", () => {
    const { db, mk } = setup();
    const league1 = mk("League");
    const cup = mk("Cup");
    matches.createMatch(db, league1.id, { homeTeamId: league1.a, awayTeamId: league1.b, date: "2026-05-02", kickoff: "15:00" });
    matches.createMatch(db, cup.id, { homeTeamId: cup.a, awayTeamId: cup.b, date: "2026-05-09" });
    assert.equal(insights.featuredSeason(db, at("2026-05-01T09:00"))?.season.id, league1.id);
    assert.equal(insights.featuredSeason(db, at("2026-05-02T16:00"))?.season.id, cup.id, "league match kicked off; cup is next");
  });

  it("when nothing is upcoming, the season with the latest result is featured", () => {
    const { db, mk } = setup();
    const finished = mk("Finished");
    const older = mk("Older");
    const m1 = matches.createMatch(db, finished.id, { homeTeamId: finished.a, awayTeamId: finished.b, date: "2026-04-20" });
    const m2 = matches.createMatch(db, older.id, { homeTeamId: older.a, awayTeamId: older.b, date: "2026-03-01" });
    matches.saveResult(db, m1, 1, 0);
    matches.saveResult(db, m2, 2, 2);
    assert.deepEqual([insights.featuredSeason(db, at("2026-06-01T12:00"))?.season.id, insights.featuredSeason(db, at("2026-06-01T12:00"))?.reason], [finished.id, "latest-result"]);
  });

  it("the admin's pin overrides everything; only one pin; unpin returns to automatic; only the admin can pin", () => {
    const { db, mk } = setup();
    const running = mk("Running");
    const other = mk("Other");
    matches.createMatch(db, running.id, { homeTeamId: running.a, awayTeamId: running.b, date: "2999-01-01" });
    const admin = users.setUpAdmin(db, "boss", "12345678");
    const official = users.adminCreateUser(db, admin, { username: "ref", password: "12345678", role: "official" });

    assert.throws(() => league.setPinnedSeason(db, official, other.id), /Only the admin/);
    league.setPinnedSeason(db, admin, other.id);
    assert.deepEqual([insights.featuredSeason(db)?.season.id, insights.featuredSeason(db)?.reason], [other.id, "pinned"]);

    league.setPinnedSeason(db, admin, running.id); // moving the pin
    assert.deepEqual(league.listSeasons(db).filter((s) => s.pinned).map((s) => s.id), [running.id]);
    assert.throws(() => db.prepare("UPDATE seasons SET pinned = 1 WHERE id = ?").run(other.id), /UNIQUE/, "database allows one pin");

    league.setPinnedSeason(db, admin, null);
    assert.equal(insights.featuredSeason(db)?.reason, "next-match");

    league.setPinnedSeason(db, admin, other.id);
    league.deleteSeason(db, other.id);
    assert.equal(insights.featuredSeason(db)?.season.id, running.id, "deleting the pinned season falls back to automatic");
    assert.throws(() => league.setPinnedSeason(db, admin, 9999), /Season not found/);
  });
});
