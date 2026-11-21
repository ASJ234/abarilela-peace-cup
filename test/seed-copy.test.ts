import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { seedFast } from "../scripts/seed-copy";
import * as league from "../src/lib/league";
import * as matches from "../src/lib/matches";
import * as players from "../src/lib/players";
import * as users from "../src/lib/users";
import { matchTimeline } from "../src/lib/types";
import { newPg } from "./pglite";

describe("fast seed (npm run seed)", () => {
  it("copies the demo into a database that already has data, then replaces it", async () => {
    const db = await newPg();
    const admin = await users.setUpAdmin(db, "boss", "adminpass1");
    await users.adminCreateUser(db, admin, { username: "ref.one", password: "refpass123", role: "official" });
    const fan = await users.adminCreateUser(db, admin, { username: "fan", password: "fanpass123", role: "fan" });
    const old = await league.createSeason(db, { name: "Old season", win: 3, draw: 1, loss: 0, highlightTop: 4, relegation: 0 });
    const [oldTeam] = await league.addTeams(db, old.id, ["Old FC", "Older FC"]);
    await players.addPlayers(db, oldTeam.id, ["1 Old Keeper"]);
    await league.setPinnedSeason(db, admin, old.id);

    await seedFast(db);
    const seasons = await league.listSeasons(db);
    assert.equal(seasons.length, 4, "the old season is kept");
    assert.deepEqual((await league.listTeams(db, old.id)).map((t) => t.name).sort(), ["Old FC", "Older FC"]);
    const cup = seasons.find((s) => s.name === "Community Cup 2026")!;
    assert.equal(seasons.filter((s) => s.pinned).map((s) => s.id).join(), String(cup.id), "the demo cup is pinned instead");

    // Every event links a player of the right team in the right match, after the ids were shifted.
    const bad = await db.get(
      `SELECT COUNT(*) AS n FROM match_events e JOIN matches m ON m.id = e.match_id JOIN players p ON p.id = e.player_id
       WHERE e.type <> 'own_goal' AND (p.team_id <> e.team_id OR e.team_id NOT IN (m.home_team_id, m.away_team_id))`,
    );
    assert.equal(Number(bad!.n), 0);
    const fanTeam = (await users.getUser(db, fan.id))!.favouriteTeamId!;
    assert.equal((await league.getTeam(db, fanTeam))?.seasonId, cup.id);

    // New rows still get fresh ids.
    const final = (await matches.listMatches(db, cup.id)).find((m) => m.stage === "Semi-final")!;
    await matches.addEvent(db, final.id, { type: "yellow", teamId: final.home.id, playerId: (await players.listPlayers(db, final.home.id))[0].id });

    await seedFast(db, { replace: true });
    const after = await league.listSeasons(db);
    assert.deepEqual(after.map((s) => s.name).sort(), ["Community Cup 2026", "Peace League 2026", "Youth Cup 2026"]);
    assert.equal(Math.min(...after.map((s) => s.id)), 1, "ids start again from 1");
    const lgFinal = (await matches.listMatches(db, after.find((s) => s.name === "Peace League 2026")!.id)).find((m) => m.stage === "Final")!;
    assert.ok(matchTimeline(await matches.listEvents(db, lgFinal.id)).some((x) => x.secondYellow && x.red));
    assert.equal((await users.listUsers(db)).length, 3, "accounts kept");
  });
});
