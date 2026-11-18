import type { DatabaseSync } from "node:sqlite";

/**
 * Versioned migrations. `PRAGMA user_version` records how many have run, so an
 * existing database is upgraded in place the next time the app starts.
 * Never edit a migration that has shipped; add a new one instead.
 */
const MIGRATIONS: string[] = [
  // 1: seasons, teams, dates, matches
  `
  CREATE TABLE IF NOT EXISTS seasons (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    points_win      INTEGER NOT NULL DEFAULT 3,
    points_draw     INTEGER NOT NULL DEFAULT 1,
    points_loss     INTEGER NOT NULL DEFAULT 0,
    highlight_top   INTEGER NOT NULL DEFAULT 4,
    relegation      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS teams (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id  INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL COLLATE NOCASE,
    UNIQUE (season_id, name)
  );
  CREATE TABLE IF NOT EXISTS playing_dates (
    season_id  INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    date       TEXT    NOT NULL,
    PRIMARY KEY (season_id, date)
  );
  CREATE TABLE IF NOT EXISTS matches (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id     INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    round         INTEGER NOT NULL,
    date          TEXT,
    home_team_id  INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    away_team_id  INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    home_score    INTEGER,
    away_score    INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_matches_season ON matches(season_id, round);
  `,

  // 2: groups, kick-off/venue/stage on matches, players, match events
  `
  CREATE TABLE league_groups (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id  INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL COLLATE NOCASE,
    UNIQUE (season_id, name)
  );
  ALTER TABLE teams   ADD COLUMN group_id INTEGER REFERENCES league_groups(id) ON DELETE SET NULL;
  ALTER TABLE matches ADD COLUMN group_id INTEGER REFERENCES league_groups(id) ON DELETE SET NULL;
  -- NULL stage = league/group match that counts toward the table; otherwise e.g. 'Final'.
  ALTER TABLE matches ADD COLUMN stage    TEXT;
  ALTER TABLE matches ADD COLUMN kickoff  TEXT;   -- HH:MM
  ALTER TABLE matches ADD COLUMN venue    TEXT;
  CREATE INDEX idx_matches_date ON matches(season_id, date, kickoff);

  CREATE TABLE players (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id   INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name      TEXT    NOT NULL,
    number    INTEGER,
    position  TEXT CHECK (position IN ('GK', 'DF', 'MF', 'FW'))
  );
  CREATE INDEX idx_players_team ON players(team_id);

  CREATE TABLE match_events (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id          INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    type              TEXT    NOT NULL CHECK (type IN ('goal', 'own_goal', 'yellow', 'red')),
    -- goal/own_goal: the team credited with the goal; cards: the player's team
    team_id           INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    player_id         INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    assist_player_id  INTEGER REFERENCES players(id) ON DELETE SET NULL,
    minute            INTEGER
  );
  CREATE INDEX idx_events_match ON match_events(match_id);
  CREATE INDEX idx_events_player ON match_events(player_id);
  `,

  // 3: competition format. 'league' = one table, home & away; 'groups' = group tables, each pair meets once.
  `
  ALTER TABLE seasons ADD COLUMN format TEXT NOT NULL DEFAULT 'league' CHECK (format IN ('league', 'groups'));
  UPDATE seasons SET format = 'groups' WHERE id IN (SELECT season_id FROM league_groups);
  `,
];

export function migrate(db: DatabaseSync): void {
  db.exec("PRAGMA foreign_keys = ON");
  const current = Number((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}
