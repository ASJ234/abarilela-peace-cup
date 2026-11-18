export type Points = { win: number; draw: number; loss: number };

/**
 * - league: every team in one table, each pair plays home and away.
 * - groups: teams split into groups with a table each, each pair in a group meets once.
 */
export type Format = "league" | "groups";
export const FORMAT_LABEL: Record<Format, string> = { league: "League", groups: "Group stage" };

export type Season = {
  id: number;
  name: string;
  format: Format;
  /** Pinned by the admin as the season shown on the home page. */
  pinned: boolean;
  points: Points;
  /** How many places at the top of each table are highlighted (e.g. 4). */
  highlightTop: number;
  /** How many places at the bottom are marked as the relegation zone (0 = none). */
  relegation: number;
  createdAt: string;
};

export type Group = { id: number; name: string };

export type Team = { id: number; name: string; groupId: number | null };

export type Position = "GK" | "DF" | "MF" | "FW";
export const POSITIONS: Position[] = ["GK", "DF", "MF", "FW"];
export const POSITION_LABEL: Record<Position, string> = {
  GK: "Goalkeeper",
  DF: "Defender",
  MF: "Midfielder",
  FW: "Forward",
};

export type Player = {
  id: number;
  teamId: number;
  name: string;
  number: number | null;
  position: Position | null;
};

export type Match = {
  id: number;
  round: number;
  date: string | null; // YYYY-MM-DD
  kickoff: string | null; // HH:MM
  venue: string | null;
  groupId: number | null;
  groupName: string | null;
  /** null = league/group match (counts toward the table). Otherwise e.g. "Final". */
  stage: string | null;
  home: { id: number; name: string };
  away: { id: number; name: string };
  homeScore: number | null;
  awayScore: number | null;
  played: boolean;
};

export type EventType = "goal" | "own_goal" | "yellow" | "red";

export type MatchEvent = {
  id: number;
  matchId: number;
  type: EventType;
  /** Goals: the team credited with the goal. Cards: the player's team. */
  teamId: number;
  player: { id: number; name: string; number: number | null };
  assist: { id: number; name: string } | null;
  minute: number | null;
};

export type FormResult = "W" | "D" | "L";

export type StandingRow = {
  position: number;
  teamId: number;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  /** Last five results, oldest first. */
  form: FormResult[];
  zone: "top" | "relegation" | null;
};

export type GroupTable = { group: Group | null; rows: StandingRow[] };

export type PlayerStat = {
  playerId: number;
  name: string;
  number: number | null;
  teamId: number;
  teamName: string;
  count: number;
};

export type DisciplineStat = Omit<PlayerStat, "count"> & { red: number; yellow: number };
