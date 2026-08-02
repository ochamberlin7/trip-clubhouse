-- =============================================================
-- Trip Clubhouse — store the two real teams on each pairing.
-- Run in Supabase SQL Editor (project mjssollqfngbeetwnxml).
--
-- A pairing is a 2v2 matchup, but until now the two "sides" were purely
-- positional (slots 1&2 vs 3&4) with the real teams inferred as teams[0]/teams[1]
-- — which only works for 2-team trips. With 3-4 teams any team can face any
-- other, and one team can be split across two pairings vs different opponents,
-- so each pairing must name its two real teams.
--
-- slots 1 & 2 belong to team1_id; slots 3 & 4 belong to team2_id.
-- Idempotent.
-- =============================================================

ALTER TABLE pairings ADD COLUMN IF NOT EXISTS team1_id uuid REFERENCES teams(id);
ALTER TABLE pairings ADD COLUMN IF NOT EXISTS team2_id uuid REFERENCES teams(id);

-- Backfill existing pairings from the trip's team_index 1 & 2 — the old
-- positional assumption (teams ordered by team_index: teams[0]=side 1,
-- teams[1]=side 2), so current 2-team trips keep scoring unchanged. Only fills
-- rows that don't already have both sides set.
UPDATE pairings p
SET team1_id = t1.id,
    team2_id = t2.id
FROM rounds r
JOIN teams t1 ON t1.trip_id = r.trip_id AND t1.team_index = 1
JOIN teams t2 ON t2.trip_id = r.trip_id AND t2.team_index = 2
WHERE p.round_id = r.id
  AND (p.team1_id IS NULL OR p.team2_id IS NULL);

-- A pairing's two sides must be different teams. NULLs are allowed (a pairing
-- mid-assignment before both teams are picked) — a CHECK passes when the
-- expression is NULL, so this only rejects two equal, non-null team ids.
ALTER TABLE pairings DROP CONSTRAINT IF EXISTS pairings_teams_differ;
ALTER TABLE pairings ADD CONSTRAINT pairings_teams_differ CHECK (team1_id <> team2_id);
