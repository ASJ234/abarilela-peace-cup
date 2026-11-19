import type { Db } from "./sql";
import type { Format, Group, Season, Team } from "./types";
import { LeagueError, type Row, cleanText, optionalDate, optionalId, requiredText, wholeNumber } from "./validate";

export { LeagueError } from "./validate";

// ---------------------------------------------------------------------------
// Seasons
// ---------------------------------------------------------------------------

function toSeason(r: Row): Season {
  return {
    id: Number(r.id),
    name: String(r.name),
    format: (r.format === "groups" ? "groups" : "league") as Format,
    pinned: Number(r.pinned ?? 0) === 1,
    points: { win: Number(r.points_win), draw: Number(r.points_draw), loss: Number(r.points_loss) },
    highlightTop: Number(r.highlight_top),
    relegation: Number(r.relegation),
    createdAt: String(r.created_at),
  };
}

export async function listSeasons(db: Db): Promise<Season[]> {
  return (await db.all("SELECT * FROM seasons ORDER BY id DESC")).map(toSeason);
}

export async function getSeason(db: Db, id: number): Promise<Season | null> {
  if (!Number.isInteger(id)) return null;
  const r = await db.get("SELECT * FROM seasons WHERE id = ?", [id]);
  return r ? toSeason(r) : null;
}

export async function mustGetSeason(db: Db, id: number): Promise<Season> {
  const s = await getSeason(db, id);
  if (!s) throw new LeagueError("Season not found.");
  return s;
}

export type SeasonInput = {
  name: unknown;
  /** "league" or "groups"; defaults to league. */
  format?: unknown;
  win: unknown;
  draw: unknown;
  loss: unknown;
  highlightTop: unknown;
  relegation: unknown;
};

function parseSeason(input: SeasonInput) {
  const name = requiredText(input.name, "Season name", 80);
  const format = parseFormat(input.format);
  const win = wholeNumber(input.win, "Points for a win", 10);
  const draw = wholeNumber(input.draw, "Points for a draw", 10);
  const loss = wholeNumber(input.loss, "Points for a loss", 10);
  const top = wholeNumber(input.highlightTop, "Highlighted top places", 50);
  const rel = wholeNumber(input.relegation, "Relegation places", 50);
  if (!(win > draw && draw >= loss)) {
    throw new LeagueError("A win must be worth more than a draw, and a draw at least as much as a loss.");
  }
  return { name, format, win, draw, loss, top, rel };
}

function parseFormat(v: unknown): Format {
  if (v == null || v === "" || v === "league") return "league";
  if (v === "groups") return "groups";
  throw new LeagueError("Choose a format: league or group stage.");
}

export async function createSeason(db: Db, input: SeasonInput): Promise<Season> {
  const s = parseSeason(input);
  const r = await db.get(
    `INSERT INTO seasons (name, format, points_win, points_draw, points_loss, highlight_top, relegation)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    [s.name, s.format, s.win, s.draw, s.loss, s.top, s.rel],
  );
  return toSeason(r!);
}

export async function updateSeason(db: Db, id: number, input: SeasonInput): Promise<Season> {
  const current = await mustGetSeason(db, id);
  const s = parseSeason({ ...input, format: input.format ?? current.format });
  if (s.format !== current.format) {
    const r = await db.get("SELECT COUNT(*) AS n FROM matches WHERE season_id = ? AND stage IS NULL", [id]);
    const leagueMatches = Number(r?.n ?? 0);
    if (leagueMatches > 0) {
      throw new LeagueError(
        `The format can't change while there are ${leagueMatches} league/group fixtures. Clear them on the Schedule tab first.`,
      );
    }
  }
  const r = await db.get(
    `UPDATE seasons SET name = ?, format = ?, points_win = ?, points_draw = ?, points_loss = ?,
       highlight_top = ?, relegation = ? WHERE id = ? RETURNING *`,
    [s.name, s.format, s.win, s.draw, s.loss, s.top, s.rel, id],
  );
  return toSeason(r!);
}

