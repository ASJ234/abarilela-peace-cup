import type { DatabaseSync } from "node:sqlite";

/**
 * The SQLite schema the app used before moving to Postgres. Kept only so
 * `npm run db:copy-sqlite` can bring an older league.db up to date before copying it.
 *
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

  // 4: user accounts (fans, officials, admin) and sign-in sessions
  `
  CREATE TABLE users (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    email              TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    name               TEXT    NOT NULL,
    password_hash      TEXT    NOT NULL,
    role               TEXT    NOT NULL DEFAULT 'fan' CHECK (role IN ('fan', 'official', 'admin')),
    favourite_team_id  INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  -- Only a hash of each session token is stored, so a leaked database can't be used to sign in.
  CREATE TABLE sessions (
    token_hash  TEXT    PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  INTEGER NOT NULL
  );
  CREATE INDEX idx_sessions_user ON sessions(user_id);
  `,

  // 5: sign in with a username instead of an email. Existing accounts get the part of
  //    their email before "@" plus their id (e.g. "grace_2"), and the email is dropped.
  `
  ALTER TABLE users RENAME COLUMN email TO username;
  UPDATE users
     SET username = lower(substr(username, 1, instr(username, '@') - 1)) || '_' || id
   WHERE instr(username, '@') > 0;
  `,

  // 6: there is exactly one admin. Extra admins (if any) become fans, keeping the oldest.
  `
  UPDATE users SET role = 'fan'
   WHERE role = 'admin' AND id <> (SELECT MIN(id) FROM users WHERE role = 'admin');
  CREATE UNIQUE INDEX idx_users_single_admin ON users(role) WHERE role = 'admin';
  `,

  // 7: the admin can pin one season to the home page (otherwise it's chosen automatically).
  `
  ALTER TABLE seasons ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1));
  CREATE UNIQUE INDEX idx_seasons_single_pin ON seasons(pinned) WHERE pinned = 1;
  `,

  // 8: added (stoppage) time on match events, e.g. a goal in 90+3 is minute 90, added_minute 3.
  `
  ALTER TABLE match_events ADD COLUMN added_minute INTEGER;
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
