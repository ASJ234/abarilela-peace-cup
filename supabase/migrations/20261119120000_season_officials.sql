-- Officials work on particular seasons only. The admin adds an official to a season; the
-- official can then see and manage that season (and no others). The admin manages every season.
-- Safe to run again.

CREATE TABLE IF NOT EXISTS season_officials (
  season_id  integer NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id    integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (season_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_season_officials_user ON season_officials(user_id);

-- Same as every other table: the public Data API can read or change nothing.
ALTER TABLE season_officials ENABLE ROW LEVEL SECURITY;
