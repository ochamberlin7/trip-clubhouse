-- =============================================================
-- Trip Clubhouse — open player_rounds to all trip members.
-- Per-player tee selection is no longer commissioner-gated: any logged-in trip
-- member may read and write any player's tee for a round (mirrors how scores
-- and drinks are open to all members). Replaces the admin-only policies from
-- 20260629_player_rounds.sql.
-- Run in Supabase SQL Editor.
-- =============================================================

DROP POLICY IF EXISTS "player_rounds_select" ON player_rounds;
DROP POLICY IF EXISTS "player_rounds_insert" ON player_rounds;
DROP POLICY IF EXISTS "player_rounds_update" ON player_rounds;
DROP POLICY IF EXISTS "player_rounds_delete" ON player_rounds;

-- Membership: any trip_players row for the round's trip owned/claimed by the user.
CREATE POLICY "player_rounds_select" ON player_rounds FOR SELECT TO authenticated
USING (round_id IN (
  SELECT r.id FROM rounds r JOIN trip_players tp ON tp.trip_id = r.trip_id
  WHERE tp.user_id = auth.uid() OR tp.claimed_user_id = auth.uid()
));

CREATE POLICY "player_rounds_insert" ON player_rounds FOR INSERT TO authenticated
WITH CHECK (round_id IN (
  SELECT r.id FROM rounds r JOIN trip_players tp ON tp.trip_id = r.trip_id
  WHERE tp.user_id = auth.uid() OR tp.claimed_user_id = auth.uid()
));

CREATE POLICY "player_rounds_update" ON player_rounds FOR UPDATE TO authenticated
USING (round_id IN (
  SELECT r.id FROM rounds r JOIN trip_players tp ON tp.trip_id = r.trip_id
  WHERE tp.user_id = auth.uid() OR tp.claimed_user_id = auth.uid()
))
WITH CHECK (round_id IN (
  SELECT r.id FROM rounds r JOIN trip_players tp ON tp.trip_id = r.trip_id
  WHERE tp.user_id = auth.uid() OR tp.claimed_user_id = auth.uid()
));

CREATE POLICY "player_rounds_delete" ON player_rounds FOR DELETE TO authenticated
USING (round_id IN (
  SELECT r.id FROM rounds r JOIN trip_players tp ON tp.trip_id = r.trip_id
  WHERE tp.user_id = auth.uid() OR tp.claimed_user_id = auth.uid()
));
