-- =============================================================
-- Trip Clubhouse — revert the trip_players SELECT policy back to 4 clauses.
--
-- The invite-token session-variable approach (20260642: set_config +
-- app.invite_token clause) proved unreliable — PostgREST runs each request in
-- its own transaction on a pooled connection, so the session GUC set by the
-- set_config RPC does not persist into the follow-up guest-list query. JoinTrip
-- now fetches the guest list exclusively through the token-gated SECURITY
-- DEFINER RPC (invite_guest_list), which bypasses RLS entirely, so the 5th clause
-- is no longer needed.
--
-- Re-declare the policy with only the original 4 clauses:
--   1. group member of the trip's group
--   2. row already claimed by this user
--   3. email match (case-insensitive, trimmed)
--   4. phone match (digits-only, top-level or user_metadata phone)
--
-- The public.set_config / public.get_invite_token_setting helpers are left in
-- place (harmless, no longer called). Idempotent. Run in Supabase SQL Editor
-- (project mjssollqfngbeetwnxml).
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
