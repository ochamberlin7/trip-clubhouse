-- =============================================================
-- Trip Clubhouse — live scoring.
--
-- NOTE: the live `scores` table is keyed by trip_player_id / gross_score
-- (NOT user_id / score as in the CTI reference). This app keeps that model
-- because it supports guest players (trip_players with no account) and because
-- the leaderboard / Daily MVP / Tournament Purse logic already reads it. This
-- migration adapts the CTI scoring spec to that schema.
-- Run in Supabase SQL Editor.
-- =============================================================

-- Handicaps live on trip_players.
ALTER TABLE trip_players ADD COLUMN IF NOT EXISTS handicap_index numeric DEFAULT 0;

-- Unique key so the scorecard can upsert one row per player/hole.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'scores_round_player_hole_key'
  ) THEN
    ALTER TABLE scores
      ADD CONSTRAINT scores_round_player_hole_key UNIQUE (round_id, trip_player_id, hole_number);
  END IF;
END $$;

ALTER TABLE scores ENABLE ROW LEVEL SECURITY;

-- Any member of the trip can read and write scores for that trip's rounds
-- (Trip Clubhouse lets any pairing member enter scores for their pairing).
DROP POLICY IF EXISTS "scores_select" ON scores;
CREATE POLICY "scores_select" ON scores FOR SELECT TO authenticated
USING (round_id IN (
  SELECT r.id FROM rounds r JOIN trip_players tp ON tp.trip_id = r.trip_id
  WHERE tp.user_id = auth.uid()
));

DROP POLICY IF EXISTS "scores_insert" ON scores;
CREATE POLICY "scores_insert" ON scores FOR INSERT TO authenticated
WITH CHECK (round_id IN (
  SELECT r.id FROM rounds r JOIN trip_players tp ON tp.trip_id = r.trip_id
  WHERE tp.user_id = auth.uid()
));

DROP POLICY IF EXISTS "scores_update" ON scores;
CREATE POLICY "scores_update" ON scores FOR UPDATE TO authenticated
USING (round_id IN (
  SELECT r.id FROM rounds r JOIN trip_players tp ON tp.trip_id = r.trip_id
  WHERE tp.user_id = auth.uid()
));

DROP POLICY IF EXISTS "scores_delete" ON scores;
CREATE POLICY "scores_delete" ON scores FOR DELETE TO authenticated
USING (round_id IN (
  SELECT r.id FROM rounds r JOIN trip_players tp ON tp.trip_id = r.trip_id
  WHERE tp.user_id = auth.uid()
));

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE scores;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
