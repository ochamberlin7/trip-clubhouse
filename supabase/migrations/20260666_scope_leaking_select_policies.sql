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
-- NAME-AGNOSTIC DROP: production RLS has drifted from the migration history, so we
-- do NOT trust hard-coded policy names. Instead we loop pg_policies and drop EVERY
-- existing SELECT-command policy on each of the three tables, then create exactly
-- one correctly-scoped policy. This prevents a stale leaky SELECT policy from
-- surviving under a different name and being OR'd together with the new one
-- (Postgres unions permissive policies). FOR ALL / write policies are untouched.
-- The RAISE NOTICE lines print the real policy names that were dropped.
--
-- Keeping the invite/join flow working: JoinTrip.jsx read `trips` directly by
-- invite_token, which member-only scoping would break for a not-yet-member
-- invitee. Following the existing pattern (invite_guest_list / invite_commissioner
-- / claim_invite_slot are token-gated SECURITY DEFINER RPCs granted to
-- `authenticated`), a new trip_by_invite_token(uuid) RPC returns the single trip
-- matching a token — bypassing RLS but gated on the token. The join page redirects
-- anon visitors to /login before reading any trip data, so authenticated-only
-- grant is sufficient (mirrors the existing invite RPCs).
--
-- ATOMIC: the whole script runs in one transaction (BEGIN … COMMIT). If ANY
-- statement fails — e.g. a CREATE POLICY can't find is_group_member(uuid) — the
-- entire thing rolls back, so we never end up with a table whose old SELECT
-- policy was dropped but whose replacement was never created (RLS-on + zero
-- policies = deny-all lockout for real members, worse than the leak).
--
-- Idempotent. Run in Supabase SQL Editor (project mjssollqfngbeetwnxml).
-- =============================================================

BEGIN;

-- Fail fast, before dropping anything: the trips policy below depends on
-- is_group_member(uuid). If it's absent under that exact signature, abort now
-- with a clear message (and roll back — nothing has changed yet).
DO $$
BEGIN
  IF to_regprocedure('public.is_group_member(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Required function public.is_group_member(uuid) is missing — aborting migration (no changes made).';
  END IF;
END $$;

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

-- ── Drop EVERY existing SELECT policy on the three tables (by real name) ──
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('trips', 'profiles', 'pairing_players')
      AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    RAISE NOTICE 'Dropped SELECT policy "%" on public.%', pol.policyname, pol.tablename;
  END LOOP;
END $$;

-- ── trips: members of the trip's group only (was leaking ALL trips) ──
CREATE POLICY "trips_select" ON public.trips
  FOR SELECT TO authenticated
  USING (is_group_member(group_id));

-- ── profiles: only yourself + people who share a group with you (was USING true) ──
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR shares_group_with(id));

-- ── pairing_players: members of the trip's group (was USING true). Scopes
--    through is_group_member(group_id) — identical to the existing correct
--    "Members can view pairing players" policy and to the trips/profiles fixes.
--    NOT trip_players-scoped: a group member without a trip_players row for a
--    given trip (a non-playing commissioner, or a member of a multi-trip group
--    who isn't a player in this particular trip) can see pairing_players today,
--    and this must not narrow that. ──
CREATE POLICY "pairing_players_select" ON public.pairing_players
  FOR SELECT TO authenticated
  USING (pairing_id IN (
    SELECT p.id FROM pairings p
    JOIN rounds r ON r.id = p.round_id
    JOIN trips t ON t.id = r.trip_id
    WHERE is_group_member(t.group_id)
  ));

-- ── Post-check: each table should now have EXACTLY ONE SELECT policy, the new
--    scoped one. Any other row here means a stale policy survived — investigate. ──
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, count(*) AS n, string_agg(policyname, ', ') AS names
    FROM pg_policies
    WHERE schemaname='public' AND tablename IN ('trips','profiles','pairing_players') AND cmd='SELECT'
    GROUP BY tablename
  LOOP
    RAISE NOTICE 'SELECT policies now on %: % (%).', r.tablename, r.n, r.names;
  END LOOP;
END $$;

COMMIT;