export async function deleteSeason(db: Db, id: number): Promise<void> {
  await db.run("DELETE FROM seasons WHERE id = ?", [id]);
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export async function listGroups(db: Db, seasonId: number): Promise<Group[]> {
  const rows = await db.all("SELECT id, name FROM league_groups WHERE season_id = ? ORDER BY name", [seasonId]);
  return rows.map((r) => ({ id: Number(r.id), name: String(r.name) }));
}

async function groupInSeason(db: Db, groupId: number, seasonId: number): Promise<boolean> {
  return Boolean(await db.get("SELECT 1 FROM league_groups WHERE id = ? AND season_id = ?", [groupId, seasonId]));
}

function assertGroupFormat(season: Season) {
  if (season.format !== "groups") {
    throw new LeagueError("This season uses the league format (one table). Switch it to group stage in Settings to use groups.");
  }
}

export async function addGroups(db: Db, seasonId: number, names: string[]): Promise<Group[]> {
  assertGroupFormat(await mustGetSeason(db, seasonId));
  const cleaned = names.map(cleanText).filter(Boolean);
  if (!cleaned.length) throw new LeagueError("Enter at least one group name.");
  const seen = new Set((await listGroups(db, seasonId)).map((g) => cleanText(g.name).toLowerCase()));
  await db.tx(async (t) => {
    for (const raw of cleaned) {
      const name = requiredText(raw, "Group name", 40);
      if (seen.has(name.toLowerCase())) throw new LeagueError(`"${name}" already exists.`);
      seen.add(name.toLowerCase());
      await t.run("INSERT INTO league_groups (season_id, name) VALUES (?, ?)", [seasonId, name]);
    }
  });
  return listGroups(db, seasonId);
}

/** Create groups "Group A", "Group B", … (skipping names that already exist). */
export async function addLetteredGroups(db: Db, seasonId: number, count: number): Promise<Group[]> {
  const n = wholeNumber(count, "Number of groups", 26);
  const existing = new Set((await listGroups(db, seasonId)).map((g) => cleanText(g.name).toLowerCase()));
  const names: string[] = [];
  for (let i = 0; names.length < n && i < 26; i++) {
    const name = `Group ${String.fromCharCode(65 + i)}`;
    if (!existing.has(name.toLowerCase())) names.push(name);
  }
  return names.length ? addGroups(db, seasonId, names) : listGroups(db, seasonId);
}

export async function renameGroup(db: Db, groupId: number, newName: string): Promise<void> {
  const name = requiredText(newName, "Group name", 40);
  const g = await db.get("SELECT season_id FROM league_groups WHERE id = ?", [groupId]);
  if (!g) throw new LeagueError("Group not found.");
  const clash = await db.get(
    "SELECT 1 FROM league_groups WHERE season_id = ? AND name = ? AND id != ?",
    [Number(g.season_id), name, groupId],
  );
  if (clash) throw new LeagueError(`"${name}" already exists.`);
  await db.run("UPDATE league_groups SET name = ? WHERE id = ?", [name, groupId]);
}

export async function deleteGroup(db: Db, groupId: number): Promise<void> {
  const used = await db.get("SELECT COUNT(*) AS n FROM matches WHERE group_id = ?", [groupId]);
  if (Number(used?.n ?? 0) > 0) {
    throw new LeagueError("This group has fixtures. Delete or regenerate those fixtures before removing the group.");
  }
  await db.run("DELETE FROM league_groups WHERE id = ?", [groupId]); // teams fall back to "no group"
}

/** Draw all teams into the season's groups at random, as evenly as possible. */
export async function drawGroups(db: Db, seasonId: number, random: () => number = Math.random): Promise<void> {
  assertGroupFormat(await mustGetSeason(db, seasonId));
  const groups = await listGroups(db, seasonId);
  if (groups.length < 2) throw new LeagueError("Create at least 2 groups first.");
  const teams = await listTeams(db, seasonId);
  if (teams.length < groups.length * 2) {
    throw new LeagueError(`${groups.length} groups need at least ${groups.length * 2} teams (2 per group).`);
  }
  for (let i = teams.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [teams[i], teams[j]] = [teams[j], teams[i]];
  }
  await db.tx(async (t) => {
    for (const [i, team] of teams.entries()) {
      await t.run("UPDATE teams SET group_id = ? WHERE id = ?", [groups[i % groups.length].id, team.id]);
    }
  });
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

export async function listTeams(db: Db, seasonId: number): Promise<Team[]> {
  const rows = await db.all("SELECT id, name, group_id, coach FROM teams WHERE season_id = ? ORDER BY name", [seasonId]);
  return rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    groupId: r.group_id == null ? null : Number(r.group_id),
    coach: r.coach == null ? null : String(r.coach),
  }));
}

export async function getTeam(db: Db, teamId: number): Promise<(Team & { seasonId: number }) | null> {
  if (!Number.isInteger(teamId)) return null;
  const r = await db.get("SELECT * FROM teams WHERE id = ?", [teamId]);
  if (!r) return null;
  return {
    id: Number(r.id),
    name: String(r.name),
    groupId: r.group_id == null ? null : Number(r.group_id),
    coach: r.coach == null ? null : String(r.coach),
    seasonId: Number(r.season_id),
  };
}

export async function mustGetTeam(db: Db, teamId: number) {
  const t = await getTeam(db, teamId);
  if (!t) throw new LeagueError("Team not found.");
  return t;
}

