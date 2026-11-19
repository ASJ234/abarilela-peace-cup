import { strict as assert } from "node:assert";
import { beforeEach, describe, it } from "node:test";
import { PDFDocument } from "pdf-lib";
import * as league from "../src/lib/league";
import * as matches from "../src/lib/matches";
import { fixturesPdf, pdfSafe } from "../src/lib/pdf";
import * as players from "../src/lib/players";
import type { Db } from "../src/lib/sql";
import { freshPg } from "./pglite";

async function setUp(db: Db) {
  const s = await league.createSeason(db, { name: "Cup", win: 3, draw: 1, loss: 0, highlightTop: 4, relegation: 0 });
  const [eagles, lions] = await league.addTeams(db, s.id, ["Eagles", "Lions"]);
  const squad = await players.addPlayers(db, lions.id, ["9 Striker", "7 Winger"]);
  const striker = squad.find((p) => p.name === "Striker")!;
  const winger = squad.find((p) => p.name === "Winger")!;
  const [keeper] = await players.addPlayers(db, eagles.id, ["1 Keeper"]);
  const matchId = await matches.createMatch(db, s.id, { homeTeamId: lions.id, awayTeamId: eagles.id, date: "2026-12-05", referee: " Ref  One " });
  return { s, lions, eagles, striker, winger, keeper, matchId };
}

describe("penalties, coaches' cards and referees", () => {
  let db: Db;
  beforeEach(async () => { db = await freshPg(); });

  it("records a penalty goal (no assist), shows it in the timeline and counts it in the scorers' penalties", async () => {
    const { s, lions, striker, winger, matchId } = await setUp(db);
    await matches.addEvent(db, matchId, { type: "goal", teamId: lions.id, playerId: striker.id, penalty: "on", assistId: winger.id, minute: "12" });
    await matches.addEvent(db, matchId, { type: "goal", teamId: lions.id, playerId: striker.id, assistId: winger.id, minute: "50" });

    const [pen, open] = await matches.listEvents(db, matchId);
    assert.deepEqual([pen.penalty, pen.assist], [true, null], "a penalty has no assist");
    assert.deepEqual([open.penalty, open.assist?.id], [false, winger.id]);
    const [top] = await players.topScorers(db, s.id);
    assert.deepEqual([top.name, top.count, top.penalties], ["Striker", 2, 1]);
    assert.equal((await players.topAssists(db, s.id))[0].count, 1);
  });

  it("only a goal can be a penalty", async () => {
    const { lions, striker, matchId } = await setUp(db);
    await matches.addEvent(db, matchId, { type: "yellow", teamId: lions.id, playerId: striker.id, penalty: "on" });
    assert.equal((await matches.listEvents(db, matchId))[0].penalty, false);
    await assert.rejects(db.run("UPDATE match_events SET penalty = true"), /penalty_check/, "the database refuses it too");
  });

  it("gives a card to a coach, using the team's saved coach or a typed name, kept separate from player stats", async () => {
    const { s, lions, eagles, matchId } = await setUp(db);
    await league.setTeamCoach(db, lions.id, "  Coach   Okello ");
    assert.equal((await league.getTeam(db, lions.id))?.coach, "Coach Okello");

    await matches.addEvent(db, matchId, { type: "yellow", teamId: lions.id, playerId: matches.COACH, minute: "30" });
    await matches.addEvent(db, matchId, { type: "red", teamId: eagles.id, playerId: matches.COACH, coachName: "Mary Akello" });
    // Eagles have no saved coach, so a name must be typed.
    await assert.rejects(
      matches.addEvent(db, matchId, { type: "yellow", teamId: eagles.id, playerId: matches.COACH, coachName: " " }),
      /Enter the coach's name/,
    );
    await assert.rejects(matches.addEvent(db, matchId, { type: "goal", teamId: lions.id, playerId: matches.COACH }), /Only a card/);

    const events = await matches.listEvents(db, matchId);
    assert.deepEqual(events.map((e) => [e.type, e.player, e.coach]), [["yellow", null, "Coach Okello"], ["red", null, "Mary Akello"]]);
    assert.equal((await players.discipline(db, s.id)).length, 0, "coaches aren't in the players' discipline table");
    assert.deepEqual(
      (await players.coachCards(db, s.id)).map((c) => [c.name, c.teamName, c.yellow, c.red]),
      [["Mary Akello", "Eagles", 0, 1], ["Coach Okello", "Lions", 1, 0]],
    );
    assert.deepEqual(goals(await matches.getMatch(db, matchId), events), { home: 0, away: 0 }, "cards aren't goals");

    // The card keeps the coach's name even after the team changes coach.
    await league.setTeamCoach(db, lions.id, "New Coach");
    assert.equal((await matches.listEvents(db, matchId))[0].coach, "Coach Okello");
  });

  it("stores the referee, and the referee can still be set after the match is played", async () => {
    const { lions, eagles, matchId } = await setUp(db);
    assert.equal((await matches.getMatch(db, matchId))?.referee, "Ref One");
    await matches.saveResult(db, matchId, 2, 1);
    await assert.rejects(matches.updateMatch(db, matchId, { homeTeamId: lions.id, awayTeamId: eagles.id, referee: "X" }), /already been played/);
    await matches.setReferee(db, matchId, "Ref Two");
    assert.equal((await matches.getMatch(db, matchId))?.referee, "Ref Two");
    await matches.setReferee(db, matchId, "");
    assert.equal((await matches.getMatch(db, matchId))?.referee, null);
  });

  it("makes a fixtures PDF per team, even with characters Helvetica can't draw", async () => {
    const { s, lions, matchId } = await setUp(db);
    await matches.saveResult(db, matchId, 3, 1);
    await league.renameTeam(db, lions.id, "Lions ⚽ Ünited");
    const ms = await matches.listMatches(db, s.id, { teamId: lions.id });
    // Enough matches to need a second page.
    const many = Array.from({ length: 24 }, (_, i) => ({ ...ms[0], id: 100 + i, played: false, homeScore: null, awayScore: null }));
    const bytes = await fixturesPdf({
      seasonName: "Cup 2026",
      generatedOn: "Thu 19 Nov 2026",
      teams: [{ teamId: lions.id, team: { name: "Lions ⚽ Ünited", coach: "Ōkello" }, groupName: null, matches: [...ms, ...many] }],
    });
    const head = Buffer.from(bytes.slice(0, 5)).toString("latin1");
    assert.equal(head, "%PDF-");
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 2, "long lists continue on a second page");
    assert.equal(pdfSafe("Lions ⚽ Ünited – Ōkello"), "Lions ? Ünited – Okello");

    // Every team's fixtures: 12 teams with 2 matches each share pages instead of one page each.
    const twelve = Array.from({ length: 12 }, (_, i) => ({
      teamId: lions.id, team: { name: `Team ${i + 1}`, coach: null }, groupName: "Group A", matches: ms.slice(0, 1).concat(ms.slice(0, 1)),
    }));
    const all = await PDFDocument.load(await fixturesPdf({ seasonName: "Cup 2026", generatedOn: "today", teams: twelve }));
    assert.ok(all.getPageCount() <= 4, `${all.getPageCount()} pages`);
    assert.equal(all.getTitle(), "Cup 2026 fixtures by team");
  });
});

function goals(m: Awaited<ReturnType<typeof matches.getMatch>>, events: Awaited<ReturnType<typeof matches.listEvents>>) {
  return matches.goalsRecorded(events, m!);
}
