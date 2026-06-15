-- =============================================================
-- Trip Clubhouse — per-player tee selection per round.
-- Each player may play a different tee in a given round, which changes their
-- course handicap (WHS: round(handicap_index * slope/113 + (rating - par))).
-- A missing row means the player falls back to the round's default tee.
-- Run in Supabase SQL Editor.
-- =============================================================

CREATE TABLE IF NOT EXISTS player_rounds (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_player_id  uuid NOT NULL REFERENCES trip_players(id) ON DELETE CASCADE,
  round_id        uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  tee_name        text,
  slope           integer,
  rating          numeric,
  par             integer,
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(trip_player_id, round_id)
);

ALTER TABLE player_rounds ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_rounds TO authenticated;

-- All trip members can read; only the commissioner (group admin) can write.
DROP POLICY IF EXISTS "player_rounds_select" ON player_rounds;
CREATE POLICY "player_rounds_select" ON player_rounds FOR SELECT TO authenticated
USING (round_id IN (SELECT id FROM rounds WHERE trip_id IN (SELECT id FROM trips WHERE is_group_member(group_id))));

DROP POLICY IF EXISTS "player_rounds_insert" ON player_rounds;
CREATE POLICY "player_rounds_insert" ON player_rounds FOR INSERT TO authenticated
WITH CHECK (round_id IN (SELECT id FROM rounds WHERE trip_id IN (SELECT id FROM trips WHERE is_group_admin(group_id))));

DROP POLICY IF EXISTS "player_rounds_update" ON player_rounds;
CREATE POLICY "player_rounds_update" ON player_rounds FOR UPDATE TO authenticated
USING (round_id IN (SELECT id FROM rounds WHERE trip_id IN (SELECT id FROM trips WHERE is_group_admin(group_id))))
WITH CHECK (round_id IN (SELECT id FROM rounds WHERE trip_id IN (SELECT id FROM trips WHERE is_group_admin(group_id))));

DROP POLICY IF EXISTS "player_rounds_delete" ON player_rounds;
CREATE POLICY "player_rounds_delete" ON player_rounds FOR DELETE TO authenticated
USING (round_id IN (SELECT id FROM rounds WHERE trip_id IN (SELECT id FROM trips WHERE is_group_admin(group_id))));

-- Realtime so a commissioner's tee change recalculates scores live on every
-- client — including retroactively on completed rounds.
ALTER TABLE player_rounds REPLICA IDENTITY FULL;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE player_rounds; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
