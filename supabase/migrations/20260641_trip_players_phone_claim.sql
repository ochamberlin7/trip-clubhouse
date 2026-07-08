-- =============================================================
-- Trip Clubhouse — let an invitee READ + CLAIM their guest-list slot by PHONE,
-- the same way the email clause (20260636) already allows it.
--
-- Problem: a guest whose card has NO email could not even READ their trip_players
-- row (the SELECT policy only matched on email / membership / claimed_user_id),
-- so JoinTrip saw 0 rows and produced the E0-P0-N0 "not on the guest list" state.
--
-- Fix: add a phone clause to SELECT (so the invitee can read their own slot) and
-- the same clause to UPDATE (so the phone-matched self-claim can set user_id /
-- claimed_user_id). Digits-only comparison on both sides (strip everything that
-- isn't 0-9), matching JoinTrip's client-side normalization.
--
-- Note on the auth side: signup stores the phone in user_metadata, so the JWT's
-- top-level `phone` claim is empty for email/password accounts. We therefore read
-- the top-level `phone` first (for phone-auth accounts) and fall back to
-- `user_metadata.phone` (where this app actually stores it). nullif(...,'') guards
-- ensure an empty phone on either side never matches (a phoneless user can't read
-- phoneless slots).
--
-- Additive + idempotent. Run in Supabase SQL Editor (project mjssollqfngbeetwnxml).
-- =============================================================

DROP POLICY IF EXISTS "trip_players_select" ON public.trip_players;
CREATE POLICY "trip_players_select" ON public.trip_players
  FOR SELECT TO authenticated
  USING (
    trip_id IN (SELECT id FROM trips WHERE is_group_member(group_id))
    OR claimed_user_id = auth.uid()
    OR lower(trim(email)) = lower(trim(auth.jwt() ->> 'email'))
    OR nullif(regexp_replace(phone, '[^0-9]', '', 'g'), '')
       = nullif(regexp_replace(
           coalesce(nullif(auth.jwt() ->> 'phone', ''), auth.jwt() -> 'user_metadata' ->> 'phone'),
           '[^0-9]', '', 'g'), '')
  );

DROP POLICY IF EXISTS "trip_players_update" ON public.trip_players;
CREATE POLICY "trip_players_update" ON public.trip_players
  FOR UPDATE TO authenticated
  USING (
    trip_id IN (SELECT id FROM trips WHERE is_group_admin(group_id))
    OR user_id = auth.uid()
    OR claimed_user_id = auth.uid()
    OR (is_claimed = false AND lower(trim(email)) = lower(trim(auth.jwt() ->> 'email')))
    OR (is_claimed = false AND nullif(regexp_replace(phone, '[^0-9]', '', 'g'), '')
        = nullif(regexp_replace(
            coalesce(nullif(auth.jwt() ->> 'phone', ''), auth.jwt() -> 'user_metadata' ->> 'phone'),
            '[^0-9]', '', 'g'), ''))
  )
  WITH CHECK (true);
