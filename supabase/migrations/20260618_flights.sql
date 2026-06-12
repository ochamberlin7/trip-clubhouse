-- =============================================================
-- Trip Clubhouse — per-player flight / travel details.
-- Run in Supabase SQL Editor.
-- =============================================================

CREATE TABLE IF NOT EXISTS flights (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id uuid REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
  trip_player_id uuid REFERENCES trip_players(id) ON DELETE CASCADE NOT NULL,
  is_driving boolean DEFAULT false,
  arrive_date text,
  arrive_time text,
  arrive_airport text,
  flight_number_in text,
  depart_date text,
  depart_time text,
  depart_airport text,
  flight_number_out text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(trip_id, trip_player_id)
);

ALTER TABLE flights ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flights TO authenticated;

-- A player can edit their own flight; commissioners can edit any in their trip.
-- All trip members can read.
DROP POLICY IF EXISTS "flights_select" ON flights;
CREATE POLICY "flights_select" ON flights FOR SELECT TO authenticated
USING (trip_id IN (SELECT trip_id FROM trip_players WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "flights_insert" ON flights;
CREATE POLICY "flights_insert" ON flights FOR INSERT TO authenticated
WITH CHECK (
  trip_player_id IN (SELECT id FROM trip_players WHERE user_id = auth.uid() OR claimed_user_id = auth.uid())
  OR trip_id IN (SELECT t.id FROM trips t JOIN group_members gm ON gm.group_id = t.group_id WHERE gm.user_id = auth.uid() AND gm.role = 'admin')
);

DROP POLICY IF EXISTS "flights_update" ON flights;
CREATE POLICY "flights_update" ON flights FOR UPDATE TO authenticated
USING (
  trip_player_id IN (SELECT id FROM trip_players WHERE user_id = auth.uid() OR claimed_user_id = auth.uid())
  OR trip_id IN (SELECT t.id FROM trips t JOIN group_members gm ON gm.group_id = t.group_id WHERE gm.user_id = auth.uid() AND gm.role = 'admin')
);
