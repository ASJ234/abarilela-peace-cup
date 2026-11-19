-- Row-level security on, with no policies, for every table.
-- The app connects as the database owner, which bypasses RLS. Supabase's public Data API
-- (the anon and authenticated keys) can then read or change nothing, so nobody can fetch
-- users' password hashes or edit results through it. Safe to run again.

ALTER TABLE seasons        ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_groups  ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams          ENABLE ROW LEVEL SECURITY;
ALTER TABLE playing_dates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches        ENABLE ROW LEVEL SECURITY;
ALTER TABLE players        ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions       ENABLE ROW LEVEL SECURITY;
