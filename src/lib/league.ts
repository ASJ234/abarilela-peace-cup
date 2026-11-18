import type { DatabaseSync } from "node:sqlite";
import type { Format, Group, Season, Team } from "./types";
import { LeagueError, type Row, cleanText, optionalDate, optionalId, requiredText, tx, wholeNumber } from "./validate";

export { LeagueError } from "./validate";

// ---------------------------------------------------------------------------
// Seasons
// ---------------------------------------------------------------------------

function toSeason(r: Row): Season {
  return {
    id: Number(r.id),
    name: String(r.name),
    format: (r.format === "groups" ? "groups" : "league") as Format,
    points: { win: Number(r.points_win), draw: Number(r.points_draw), loss: Number(r.points_loss) },
    highlightTop: Number(r.highlight_top),
    relegation: Number(r.relegation),
    createdAt: String(r.created_at),
  };
}

export function listSeasons(db: DatabaseSync): Season[] {
  return db.prepare("SELECT * FROM seasons ORDER BY id DESC").all().map(toSeason);
}

export function getSeason(db: DatabaseSync, id: number): Season | null {
  if (!Number.isInteger(id)) return null;
  const r = db.prepare("SELECT * FROM seasons WHERE id = ?").get(id);
  return r ? toSeason(r) : null;
}

