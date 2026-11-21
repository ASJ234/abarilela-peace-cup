import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { seedDemo } from "../scripts/seed";
import { featuredSeason } from "../src/lib/insights";
import { matchTimeline } from "../src/lib/types";
import * as knockout from "../src/lib/knockout";
import * as league from "../src/lib/league";
import * as matches from "../src/lib/matches";
import * as officials from "../src/lib/officials";
import * as users from "../src/lib/users";
import { freshPg } from "./pglite";

describe("demo data (npm run seed)", () => {
  it("replaces every season, keeps accounts, and shows every feature", async () => {
    const db = await freshPg();
    const admin = await users.setUpAdmin(db, "boss", "adminpass1");
    const ref1 = await users.adminCreateUser(db, admin, { username: "ref.one", password: "refpass123", role: "official" });
    const ref2 = await users.adminCreateUser(db, admin, { username: "ref.two", password: "refpass123", role: "official" });
    const fan = await users.adminCreateUser(db, admin, { username: "fan", password: "fanpass123", role: "fan" });
    await league.createSeason(db, { name: "Old season", win: 3, draw: 1, loss: 0, highlightTop: 4, relegation: 0 });

    await seedDemo(db, { replace: true });

    const seasons = await league.listSeasons(db);
    assert.deepEqual(seasons.map((s) => s.name).sort(), ["Community Cup 2026", "Peace League 2026", "Youth Cup 2026"]);
    assert.equal((await users.listUsers(db)).length, 4, "accounts kept");
    const [lg, cup, youth] = ["Peace League 2026", "Community Cup 2026", "Youth Cup 2026"].map((n) => seasons.find((s) => s.name === n)!);

    // League: finished, champion from the table, play-offs with a shoot-out.
    const lgChamps = await knockout.seasonChampions(db, lg);
    assert.ok(lgChamps.league && lgChamps.cup);
    const lgMatches = await matches.listMatches(db, lg.id);
    assert.ok(lgMatches.every((m) => m.played));
    assert.ok(lgMatches.some((m) => m.homePens != null), "a play-off went to penalties");

    // Cup: pinned, semis done, final and third place coming up with referees.
    assert.equal((await featuredSeason(db))?.season.id, cup.id);
    const cupMatches = await matches.listMatches(db, cup.id);
    const final = cupMatches.find((m) => m.stage === "Final")!;
    assert.ok(!final.played && final.referee && final.date! > new Date().toISOString().slice(0, 10));
    assert.ok(cupMatches.find((m) => m.stage === "Third place"));
    assert.ok(cupMatches.filter((m) => m.stage === "Semi-final").some((m) => m.homePens != null));
    assert.deepEqual(await knockout.seasonChampions(db, cup), { league: null, cup: null });

    // Youth cup: in progress.
    const youthMatches = await matches.listMatches(db, youth.id);
    assert.ok(youthMatches.some((m) => m.played) && youthMatches.some((m) => !m.played));

    // Events cover penalties, own goals, coach cards; teams have coaches; matches have referees.
    const kinds = await db.get(
      `SELECT COUNT(*) FILTER (WHERE penalty) AS pens, COUNT(*) FILTER (WHERE type = 'own_goal') AS ogs,
              COUNT(*) FILTER (WHERE coach_name IS NOT NULL) AS coach_cards FROM match_events`,
    );
    assert.ok(Number(kinds!.pens) > 0 && Number(kinds!.ogs) > 0 && Number(kinds!.coach_cards) > 0, JSON.stringify(kinds));
    assert.ok((await league.listTeams(db, cup.id)).every((t) => t.coach));

    // Second yellows: the Peace League final and a Community Cup semi-final each have one, with its red.
    for (const m of [lgMatches.find((x) => x.stage === "Final")!, cupMatches.filter((x) => x.stage === "Semi-final")[1]]) {
      const sentOff = matchTimeline(await matches.listEvents(db, m.id)).filter((x) => x.secondYellow);
      assert.ok(sentOff.length > 0 && sentOff.every((x) => x.red), `${m.home.name} v ${m.away.name}`);
    }
    assert.ok(cupMatches.every((m) => m.referee && m.venue));

    // People.
    assert.equal(await officials.canManageSeason(db, ref1, cup.id), true);
    assert.equal(await officials.canManageSeason(db, ref1, lg.id), false);
    assert.equal(await officials.canManageSeason(db, ref2, lg.id), true);
    assert.notEqual((await users.getUser(db, fan.id))?.favouriteTeamId, null);
  });
});
