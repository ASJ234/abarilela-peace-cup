-- Penalty goals, cards for coaches, each team's coach, and each match's referee.
-- Safe to run again.

-- A goal can be marked as scored from the penalty spot.
ALTER TABLE match_events ADD COLUMN IF NOT EXISTS penalty boolean NOT NULL DEFAULT false;

-- A card can go to a team's coach instead of a player. The coach's name is kept on the card,
-- so it still reads correctly if the team changes coach later.
ALTER TABLE match_events ADD COLUMN IF NOT EXISTS coach_name text;
ALTER TABLE match_events ALTER COLUMN player_id DROP NOT NULL;

-- Every event is for exactly one person: a player, or (cards only) a coach.
ALTER TABLE match_events DROP CONSTRAINT IF EXISTS match_events_person_check;
ALTER TABLE match_events ADD CONSTRAINT match_events_person_check CHECK (
  (player_id IS NOT NULL AND coach_name IS NULL)
  OR (player_id IS NULL AND coach_name IS NOT NULL AND type IN ('yellow', 'red'))
);
-- Only a goal can be a penalty (an own goal or a card can't).
ALTER TABLE match_events DROP CONSTRAINT IF EXISTS match_events_penalty_check;
ALTER TABLE match_events ADD CONSTRAINT match_events_penalty_check CHECK (NOT penalty OR type = 'goal');

-- The team's head coach (optional), shown on the team page and offered when recording a card.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS coach text;

-- The match referee (optional).
ALTER TABLE matches ADD COLUMN IF NOT EXISTS referee text;
