-- =============================================================
-- Trip Clubhouse — pairing slots + per-hole drink tracking.
--
-- NOTE: scores and drinks are keyed by trip_player_id (not user_id) to match
-- the existing scores table, support guest players, and feed the leaderboard /
-- MVP / purse logic. pairing_players gets a team_slot (1=T1P1 .. 4=T2P2).
-- Run in Supabase SQL Editor.
-- =============================================================

-- ── Drinks (per player / hole) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS drinks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id uuid REFERENCES rounds(id) ON DELETE CASCADE NOT NULL,
  trip_player_id uuid REFERENCES trip_players(id) ON DELETE CASCADE NOT NULL,
  hole_number integer NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  created_at timestamptz DEFAULT now(),
  UNIQUE(round_id, trip_player_id, hole_number)
);
ALTER TABLE drinks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "drinks_select" ON drinks;
CREATE POLICY "drinks_select" ON drinks FOR SELECT TO authenticated
USING (round_id IN (SELECT r.id FROM rounds r JOIN trip_players tp ON tp.trip_id = r.trip_id WHERE tp.user_id = auth.uid()));
DROP POLICY IF EXISTS "drinks_insert" ON drinks;
CREATE POLICY "drinks_insert" ON drinks FOR INSERT TO authenticated
WITH CHECK (round_id IN (SELECT r.id FROM rounds r JOIN trip_players tp ON tp.trip_id = r.trip_id WHERE tp.user_id = auth.uid()));
DROP POLICY IF EXISTS "drinks_update" ON drinks;
CREATE POLICY "drinks_update" ON drinks FOR UPDATE TO authenticated
USING (round_id IN (SELECT r.id FROM rounds r JOIN trip_players tp ON tp.trip_id = r.trip_id WHERE tp.user_id = auth.uid()));
DROP POLICY IF EXISTS "drinks_delete" ON drinks;
CREATE POLICY "drinks_delete" ON drinks FOR DELETE TO authenticated
USING (round_id IN (SELECT r.id FROM rounds r JOIN trip_players tp ON tp.trip_id = r.trip_id WHERE tp.user_id = auth.uid()));

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE drinks; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Pairing slots ────────────────────────────────────────────────
ALTER TABLE pairing_players ADD COLUMN IF NOT EXISTS team_slot integer;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pairing_players_pairing_slot_key') THEN
    ALTER TABLE pairing_players ADD CONSTRAINT pairing_players_pairing_slot_key UNIQUE (pairing_id, team_slot);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pairings_round_number_key') THEN
    ALTER TABLE pairings ADD CONSTRAINT pairings_round_number_key UNIQUE (round_id, pairing_number);
  END IF;
END $$;

-- RLS: members read; group admins (commissioners) manage.
ALTER TABLE pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pairing_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pairings_select" ON pairings;
CREATE POLICY "pairings_select" ON pairings FOR SELECT TO authenticated
USING (round_id IN (SELECT r.id FROM rounds r JOIN trip_players tp ON tp.trip_id = r.trip_id WHERE tp.user_id = auth.uid()));
DROP POLICY IF EXISTS "pairings_manage" ON pairings;
CREATE POLICY "pairings_manage" ON pairings FOR ALL TO authenticated
USING (round_id IN (
  SELECT r.id FROM rounds r JOIN group_members gm ON gm.group_id = (SELECT group_id FROM trips WHERE id = r.trip_id)
  WHERE gm.user_id = auth.uid() AND gm.role = 'admin'
))
WITH CHECK (round_id IN (
  SELECT r.id FROM rounds r JOIN group_members gm ON gm.group_id = (SELECT group_id FROM trips WHERE id = r.trip_id)
  WHERE gm.user_id = auth.uid() AND gm.role = 'admin'
));

DROP POLICY IF EXISTS "pairing_players_select" ON pairing_players;
CREATE POLICY "pairing_players_select" ON pairing_players FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "pairing_players_manage" ON pairing_players;
CREATE POLICY "pairing_players_manage" ON pairing_players FOR ALL TO authenticated
USING (pairing_id IN (
  SELECT p.id FROM pairings p JOIN rounds r ON r.id = p.round_id
  JOIN group_members gm ON gm.group_id = (SELECT group_id FROM trips WHERE id = r.trip_id)
  WHERE gm.user_id = auth.uid() AND gm.role = 'admin'
))
WITH CHECK (pairing_id IN (
  SELECT p.id FROM pairings p JOIN rounds r ON r.id = p.round_id
  JOIN group_members gm ON gm.group_id = (SELECT group_id FROM trips WHERE id = r.trip_id)
  WHERE gm.user_id = auth.uid() AND gm.role = 'admin'
));

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE pairing_players; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE pairings; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
