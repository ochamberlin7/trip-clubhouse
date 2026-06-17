-- =============================================================
-- Trip Clubhouse — let an invitee read + claim their guest-list slot by email.
--
-- The trip_players_update policy (20260614) already allowed a self-claim when
-- (is_claimed = false AND email = auth.jwt email), but:
--   1. The trip_players_select policy had NO matching email clause, so a
--      not-yet-member invitee could not even READ their slot — JoinTrip saw 0
--      rows and showed "not on the guest list" regardless of email case.
--   2. Both email comparisons were case-sensitive / untrimmed, while Supabase
--      Auth returns lowercased emails and stored emails may have mixed case or
--      stray whitespace.
--
-- Fix: add a case-insensitive, trimmed email clause to SELECT (and a
-- claimed_user_id clause so a user can always see rows they've claimed), and
-- normalize the UPDATE self-claim clause the same way. Additive + idempotent.
-- Run in Supabase SQL Editor.
-- =============================================================

DROP POLICY IF EXISTS "trip_players_select" ON public.trip_players;
CREATE POLICY "trip_players_select" ON public.trip_players
  FOR SELECT TO authenticated
  USING (
    trip_id IN (SELECT id FROM trips WHERE is_group_member(group_id))
    OR claimed_user_id = auth.uid()
    OR lower(trim(email)) = lower(trim(auth.jwt() ->> 'email'))
  );

DROP POLICY IF EXISTS "trip_players_update" ON public.trip_players;
CREATE POLICY "trip_players_update" ON public.trip_players
  FOR UPDATE TO authenticated
  USING (
    trip_id IN (SELECT id FROM trips WHERE is_group_admin(group_id))
    OR user_id = auth.uid()
    OR claimed_user_id = auth.uid()
    OR (is_claimed = false AND lower(trim(email)) = lower(trim(auth.jwt() ->> 'email')))
  )
  WITH CHECK (true);
