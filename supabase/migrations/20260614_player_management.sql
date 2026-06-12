-- =============================================================
-- Trip Clubhouse — player management (names, invite links, claims).
-- Run in Supabase SQL Editor.
-- =============================================================

-- Player info fields on trip_players.
ALTER TABLE trip_players ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE trip_players ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE trip_players ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE trip_players ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE trip_players ADD COLUMN IF NOT EXISTS handicap_index numeric;
ALTER TABLE trip_players ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES teams(id);
ALTER TABLE trip_players ADD COLUMN IF NOT EXISTS is_claimed boolean DEFAULT false;
ALTER TABLE trip_players ADD COLUMN IF NOT EXISTS claimed_user_id uuid REFERENCES auth.users(id);

-- Invite token on trips.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS invite_token uuid DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS trips_invite_token_idx ON trips(invite_token);

-- Backfill tokens for any existing trips that predate the column.
UPDATE trips SET invite_token = gen_random_uuid() WHERE invite_token IS NULL;

-- Allow anyone signed in to look up a trip by its invite token (join flow).
DROP POLICY IF EXISTS "trips_select_by_invite" ON trips;
CREATE POLICY "trips_select_by_invite" ON trips
  FOR SELECT TO authenticated
  USING (true);

-- ── trip_players write policies ──────────────────────────────────
-- The original insert policy only allowed group admins (for the wizard).
-- Add: a user may insert their OWN row (join flow), and update either as a
-- group admin (Players page edits) or to claim a row that's theirs / matches
-- their email (join flow).
ALTER TABLE trip_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trip_players_self_insert" ON trip_players;
CREATE POLICY "trip_players_self_insert" ON trip_players
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "trip_players_update" ON trip_players;
CREATE POLICY "trip_players_update" ON trip_players
  FOR UPDATE TO authenticated
  USING (
    trip_id IN (SELECT id FROM trips WHERE is_group_admin(group_id))
    OR user_id = auth.uid()
    OR claimed_user_id = auth.uid()
    OR (is_claimed = false AND email = (auth.jwt() ->> 'email'))
  )
  WITH CHECK (true);
