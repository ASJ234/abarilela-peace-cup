-- Knockout matches: penalty shoot-outs, and each match's place in the bracket.
-- Safe to run again.

-- Shoot-out score, for a knockout (stage) match that ended level.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS home_pens integer;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS away_pens integer;
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_pens_check;
ALTER TABLE matches ADD CONSTRAINT matches_pens_check CHECK (
  (home_pens IS NULL AND away_pens IS NULL)
  OR (home_pens IS NOT NULL AND away_pens IS NOT NULL AND home_pens <> away_pens
      AND stage IS NOT NULL AND home_score IS NOT NULL AND home_score = away_score)
);

-- Position in a generated knockout round (1, 2, 3…). The winners of slots 1 and 2 meet
-- in the next round, then 3 and 4, and so on. NULL for matches added by hand.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS bracket_slot integer;