/** Add one or more teams (e.g. pasted one per line), optionally straight into a group. */
export async function addTeams(db: Db, seasonId: number, names: string[], groupId: number | null = null): Promise<Team[]> {
  await mustGetSeason(db, seasonId);
  if (groupId != null && !(await groupInSeason(db, groupId, seasonId))) throw new LeagueError("Group not found.");
  const cleaned = names.map(cleanText).filter(Boolean);
  if (!cleaned.length) throw new LeagueError("Enter at least one team name.");

  const seen = new Set((await listTeams(db, seasonId)).map((t) => cleanText(t.name).toLowerCase()));
  await db.tx(async (t) => {
    for (const raw of cleaned) {
      const name = requiredText(raw, "Team name");
      if (seen.has(name.toLowerCase())) throw new LeagueError(`"${name}" is already in this season.`);
      seen.add(name.toLowerCase());
      await t.run("INSERT INTO teams (season_id, name, group_id) VALUES (?, ?, ?)", [seasonId, name, groupId]);
    }
  });
  return listTeams(db, seasonId);
}

export async function renameTeam(db: Db, teamId: number, newName: string): Promise<void> {
  const name = requiredText(newName, "Team name");
  const team = await mustGetTeam(db, teamId);
  const clash = await db.get("SELECT 1 FROM teams WHERE season_id = ? AND name = ? AND id != ?", [team.seasonId, name, teamId]);
  if (clash) throw new LeagueError(`"${name}" is already in this season.`);
  await db.run("UPDATE teams SET name = ? WHERE id = ?", [name, teamId]);
}

/** Sets (or, when blank, clears) the team's head coach. */
export async function setTeamCoach(db: Db, teamId: number, coachRaw: unknown): Promise<void> {
  await mustGetTeam(db, teamId);
  const coach = cleanText(coachRaw) ? requiredText(coachRaw, "Coach's name", 60) : null;
  await db.run("UPDATE teams SET coach = ? WHERE id = ?", [coach, teamId]);
}

export async function setTeamGroup(db: Db, teamId: number, groupIdRaw: unknown): Promise<void> {
  const team = await mustGetTeam(db, teamId);
  const groupId = optionalId(groupIdRaw);
  if (groupId != null && !(await groupInSeason(db, groupId, team.seasonId))) throw new LeagueError("Group not found.");
  await db.run("UPDATE teams SET group_id = ? WHERE id = ?", [groupId, teamId]);
}

export async function removeTeam(db: Db, teamId: number): Promise<void> {
  const team = await getTeam(db, teamId);
  if (!team) return;
  const r = await db.get("SELECT COUNT(*) AS n FROM matches WHERE home_team_id = ? OR away_team_id = ?", [teamId, teamId]);
  const n = Number(r?.n ?? 0);
  if (n > 0) {
    throw new LeagueError(`${team.name} has ${n} fixture${n === 1 ? "" : "s"}. Delete or regenerate the fixtures first.`);
  }
  await db.run("DELETE FROM teams WHERE id = ?", [teamId]); // also removes the squad
}

// ---------------------------------------------------------------------------
// Playing dates
// ---------------------------------------------------------------------------

export async function listDates(db: Db, seasonId: number): Promise<string[]> {
  const rows = await db.all("SELECT date FROM playing_dates WHERE season_id = ? ORDER BY date", [seasonId]);
  return rows.map((r) => String(r.date));
}

/** Replace the season's playing dates with the given list (YYYY-MM-DD). */
export async function setPlayingDates(db: Db, seasonId: number, dates: string[]): Promise<string[]> {
  await mustGetSeason(db, seasonId);
  const unique = [...new Set(dates.map((d) => optionalDate(d)).filter((d): d is string => d != null))].sort();
  await db.tx(async (t) => {
    await t.run("DELETE FROM playing_dates WHERE season_id = ?", [seasonId]);
    for (const d of unique) await t.run("INSERT INTO playing_dates (season_id, date) VALUES (?, ?)", [seasonId, d]);
  });
  return unique;
}

/** All teams grouped by season (newest season first), for "favourite team" pickers. */
export async function listTeamChoices(db: Db): Promise<{ season: string; teams: { id: number; name: string }[] }[]> {
  const rows = await db.all(
    `SELECT s.id AS season_id, s.name AS season_name, t.id, t.name
       FROM seasons s JOIN teams t ON t.season_id = s.id
      ORDER BY s.id DESC, t.name`,
  );
  const bySeason = new Map<number, { season: string; teams: { id: number; name: string }[] }>();
  for (const r of rows) {
    const sid = Number(r.season_id);
    if (!bySeason.has(sid)) bySeason.set(sid, { season: String(r.season_name), teams: [] });
    bySeason.get(sid)!.teams.push({ id: Number(r.id), name: String(r.name) });
  }
  return [...bySeason.values()];
}

/** Admin only: pin a season to the home page, or pass null to go back to automatic. */
export async function setPinnedSeason(db: Db, acting: { role: string }, seasonId: number | null): Promise<void> {
  if (acting.role !== "admin") throw new LeagueError("Only the admin can choose the home page season.");
  if (seasonId != null) await mustGetSeason(db, seasonId);
  await db.tx(async (t) => {
    await t.run("UPDATE seasons SET pinned = 0 WHERE pinned = 1");
    if (seasonId != null) await t.run("UPDATE seasons SET pinned = 1 WHERE id = ?", [seasonId]);
  });
}
