import { strict as assert } from "node:assert";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, it } from "node:test";
import * as insights from "../src/lib/insights";
import * as league from "../src/lib/league";
import * as matches from "../src/lib/matches";
import * as players from "../src/lib/players";
import { migrate } from "../src/lib/schema";
import * as users from "../src/lib/users";

const ADMINS = ["boss@example.com"];
const fresh = () => { const db = new DatabaseSync(":memory:"); migrate(db); return db; };

describe("accounts", () => {
  let db: DatabaseSync;
  beforeEach(() => { db = fresh(); });

  it("signs up fans, stores only a password hash, and signs in with tidy emails", () => {
    const u = users.signUp(db, { name: "  Joel   Ariko ", email: " Fan@Example.com ", password: "secret123" }, ADMINS);
    assert.deepEqual([u.name, u.email, u.role], ["Joel Ariko", "fan@example.com", "fan"]);
    const stored = String((db.prepare("SELECT password_hash FROM users").get() as { password_hash: string }).password_hash);
    assert.ok(stored.startsWith("scrypt$") && !stored.includes("secret123"));
    assert.equal(users.authenticate(db, "FAN@example.com ", "secret123", ADMINS)?.id, u.id);
    assert.equal(users.authenticate(db, "fan@example.com", "wrong-pass", ADMINS), null);
    assert.equal(users.authenticate(db, "nobody@example.com", "secret123", ADMINS), null);
  });

  it("validates sign-up input", () => {
    users.signUp(db, { name: "A", email: "a@example.com", password: "12345678" });
    assert.throws(() => users.signUp(db, { name: "B", email: "A@EXAMPLE.com", password: "12345678" }), /already exists/);
    assert.throws(() => users.signUp(db, { name: "B", email: "not-an-email", password: "12345678" }), /valid email/);
    assert.throws(() => users.signUp(db, { name: "B", email: "b@example.com", password: "short" }), /at least 8/);
    assert.throws(() => users.signUp(db, { name: "  ", email: "b@example.com", password: "12345678" }), /Name is required/);
  });

  it("makes the ADMIN_EMAIL account admin, at sign-up or at a later sign-in", () => {
    assert.equal(users.signUp(db, { name: "Boss", email: "BOSS@example.com", password: "12345678" }, ADMINS).role, "admin");
    const db2 = fresh();
    users.signUp(db2, { name: "Early", email: "boss@example.com", password: "12345678" }, []); // before ADMIN_EMAIL was set
    assert.equal(users.authenticate(db2, "boss@example.com", "12345678", ADMINS)?.role, "admin");
  });

  it("only the admin promotes officials; the admin role can't be changed or self-granted", () => {
    const admin = users.signUp(db, { name: "Boss", email: "boss@example.com", password: "12345678" }, ADMINS);
    const fan = users.signUp(db, { name: "Fan", email: "fan@example.com", password: "12345678" }, ADMINS);
    assert.equal(users.setRole(db, admin, fan.id, "official").role, "official");
    assert.ok(users.canManageLeague(users.getUser(db, fan.id)));
    const official = users.getUser(db, fan.id)!;
    assert.throws(() => users.setRole(db, official, fan.id, "fan"), /Only the admin/);
    assert.throws(() => users.setRole(db, admin, fan.id, "admin"), /Choose Fan or Official/);
    assert.throws(() => users.setRole(db, admin, admin.id, "fan"), /admin's role can't be changed/);
  });

  it("sessions: only a hash is stored; expired, signed-out and demoted sessions stop working", () => {
    const admin = users.signUp(db, { name: "Boss", email: "boss@example.com", password: "12345678" }, ADMINS);
    const u = users.signUp(db, { name: "Fan", email: "fan@example.com", password: "12345678" });
    const token = users.createSession(db, u.id);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE token_hash = ?").get(token)!.n, 0, "raw token not stored");
    assert.equal(users.sessionUser(db, token)?.id, u.id);
    assert.equal(users.sessionUser(db, "made-up-token"), null);
    users.deleteSession(db, token);
    assert.equal(users.sessionUser(db, token), null);

    const old = users.createSession(db, u.id, -1);
    assert.equal(users.sessionUser(db, old), null, "expired");

    users.setRole(db, admin, u.id, "official");
    const t2 = users.createSession(db, u.id);
    users.setRole(db, admin, u.id, "fan");
    assert.equal(users.sessionUser(db, t2), null, "demotion signs the user out");
  });

  it("profile, favourite team and password changes", () => {
    const s = league.createSeason(db, { name: "S", win: 3, draw: 1, loss: 0, highlightTop: 4, relegation: 0 });
    const [lions] = league.addTeams(db, s.id, ["Lions"]);
    const u = users.signUp(db, { name: "Fan", email: "fan@example.com", password: "12345678", favouriteTeamId: lions.id });
    assert.equal(u.favouriteTeamId, lions.id);
    users.updateProfile(db, u.id, { name: "New Name", favouriteTeamId: "" });
    assert.deepEqual([users.getUser(db, u.id)!.name, users.getUser(db, u.id)!.favouriteTeamId], ["New Name", null]);
    assert.throws(() => users.updateProfile(db, u.id, { name: "X", favouriteTeamId: 9999 }), /doesn't exist/);
    assert.throws(() => users.changePassword(db, u.id, "wrong", "newpassword"), /current password/);
    users.changePassword(db, u.id, "12345678", "newpassword");
    assert.ok(users.authenticate(db, "fan@example.com", "newpassword"));
    league.removeTeam(db, lions.id);
    users.updateProfile(db, u.id, { name: "X", favouriteTeamId: "" });
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
