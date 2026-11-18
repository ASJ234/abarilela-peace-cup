"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isOfficial, signIn, signOut } from "@/lib/auth";
import { getDb } from "@/lib/db";
import * as league from "@/lib/league";
import * as matches from "@/lib/matches";
import * as players from "@/lib/players";
import { LeagueError, optionalNumber, splitNameList } from "@/lib/validate";

export type FormState = { ok?: string; error?: string } | undefined;
type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

/** Runs an official-only mutation, turning rule violations into form errors. */
async function guarded(fn: () => string | void): Promise<FormState> {
  try {
    if (!(await isOfficial())) throw new LeagueError("Your session has expired. Please sign in again.");
    const ok = fn();
    revalidatePath("/", "layout");
    return { ok: ok || "Saved." };
  } catch (err) {
    if (err instanceof LeagueError) return { error: err.message };
    console.error(err);
    return { error: "Something went wrong. Please try again." };
  }
}

/** Shorthand for actions that just run a mutation and report a message. */
const official = (fn: (fd: FormData) => string | void): Action => async (_prev, fd) => guarded(() => fn(fd));

const id = (fd: FormData, key: string) => Number(fd.get(key));
const str = (fd: FormData, key: string) => String(fd.get(key) ?? "");
const lines = (fd: FormData, key: string) => str(fd, key).split(/\r?\n/);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// ---- Auth ------------------------------------------------------------------

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  if (!(await signIn(str(fd, "password")))) return { error: "Wrong password." };
  redirect("/official");
}

export async function logoutAction() {
  await signOut();
  redirect("/");
}

// ---- Seasons ---------------------------------------------------------------

function seasonInput(fd: FormData): league.SeasonInput {
  return {
    name: fd.get("name"), format: fd.get("format") ?? undefined, win: fd.get("win"), draw: fd.get("draw"), loss: fd.get("loss"),
    highlightTop: fd.get("highlightTop"), relegation: fd.get("relegation"),
  };
}

export async function createSeasonAction(_: FormState, fd: FormData): Promise<FormState> {
  let newId = 0;
  const state = await guarded(() => { newId = league.createSeason(getDb(), seasonInput(fd)).id; });
  if (state?.error) return state;
  redirect(`/official/season/${newId}`);
}

export const updateSeasonAction = official((fd) => {
  league.updateSeason(getDb(), id(fd, "seasonId"), seasonInput(fd));
  return "Season settings saved.";
});

export async function deleteSeasonAction(_: FormState, fd: FormData): Promise<FormState> {
  const state = await guarded(() => league.deleteSeason(getDb(), id(fd, "seasonId")));
  if (state?.error) return state;
  redirect("/official");
}

// ---- Groups ----------------------------------------------------------------

export const addGroupsAction = official((fd) => {
  const count = optionalNumber(fd.get("count"), "Number of groups", 26);
  const db = getDb();
  const before = league.listGroups(db, id(fd, "seasonId")).length;
  const after = count != null
    ? league.addLetteredGroups(db, id(fd, "seasonId"), count).length
    : league.addGroups(db, id(fd, "seasonId"), splitNameList(fd.get("names"))).length;
  return `Added ${plural(after - before, "group")}.`;
});

export const renameGroupAction = official((fd) => {
  league.renameGroup(getDb(), id(fd, "groupId"), str(fd, "name"));
  return "Group renamed.";
});

export const deleteGroupAction = official((fd) => {
  league.deleteGroup(getDb(), id(fd, "groupId"));
  return "Group removed.";
});

export const drawGroupsAction = official((fd) => {
  league.drawGroups(getDb(), id(fd, "seasonId"));
  return "Teams drawn into groups.";
});

// ---- Teams -----------------------------------------------------------------

export const addTeamsAction = official((fd) => {
  const db = getDb();
  const seasonId = id(fd, "seasonId");
  const before = league.listTeams(db, seasonId).length;
  const after = league.addTeams(db, seasonId, splitNameList(fd.get("names")), Number(fd.get("groupId")) || null).length;
  return `Added ${plural(after - before, "team")}.`;
});

