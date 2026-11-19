-- A player can't assist their own goal. The app already refuses it; this makes the database
-- refuse it too, so it can't slip in another way (e.g. a script or the SQL Editor).
-- Safe to run again.

ALTER TABLE match_events DROP CONSTRAINT IF EXISTS match_events_no_self_assist;
ALTER TABLE match_events ADD CONSTRAINT match_events_no_self_assist
  CHECK (assist_player_id IS NULL OR assist_player_id <> player_id);
