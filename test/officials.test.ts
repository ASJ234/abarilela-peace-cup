import { strict as assert } from "node:assert";
import { beforeEach, describe, it } from "node:test";
import * as league from "../src/lib/league";
import * as matches from "../src/lib/matches";
import * as officials from "../src/lib/officials";
import * as players from "../src/lib/players";
import type { Db } from "../src/lib/sql";
import * as users from "../src/lib/users";
import { freshPg } from "./pglite";

const season = (db: Db, name: string, format = "league") =>
  league.createSeason(db, { name, format, win: 3, draw: 1, loss: 0, highlightTop: 4, relegation: 0 });

describe("season officials", () => {
  let db: Db;
  let admin: users.User;
  let ref: users.User;
  let fan: users.User;
  beforeEach(async () => {
    db = await freshPg();
    admin = await users.setUpAdmin(db, "boss", "adminpass1");
    ref = await users.adminCreateUser(db, admin, { username: "ref", password: "refpass123", role: "official" });
    fan = await users.adminCreateUser(db, admin, { username: "fan", password: "fanpass123", role: "fan" });
  });

  it("the admin manages every season; an official only the seasons they're added to", async () => {
    const a = await season(db, "Cup A");
    const b = await season(db, "Cup B");
    assert.equal(await officials.canManageSeason(db, admin, b.id), true);
    assert.equal(await officials.canManageSeason(db, ref, a.id), false, "not added to any season yet");

    await officials.addSeasonOfficial(db, admin, a.id, ref.id);
    await officials.addSeasonOfficial(db, admin, a.id, ref.id); // adding twice is fine
    assert.equal(await officials.canManageSeason(db, ref, a.id), true);
    assert.equal(await officials.canManageSeason(db, ref, b.id), false);
    assert.deepEqual([...(await officials.managedSeasonIds(db, ref) as Set<number>)], [a.id]);
    assert.equal(await officials.managedSeasonIds(db, admin), "all");
    assert.deepEqual((await officials.listSeasonOfficials(db, a.id)).map((o) => o.username), ["ref"]);
    assert.deepEqual(Object.fromEntries(await officials.seasonsByOfficial(db)), { [ref.id]: ["Cup A"] });

    await officials.removeSeasonOfficial(db, admin, a.id, ref.id);
    assert.equal(await officials.canManageSeason(db, ref, a.id), false);
  });

  it("only the admin adds officials, and only official accounts can be added", async () => {
    const a = await season(db, "Cup A");
    await assert.rejects(officials.addSeasonOfficial(db, ref, a.id, ref.id), /Only the admin/);
    await assert.rejects(officials.removeSeasonOfficial(db, ref, a.id, ref.id), /Only the admin/);
    await assert.rejects(officials.addSeasonOfficial(db, admin, a.id, fan.id), /isn't an official/);
    await assert.rejects(officials.addSeasonOfficial(db, admin, a.id, 999), /Choose an official/);
    await assert.rejects(officials.addSeasonOfficial(db, admin, 999, ref.id), /Season not found/);
    assert.equal(await officials.canManageSeason(db, fan, a.id), false);
    assert.equal(await officials.canManageSeason(db, null, a.id), false);
  });

  it("demoting an official to fan, deleting them, or deleting the season removes their access", async () => {
    const a = await season(db, "Cup A");
    const b = await season(db, "Cup B");
    await officials.addSeasonOfficial(db, admin, a.id, ref.id);
    await officials.addSeasonOfficial(db, admin, b.id, ref.id);

    await league.deleteSeason(db, b.id);
    assert.deepEqual(Object.fromEntries(await officials.seasonsByOfficial(db)), { [ref.id]: ["Cup A"] });

    await users.adminUpdateUser(db, admin, ref.id, { username: "ref", role: "fan" });
    await users.adminUpdateUser(db, admin, ref.id, { username: "ref", role: "official" });
    assert.equal(await officials.canManageSeason(db, { ...ref, role: "official" }, a.id), false, "promoting again doesn't bring seasons back");

    await officials.addSeasonOfficial(db, admin, a.id, ref.id);
    await users.adminDeleteUser(db, admin, ref.id);
    assert.equal((await officials.listSeasonOfficials(db, a.id)).length, 0);
  });

  it("finds the season of every kind of record, so actions can check access", async () => {
    const a = await season(db, "Cup A", "groups");
    await league.addGroups(db, a.id, ["Group A"]);
    const [group] = await league.listGroups(db, a.id);
    const [lions, eagles] = await league.addTeams(db, a.id, ["Lions", "Eagles"], group.id);
    const [striker] = await players.addPlayers(db, lions.id, ["9 Striker"]);
    const matchId = await matches.createMatch(db, a.id, { homeTeamId: lions.id, awayTeamId: eagles.id, stage: "Final" });
    const eventId = await matches.addEvent(db, matchId, { type: "goal", teamId: lions.id, playerId: striker.id });

    for (const [kind, id] of [
      ["season", a.id], ["group", group.id], ["team", lions.id], ["player", striker.id], ["match", matchId], ["event", eventId],
    ] as const) {
      assert.equal(await officials.seasonOf(db, kind, id), a.id, kind);
      assert.equal(await officials.seasonOf(db, kind, 9999), null, `${kind} that doesn't exist`);
    }
    assert.equal(await officials.seasonOf(db, "team", NaN), null);
  });
});