export function mustGetSeason(db: DatabaseSync, id: number): Season {
  const s = getSeason(db, id);
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

export function createSeason(db: DatabaseSync, input: SeasonInput): Season {
  const s = parseSeason(input);
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO seasons (name, format, points_win, points_draw, points_loss, highlight_top, relegation)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(s.name, s.format, s.win, s.draw, s.loss, s.top, s.rel);
  return getSeason(db, Number(lastInsertRowid))!;
}

export function updateSeason(db: DatabaseSync, id: number, input: SeasonInput): Season {
  const current = mustGetSeason(db, id);
  const s = parseSeason({ ...input, format: input.format ?? current.format });
  if (s.format !== current.format) {
    const leagueMatches = Number(
      (db.prepare("SELECT COUNT(*) AS n FROM matches WHERE season_id = ? AND stage IS NULL").get(id) as Row).n,
    );
    if (leagueMatches > 0) {
      throw new LeagueError(
        `The format can't change while there are ${leagueMatches} league/group fixtures. Clear them on the Schedule tab first.`,
      );
    }
  }
  db.prepare(
    `UPDATE seasons SET name = ?, format = ?, points_win = ?, points_draw = ?, points_loss = ?,
       highlight_top = ?, relegation = ? WHERE id = ?`,
  ).run(s.name, s.format, s.win, s.draw, s.loss, s.top, s.rel, id);
  return getSeason(db, id)!;
}

export function deleteSeason(db: DatabaseSync, id: number): void {
  db.prepare("DELETE FROM seasons WHERE id = ?").run(id);
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export function listGroups(db: DatabaseSync, seasonId: number): Group[] {
  return db
    .prepare("SELECT id, name FROM league_groups WHERE season_id = ? ORDER BY name")
    .all(seasonId)
    .map((r) => ({ id: Number(r.id), name: String(r.name) }));
}

function groupInSeason(db: DatabaseSync, groupId: number, seasonId: number): boolean {
  return Boolean(db.prepare("SELECT 1 FROM league_groups WHERE id = ? AND season_id = ?").get(groupId, seasonId));
}

function assertGroupFormat(season: Season) {
  if (season.format !== "groups") {
    throw new LeagueError("This season uses the league format (one table). Switch it to group stage in Settings to use groups.");
  }
}

export function addGroups(db: DatabaseSync, seasonId: number, names: string[]): Group[] {
  assertGroupFormat(mustGetSeason(db, seasonId));
  const cleaned = names.map(cleanText).filter(Boolean);
  if (!cleaned.length) throw new LeagueError("Enter at least one group name.");
  const seen = new Set(listGroups(db, seasonId).map((g) => cleanText(g.name).toLowerCase()));
  const insert = db.prepare("INSERT INTO league_groups (season_id, name) VALUES (?, ?)");
  tx(db, () => {
    for (const raw of cleaned) {
      const name = requiredText(raw, "Group name", 40);
      if (seen.has(name.toLowerCase())) throw new LeagueError(`"${name}" already exists.`);
      seen.add(name.toLowerCase());
      insert.run(seasonId, name);
    }
  });
  return listGroups(db, seasonId);
}

/** Create groups "Group A", "Group B", … (skipping names that already exist). */
export function addLetteredGroups(db: DatabaseSync, seasonId: number, count: number): Group[] {
  const n = wholeNumber(count, "Number of groups", 26);
  const existing = new Set(listGroups(db, seasonId).map((g) => cleanText(g.name).toLowerCase()));
  const names: string[] = [];
  for (let i = 0; names.length < n && i < 26; i++) {
    const name = `Group ${String.fromCharCode(65 + i)}`;
    if (!existing.has(name.toLowerCase())) names.push(name);
  }
  return names.length ? addGroups(db, seasonId, names) : listGroups(db, seasonId);
}

export function renameGroup(db: DatabaseSync, groupId: number, newName: string): void {
  const name = requiredText(newName, "Group name", 40);
  const g = db.prepare("SELECT season_id FROM league_groups WHERE id = ?").get(groupId);
  if (!g) throw new LeagueError("Group not found.");
  const clash = db
    .prepare("SELECT 1 FROM league_groups WHERE season_id = ? AND name = ? AND id != ?")
    .get(Number(g.season_id), name, groupId);
  if (clash) throw new LeagueError(`"${name}" already exists.`);
  db.prepare("UPDATE league_groups SET name = ? WHERE id = ?").run(name, groupId);
}

export function deleteGroup(db: DatabaseSync, groupId: number): void {
  const used = db.prepare("SELECT COUNT(*) AS n FROM matches WHERE group_id = ?").get(groupId) as Row;
  if (Number(used.n) > 0) {
    throw new LeagueError("This group has fixtures. Delete or regenerate those fixtures before removing the group.");
  }
  db.prepare("DELETE FROM league_groups WHERE id = ?").run(groupId); // teams fall back to "no group"
}

/** Draw all teams into the season's groups at random, as evenly as possible. */
export function drawGroups(db: DatabaseSync, seasonId: number, random: () => number = Math.random): void {
  assertGroupFormat(mustGetSeason(db, seasonId));
  const groups = listGroups(db, seasonId);
  if (groups.length < 2) throw new LeagueError("Create at least 2 groups first.");
  const teams = listTeams(db, seasonId);
  if (teams.length < groups.length * 2) {
    throw new LeagueError(`${groups.length} groups need at least ${groups.length * 2} teams (2 per group).`);
  }
  for (let i = teams.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [teams[i], teams[j]] = [teams[j], teams[i]];
  }
  const update = db.prepare("UPDATE teams SET group_id = ? WHERE id = ?");
  tx(db, () => teams.forEach((t, i) => update.run(groups[i % groups.length].id, t.id)));
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

export function listTeams(db: DatabaseSync, seasonId: number): Team[] {
  return db
    .prepare("SELECT id, name, group_id FROM teams WHERE season_id = ? ORDER BY name")
    .all(seasonId)
    .map((r) => ({ id: Number(r.id), name: String(r.name), groupId: r.group_id == null ? null : Number(r.group_id) }));
}

export function getTeam(db: DatabaseSync, teamId: number): (Team & { seasonId: number }) | null {
  if (!Number.isInteger(teamId)) return null;
  const r = db.prepare("SELECT * FROM teams WHERE id = ?").get(teamId);
  if (!r) return null;
  return {
    id: Number(r.id),
    name: String(r.name),
    groupId: r.group_id == null ? null : Number(r.group_id),
    seasonId: Number(r.season_id),
  };
}

export function mustGetTeam(db: DatabaseSync, teamId: number) {
  const t = getTeam(db, teamId);
  if (!t) throw new LeagueError("Team not found.");
  return t;
}

/** Add one or more teams (e.g. pasted one per line), optionally straight into a group. */
export function addTeams(db: DatabaseSync, seasonId: number, names: string[], groupId: number | null = null): Team[] {
  mustGetSeason(db, seasonId);
  if (groupId != null && !groupInSeason(db, groupId, seasonId)) throw new LeagueError("Group not found.");
  const cleaned = names.map(cleanText).filter(Boolean);
  if (!cleaned.length) throw new LeagueError("Enter at least one team name.");

  const seen = new Set(listTeams(db, seasonId).map((t) => cleanText(t.name).toLowerCase()));
  const insert = db.prepare("INSERT INTO teams (season_id, name, group_id) VALUES (?, ?, ?)");
  tx(db, () => {
    for (const raw of cleaned) {
      const name = requiredText(raw, "Team name");
      if (seen.has(name.toLowerCase())) throw new LeagueError(`"${name}" is already in this season.`);
      seen.add(name.toLowerCase());
      insert.run(seasonId, name, groupId);
    }
  });
  return listTeams(db, seasonId);
}

export function renameTeam(db: DatabaseSync, teamId: number, newName: string): void {
  const name = requiredText(newName, "Team name");
  const team = mustGetTeam(db, teamId);
  const clash = db
    .prepare("SELECT 1 FROM teams WHERE season_id = ? AND name = ? AND id != ?")
    .get(team.seasonId, name, teamId);
  if (clash) throw new LeagueError(`"${name}" is already in this season.`);
  db.prepare("UPDATE teams SET name = ? WHERE id = ?").run(name, teamId);
}

export function setTeamGroup(db: DatabaseSync, teamId: number, groupIdRaw: unknown): void {
  const team = mustGetTeam(db, teamId);
  const groupId = optionalId(groupIdRaw);
  if (groupId != null && !groupInSeason(db, groupId, team.seasonId)) throw new LeagueError("Group not found.");
  db.prepare("UPDATE teams SET group_id = ? WHERE id = ?").run(groupId, teamId);
}

export function removeTeam(db: DatabaseSync, teamId: number): void {
  const team = getTeam(db, teamId);
  if (!team) return;
  const n = Number(
    (db.prepare("SELECT COUNT(*) AS n FROM matches WHERE home_team_id = ? OR away_team_id = ?").get(teamId, teamId) as Row).n,
  );
  if (n > 0) {
    throw new LeagueError(`${team.name} has ${n} fixture${n === 1 ? "" : "s"}. Delete or regenerate the fixtures first.`);
  }
  db.prepare("DELETE FROM teams WHERE id = ?").run(teamId); // also removes the squad
}

// ---------------------------------------------------------------------------
// Playing dates
// ---------------------------------------------------------------------------

export function listDates(db: DatabaseSync, seasonId: number): string[] {
  return db
    .prepare("SELECT date FROM playing_dates WHERE season_id = ? ORDER BY date")
    .all(seasonId)
    .map((r) => String(r.date));
}

/** Replace the season's playing dates with the given list (YYYY-MM-DD). */
export function setPlayingDates(db: DatabaseSync, seasonId: number, dates: string[]): string[] {
  mustGetSeason(db, seasonId);
  const unique = [...new Set(dates.map((d) => optionalDate(d)).filter((d): d is string => d != null))].sort();
  const insert = db.prepare("INSERT INTO playing_dates (season_id, date) VALUES (?, ?)");
  tx(db, () => {
    db.prepare("DELETE FROM playing_dates WHERE season_id = ?").run(seasonId);
    for (const d of unique) insert.run(seasonId, d);
  });
  return unique;
}
