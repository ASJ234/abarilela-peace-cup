import { strict as assert } from "node:assert";
import { beforeEach, describe, it } from "node:test";
import * as league from "../src/lib/league";
import * as matches from "../src/lib/matches";
import * as players from "../src/lib/players";
import type { Db } from "../src/lib/sql";
import { matchTimeline } from "../src/lib/types";
import { freshPg } from "./pglite";

async function setUp(db: Db) {
  const s = await league.createSeason(db, { name: "Cup", win: 3, draw: 1, loss: 0, highlightTop: 4, relegation: 0 });
  const [eagles, lions] = await league.addTeams(db, s.id, ["Eagles", "Lions"]);
  const squad = await players.addPlayers(db, lions.id, ["9 Striker", "7 Winger"]);
  const striker = squad.find((p) => p.name === "Striker")!;
  const winger = squad.find((p) => p.name === "Winger")!;
  const matchId = await matches.createMatch(db, s.id, { homeTeamId: lions.id, awayTeamId: eagles.id, date: "2026-12-05" });
  return { s, lions, eagles, striker, winger, matchId };
}

describe("second yellow card", () => {
  let db: Db;
  beforeEach(async () => { db = await freshPg(); });

  it("records the red card with a second yellow and shows them as one timeline row", async () => {
    const { s, lions, striker, winger, matchId } = await setUp(db);
    await matches.addEvent(db, matchId, { type: "yellow", teamId: lions.id, playerId: striker.id, minute: "20" });
    await matches.addEvent(db, matchId, { type: "yellow", teamId: lions.id, playerId: winger.id, minute: "30" });
    await matches.addEvent(db, matchId, { type: "yellow", teamId: lions.id, playerId: striker.id, minute: "90+2" });

    const events = await matches.listEvents(db, matchId);
    assert.deepEqual(events.map((e) => e.type), ["yellow", "yellow", "yellow", "red"]);
    const red = events[3];
    assert.deepEqual([red.player?.id, red.minute, red.addedMinute], [striker.id, 90, 2], "the red is at the same minute");

    const timeline = matchTimeline(events);
    assert.deepEqual(
      timeline.map((x) => [x.event.player?.name, x.secondYellow, x.red?.id ?? null]),
      [["Striker", false, null], ["Winger", false, null], ["Striker", true, red.id]],
    );
    const [card] = await players.discipline(db, s.id);
    assert.deepEqual([card.name, card.yellow, card.red], ["Striker", 2, 1], "the sending-off counts in the stats");
  });

  it("refuses more cards for someone already sent off", async () => {
    const { lions, striker, winger, matchId } = await setUp(db);
    await matches.addEvent(db, matchId, { type: "yellow", teamId: lions.id, playerId: striker.id });
    await matches.addEvent(db, matchId, { type: "yellow", teamId: lions.id, playerId: striker.id });
    await assert.rejects(matches.addEvent(db, matchId, { type: "yellow", teamId: lions.id, playerId: striker.id }), /already been sent off/);
    await matches.addEvent(db, matchId, { type: "red", teamId: lions.id, playerId: winger.id });
    await assert.rejects(matches.addEvent(db, matchId, { type: "yellow", teamId: lions.id, playerId: winger.id }), /already been sent off/);
  });

  it("removes the red card together with the second yellow", async () => {
    const { lions, striker, matchId } = await setUp(db);
    await matches.addEvent(db, matchId, { type: "yellow", teamId: lions.id, playerId: striker.id, minute: "10" });
    const second = await matches.addEvent(db, matchId, { type: "yellow", teamId: lions.id, playerId: striker.id, minute: "60" });
    await matches.deleteEvent(db, second);
    const left = await matches.listEvents(db, matchId);
    assert.deepEqual(left.map((e) => [e.type, e.minute]), [["yellow", 10]]);
  });

  it("pairs a coach's second yellow with their red too", async () => {
    const { eagles, matchId } = await setUp(db);
    const coach = { type: "yellow", teamId: eagles.id, playerId: matches.COACH, coachName: "Mary Akello" };
    await matches.addEvent(db, matchId, coach);
    await matches.addEvent(db, matchId, coach);
    const timeline = matchTimeline(await matches.listEvents(db, matchId));
    assert.deepEqual(timeline.map((x) => [x.event.coach, x.secondYellow, x.red != null]), [["Mary Akello", false, false], ["Mary Akello", true, true]]);
  });
});
