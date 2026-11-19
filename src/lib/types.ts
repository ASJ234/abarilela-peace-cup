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

export type Team = { id: number; name: string; groupId: number | null; /** Head coach, if entered. */ coach: string | null };

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
  referee: string | null;
  groupId: number | null;
  groupName: string | null;
  /** null = league/group match (counts toward the table). Otherwise e.g. "Final". */
  stage: string | null;
  home: { id: number; name: string };
  away: { id: number; name: string };
  homeScore: number | null;
  awayScore: number | null;
  /** Penalty shoot-out score, for a knockout match that ended level. */
  homePens: number | null;
  awayPens: number | null;
  /** Place in a generated knockout round (1, 2…); null for other matches. */
  bracketSlot: number | null;
  played: boolean;
};

/** Shown when someone tries to edit a match that has a score. */
export const PLAYED_MATCH_LOCKED =
  "This match has already been played, so its teams, date, kick-off, venue and stage can't be changed. " +
  "If the score was entered by mistake, clear it first (empty both score boxes and save), then edit the match. " +
  "The referee can still be changed.";

export type EventType = "goal" | "own_goal" | "yellow" | "red";

export type MatchEvent = {
  id: number;
  matchId: number;
  type: EventType;
  /** Goals: the team credited with the goal. Cards: the player's (or coach's) team. */
  teamId: number;
  /** null when a card went to the team's coach (see `coach`). */
  player: { id: number; name: string; number: number | null } | null;
  /** The coach's name, for a card given to a coach. */
  coach: string | null;
  assist: { id: number; name: string } | null;
  /** A goal scored from the penalty spot. */
  penalty: boolean;
  minute: number | null;
  /** Added (stoppage) time: 3 for a goal in 90+3. Only set together with `minute`. */
  addedMinute: number | null;
};

/** Who an event is for: the player's name, or the coach's. */
export const eventPerson = (e: Pick<MatchEvent, "player" | "coach">) => e.player?.name ?? e.coach ?? "Unknown";

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