export const renameTeamAction = official((fd) => {
  league.renameTeam(getDb(), id(fd, "teamId"), str(fd, "name"));
  return "Team renamed.";
});

export const setTeamGroupAction = official((fd) => {
  league.setTeamGroup(getDb(), id(fd, "teamId"), fd.get("groupId"));
  return "Group updated.";
});

export const removeTeamAction = official((fd) => {
  league.removeTeam(getDb(), id(fd, "teamId"));
  return "Team removed.";
});

// ---- Players ---------------------------------------------------------------

export const addPlayersAction = official((fd) => {
  const db = getDb();
  const teamId = id(fd, "teamId");
  const before = players.listPlayers(db, teamId).length;
  const after = players.addPlayers(db, teamId, lines(fd, "players")).length;
  return `Added ${plural(after - before, "player")}.`;
});

export const updatePlayerAction = official((fd) => {
  players.updatePlayer(getDb(), id(fd, "playerId"), {
    name: fd.get("name"), number: fd.get("number"), position: fd.get("position"),
  });
  return "Player saved.";
});

export const deletePlayerAction = official((fd) => {
  players.deletePlayer(getDb(), id(fd, "playerId"));
  return "Player removed.";
});

// ---- Playing dates ---------------------------------------------------------

export const saveDatesAction = official((fd) => {
  const saved = league.setPlayingDates(getDb(), id(fd, "seasonId"), fd.getAll("date").map(String));
  return `Saved ${plural(saved.length, "playing date")}.`;
});

// ---- Fixtures --------------------------------------------------------------

export const generateFixturesAction = official((fd) => {
  const ms = matches.generateFixtures(getDb(), id(fd, "seasonId"), {
    shuffle: fd.get("shuffle") === "on",
    oncePerDay: fd.get("oncePerDay") === "on",
    maxPerDay: optionalNumber(fd.get("maxPerDay"), "Matches per day", 500),
    kickoffTimes: matches.parseKickoffTimes(fd.get("kickoffTimes")),
  }).filter((m) => m.stage == null);
  const days = new Set(ms.map((m) => m.date)).size;
  return `Generated ${plural(ms.length, "match")} on ${plural(days, "date")}.`;
});

export const clearFixturesAction = official((fd) => {
  matches.clearLeagueFixtures(getDb(), id(fd, "seasonId"));
  return "League/group fixtures cleared.";
});

function matchInput(fd: FormData): matches.MatchInput {
  return {
    homeTeamId: fd.get("homeTeamId"), awayTeamId: fd.get("awayTeamId"),
    date: fd.get("date"), kickoff: fd.get("kickoff"), venue: fd.get("venue"),
    stage: fd.get("stage"), round: fd.get("round"),
  };
}

export const createMatchAction = official((fd) => {
  matches.createMatch(getDb(), id(fd, "seasonId"), matchInput(fd));
  return "Match added.";
});

export const updateMatchAction = official((fd) => {
  matches.updateMatch(getDb(), id(fd, "matchId"), matchInput(fd));
  return "Match details saved.";
});

export async function deleteMatchAction(_: FormState, fd: FormData): Promise<FormState> {
  let seasonId = 0;
  const state = await guarded(() => { seasonId = matches.deleteMatch(getDb(), id(fd, "matchId")); });
  if (state?.error || fd.get("stay") === "1") return state;
  redirect(`/official/season/${seasonId}/matches`);
}

export const saveResultAction = official((fd) => {
  matches.saveResult(getDb(), id(fd, "matchId"), fd.get("homeScore"), fd.get("awayScore"));
  return "Result saved.";
});

// ---- Match events ----------------------------------------------------------

export const addEventAction = official((fd) => {
  matches.addEvent(getDb(), id(fd, "matchId"), {
    type: fd.get("type"), teamId: fd.get("teamId"), playerId: fd.get("playerId"),
    assistId: fd.get("assistId"), minute: fd.get("minute"),
  });
  return "Added.";
});

export const deleteEventAction = official((fd) => {
  matches.deleteEvent(getDb(), id(fd, "eventId"));
  return "Removed.";
});
