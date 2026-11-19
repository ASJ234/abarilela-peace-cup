-- Abarilela Peace Cup: delete all league data and start again, keeping the tables.
--
-- Run it in the Supabase SQL Editor. It removes every season, with its groups, teams,
-- playing dates, matches, squads, goals and cards. User accounts (and sign-ins) are KEPT;
-- fans' favourite teams are cleared, since those teams no longer exist.
-- There is no undo: download a backup first (Database → Backups) if you might need the data.

BEGIN;

-- Deleting the seasons removes everything that belongs to them (ON DELETE CASCADE),
-- and sets users.favourite_team_id to NULL (ON DELETE SET NULL).
DELETE FROM seasons;

-- New rows start again from id 1.
SELECT setval(pg_get_serial_sequence('seasons', 'id'), 1, false);
SELECT setval(pg_get_serial_sequence('league_groups', 'id'), 1, false);
SELECT setval(pg_get_serial_sequence('teams', 'id'), 1, false);
SELECT setval(pg_get_serial_sequence('matches', 'id'), 1, false);
SELECT setval(pg_get_serial_sequence('players', 'id'), 1, false);
SELECT setval(pg_get_serial_sequence('match_events', 'id'), 1, false);

COMMIT;

-- To ALSO delete every user account, including the admin, remove the "--" from the next
-- line before running. Afterwards, create the admin again with: npm run admin -- <username> <password>
-- TRUNCATE users, sessions RESTART IDENTITY;
