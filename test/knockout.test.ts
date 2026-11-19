import { strict as assert } from "node:assert";
import { beforeEach, describe, it } from "node:test";
import * as knockout from "../src/lib/knockout";
import * as league from "../src/lib/league";
import * as matches from "../src/lib/matches";
import type { Db } from "../src/lib/sql";
import { freshPg } from "./pglite";

/** A table whose teams are named after their place, e.g. group "Group B" → B1, B2… */
const table = (letter: string, size: number): knockout.TableForDraw => ({
  name: `Group ${letter}`,
  rows: Array.from({ length: size }, (_, i) => ({ teamId: letter.charCodeAt(0) * 100 + i, name: `${letter}${i + 1}` })),
});
const draw = (tables: knockout.TableForDraw[], k: number) =>
  knockout.firstRoundPairings(tables, k).map((p) => `${p.home.label} v ${p.away.label}`);

describe("knockout draw rules", () => {
  it("orders a bracket so the top seeds can only meet in the final", () => {
    assert.deepEqual(knockout.bracketOrder(2), [1, 2]);
    assert.deepEqual(knockout.bracketOrder(4), [1, 4, 2, 3]);
    assert.deepEqual(knockout.bracketOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it("2 groups, top 2: A1 v B2 and B1 v A2 in the semi-finals", () => {
    assert.deepEqual(draw([table("A", 4), table("B", 4)], 2), ["A1 v B2", "B1 v A2"]);
  });

  it("2 groups, top 4: cross-over quarter-finals with group-mates in opposite halves", () => {
    assert.deepEqual(draw([table("A", 5), table("B", 5)], 4), ["A1 v B4", "B2 v A3", "B1 v A4", "A2 v B3"]);
  });

  it("4 groups, top 2: World Cup-style quarter-finals", () => {
    assert.deepEqual(draw(["A", "B", "C", "D"].map((l) => table(l, 4)), 2), ["A1 v B2", "C1 v D2", "B1 v A2", "D1 v C2"]);
  });

  it("8 groups, top 2: World Cup round of 16", () => {
    assert.deepEqual(draw(["A", "B", "C", "D", "E", "F", "G", "H"].map((l) => table(l, 4)), 2), [
      "A1 v B2", "C1 v D2", "E1 v F2", "G1 v H2", "B1 v A2", "D1 v C2", "F1 v E2", "H1 v G2",
    ]);
  });

  it("group winners only, and a single league table", () => {
    assert.deepEqual(draw(["A", "B", "C", "D"].map((l) => table(l, 3)), 1), ["A1 v B1", "C1 v D1"]);
    assert.deepEqual(draw([{ name: null, rows: table("L", 8).rows }], 4), ["1 v 4", "2 v 3"]);
    assert.deepEqual(draw([{ name: null, rows: table("L", 8).rows }], 8), ["1 v 8", "4 v 5", "2 v 7", "3 v 6"]);
  });

  it("names rounds and explains impossible draws", () => {
    assert.deepEqual([1, 2, 4, 8, 16].map(knockout.stageName), ["Final", "Semi-final", "Quarter-final", "Round of 16", "Round of 32"]);
    assert.match(knockout.qualifyProblem(["A", "B", "C"].map((l) => table(l, 4)), 2)!, /3 groups/);
    assert.match(knockout.qualifyProblem([table("A", 4), table("B", 4)], 3)!, /6 teams can't/);
    assert.match(knockout.qualifyProblem([table("A", 4), table("B", 3)], 4)!, /Group B has only 3 teams/);
    assert.equal(knockout.qualifyProblem([table("A", 4), table("B", 4)], 2), null);
  });
});

describe("knockout rounds in a season", () => {
  let db: Db;
  beforeEach(async () => { db = await freshPg(); });

  /** Two groups of three, every group match played; A: Lions > Eagles > Bulls, B: Hawks > Sharks > Wolves. */
  async function groupStage() {
    const s = await league.createSeason(db, { name: "Cup", format: "groups", win: 3, draw: 1, loss: 0, highlightTop: 2, relegation: 0 });
    const [ga, gb] = await league.addGroups(db, s.id, ["Group A", "Group B"]);
    const teams = new Map<string, number>();
    for (const [g, names] of [[ga, ["Lions", "Eagles", "Bulls"]], [gb, ["Hawks", "Sharks", "Wolves"]]] as const) {
      for (const t of await league.addTeams(db, s.id, [...names], g.id)) if (names.includes(t.name as never)) teams.set(t.name, t.id);
    }
    await league.setPlayingDates(db, s.id, ["2026-12-01", "2026-12-02", "2026-12-03"]);
    await matches.generateFixtures(db, s.id, { shuffle: false });
    const rank = ["Lions", "Eagles", "Bulls", "Hawks", "Sharks", "Wolves"];
    for (const m of await matches.listMatches(db, s.id)) {
      const homeBetter = rank.indexOf(m.home.name) < rank.indexOf(m.away.name);
      await matches.saveResult(db, m.id, homeBetter ? 2 : 0, homeBetter ? 0 : 2);
    }
    return { s, teams };
  }

  it("won't draw until every group match is played", async () => {
    const { s } = await groupStage();
    const [first] = await matches.listMatches(db, s.id);
    await matches.saveResult(db, first.id, "", "");
    const plan = await knockout.planKnockout(db, s);
    assert.equal(plan.kind, "first");
    assert.match((plan as { blocked: string }).blocked, /1 group match hasn't been played/);
    await assert.rejects(knockout.createFirstRound(db, s.id, 2), /hasn't been played/);
  });

  it("draws the semi-finals from the tables, then the final and third-place match from the results", async () => {
    const { s } = await groupStage();
    const plan = await knockout.planKnockout(db, s);
    assert.equal(plan.kind, "first");
    assert.deepEqual((plan as Extract<knockout.KnockoutPlan, { kind: "first" }>).options.map((o) => [o.perGroup, o.stage]), [
      [1, "Final"], [2, "Semi-final"],
    ]);

    assert.deepEqual(await knockout.createFirstRound(db, s.id, 2, { date: "2026-12-12", venue: "Main Ground" }), { stage: "Semi-final", matches: 2 });
    await assert.rejects(knockout.createFirstRound(db, s.id, 2), /already been made/);
    const semis = (await matches.listMatches(db, s.id)).filter((m) => m.stage === "Semi-final");
    assert.deepEqual(semis.map((m) => [m.bracketSlot, `${m.home.name} v ${m.away.name}`, m.date, m.venue]), [
      [1, "Lions v Sharks", "2026-12-12", "Main Ground"],
      [2, "Hawks v Eagles", "2026-12-12", "Main Ground"],
    ]);
    assert.equal((await matches.getTables(db, s))[0].rows[0].played, 2, "knockout matches don't count in the group tables");

    // Semi 1: Lions win. Semi 2: level, Eagles win the shoot-out.
    await matches.saveResult(db, semis[0].id, 1, 0);
    await matches.saveResult(db, semis[1].id, 2, 2);
    let next = await knockout.planKnockout(db, s);
    assert.match((next as { blocked: string }).blocked, /Hawks v Eagles ended level.*shoot-out/);
    await matches.saveResult(db, semis[1].id, 2, 2, { home: 3, away: 4 });

    next = await knockout.planKnockout(db, s);
    assert.equal(next.kind, "next");
    const n = next as Extract<knockout.KnockoutPlan, { kind: "next" }>;
    assert.equal(n.blocked, null);
    assert.deepEqual([n.stage, n.pairings[0].home.name, n.pairings[0].away.name], ["Final", "Lions", "Eagles"]);
    assert.deepEqual([n.thirdPlace?.home.name, n.thirdPlace?.away.name], ["Sharks", "Hawks"]);

    assert.deepEqual(await knockout.createNextRound(db, s.id, { thirdPlace: true }), { stage: "Final", matches: 1, thirdPlace: true });
    const later = (await matches.listMatches(db, s.id)).filter((m) => m.stage === "Final" || m.stage === "Third place");
    assert.deepEqual(later.map((m) => `${m.stage}: ${m.home.name} v ${m.away.name}`).sort(), ["Final: Lions v Eagles", "Third place: Sharks v Hawks"]);
    assert.equal((await knockout.planKnockout(db, s)).kind, "done");

    // A group-stage season is won in the final; there is no league champion.
    assert.deepEqual(await knockout.seasonChampions(db, s), { league: null, cup: null });
    const theFinal = later.find((m) => m.stage === "Final")!;
    await matches.saveResult(db, theFinal.id, 0, 0, { home: 2, away: 4 });
    assert.deepEqual(await knockout.seasonChampions(db, s), { league: null, cup: { id: theFinal.away.id, name: "Eagles" } });
    await assert.rejects(knockout.createNextRound(db, s.id), /final has already been drawn/);
  });

  it("checks penalty shoot-out scores", async () => {
    const { s, teams } = await groupStage();
    const groupMatch = (await matches.listMatches(db, s.id))[0];
    await assert.rejects(matches.saveResult(db, groupMatch.id, 1, 1, { home: 5, away: 4 }), /Only a knockout match/);

    const final = await matches.createMatch(db, s.id, { homeTeamId: teams.get("Lions"), awayTeamId: teams.get("Hawks"), stage: "Final" });
    await assert.rejects(matches.saveResult(db, final, 1, 1, { home: 4, away: 4 }), /can't end level/);
    await assert.rejects(matches.saveResult(db, final, 1, 1, { home: 4 }), /both teams' shoot-out/);
    await matches.saveResult(db, final, 1, 1, { home: 5, away: 4 });
    let m = (await matches.getMatch(db, final))!;
    assert.deepEqual([m.homePens, m.awayPens, knockout.winnerOf(m)?.name], [5, 4, "Lions"]);

    // Changing to a decisive score drops the shoot-out.
    await matches.saveResult(db, final, 2, 1, { home: 5, away: 4 });
    m = (await matches.getMatch(db, final))!;
    assert.deepEqual([m.homePens, m.awayPens, knockout.winnerOf(m)?.name], [null, null, "Lions"]);
    await assert.rejects(db.run("UPDATE matches SET home_pens = 3, away_pens = 2 WHERE id = ?", [final]), /pens_check/);
  });

  it("in a league, the team top of the table is champion once every league match is played; play-offs are extra", async () => {
    const s = await league.createSeason(db, { name: "League", win: 3, draw: 1, loss: 0, highlightTop: 4, relegation: 0 });
    await league.addTeams(db, s.id, ["Lions", "Eagles", "Bulls", "Hawks"]);
    await league.setPlayingDates(db, s.id, Array.from({ length: 6 }, (_, i) => `2026-12-0${i + 1}`));
    await matches.generateFixtures(db, s.id, { shuffle: false });
    const rank = ["Lions", "Eagles", "Bulls", "Hawks"];
    const all = await matches.listMatches(db, s.id);
    for (const m of all.slice(1)) {
      const homeBetter = rank.indexOf(m.home.name) < rank.indexOf(m.away.name);
      await matches.saveResult(db, m.id, homeBetter ? 1 : 0, homeBetter ? 0 : 1);
    }
    assert.deepEqual(await knockout.seasonChampions(db, s), { league: null, cup: null }, "not until every match is played");
    await matches.saveResult(db, all[0].id, 1, 1);
    const lions = (await league.listTeams(db, s.id)).find((t) => t.name === "Lions")!;
    assert.deepEqual(await knockout.seasonChampions(db, s), { league: { id: lions.id, name: "Lions" }, cup: null });

    // Optional play-offs: top 4 into semi-finals. The league champion doesn't change.
    assert.deepEqual(await knockout.createFirstRound(db, s.id, 4), { stage: "Semi-final", matches: 2 });
    const semis = (await matches.listMatches(db, s.id)).filter((m) => m.stage === "Semi-final");
    assert.deepEqual(semis.map((m) => `${m.home.name} v ${m.away.name}`), ["Lions v Hawks", "Eagles v Bulls"]);
    assert.equal((await knockout.seasonChampions(db, s)).league?.name, "Lions");
  });
});
