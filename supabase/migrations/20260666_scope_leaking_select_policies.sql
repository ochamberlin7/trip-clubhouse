-- =============================================================
-- Trip Clubhouse — SECURITY FIX: re-scope three over-permissive SELECT policies
-- that leaked cross-tenant data to any authenticated user (security review
-- findings C1 / H1 / M1). Confirmed live: a brand-new user, member of no trip,
-- could read every trip (incl. invite_token), every profile (name/email/GHIN/
-- handicap), and every pairing_players row.
--
--   • trips           — was leaking every trip incl. invite_token to non-members
--   • profiles        — was `USING (true)` → every user's profile/email/GHIN
--   • pairing_players — was `USING (true)` → every pairing row
--
-- After this, a user who belongs to none of a trip's group sees 0 rows in all
-- three, matching how group_members / trip_players / rounds already behave.
-- Writes were already correctly blocked and are unchanged here (SELECT-only fix).
--
-- Keeping the invite/join flow working: JoinTrip.jsx read `trips` directly by
-- invite_token, which member-only scoping would break for a not-yet-member
-- invitee. Following the existing pattern (invite_guest_list / invite_commissioner
-- / claim_invite_slot are all token-gated SECURITY DEFINER RPCs), a new
-- trip_by_invite_token(uuid) RPC returns the single trip matching a token —
-- bypassing RLS but gated on the token (the secret shared only via /join/:token).
--
-- Idempotent. Run in Supabase SQL Editor (project mjssollqfngbeetwnxml).
-- =============================================================

-- Helper: does the current user share a group with `other_uid`? SECURITY DEFINER
-- so it reads group_members without tripping that table's own RLS (and so the
-- profiles policy calling it can't recurse). STABLE + pinned search_path, mirrors
-- the existing is_group_member / is_group_admin helpers.
CREATE OR REPLACE FUNCTION public.shares_group_with(other_uid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM group_members gm_self
    JOIN group_members gm_other ON gm_other.group_id = gm_self.group_id
    WHERE gm_self.user_id = auth.uid()
      AND gm_other.user_id = other_uid
  );
$$;

-- Token-gated lookup of the single trip an invitee is joining. SECURITY DEFINER
-- (bypasses the newly-scoped trips_select) but only ever returns the row whose
-- invite_token equals the caller-supplied token — no enumeration, no leak.
CREATE OR REPLACE FUNCTION public.trip_by_invite_token(p_invite_token uuid)
RETURNS SETOF public.trips
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT * FROM public.trips
  WHERE p_invite_token IS NOT NULL
    AND invite_token = p_invite_token
    AND deleted_at IS NULL;
$$;
GRANT EXECUTE ON FUNCTION public.trip_by_invite_token(uuid) TO authenticated;

-- ── trips: members of the trip's group only (was leaking ALL trips) ──
DROP POLICY IF EXISTS "trips_select" ON public.trips;
CREATE POLICY "trips_select" ON public.trips
  FOR SELECT TO authenticated
  USING (is_group_member(group_id));

-- ── profiles: only yourself + people who share a group with you (was USING true) ──
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR shares_group_with(id));

-- ── pairing_players: pairings of rounds in trips you play in (was USING true).
--    Mirrors pairings_select so the two pairing tables agree on visibility. ──
DROP POLICY IF EXISTS "pairing_players_select" ON public.pairing_players;
CREATE POLICY "pairing_players_select" ON public.pairing_players
  FOR SELECT TO authenticated
  USING (pairing_id IN (
    SELECT p.id FROM pairings p
    WHERE p.round_id IN (
      SELECT r.id FROM rounds r
      JOIN trip_players tp ON tp.trip_id = r.trip_id
      WHERE tp.user_id = auth.uid()
    )
  ));
