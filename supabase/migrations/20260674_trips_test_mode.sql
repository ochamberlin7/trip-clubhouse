-- =============================================================
-- Trip Clubhouse — per-trip TEST MODE for score-entry development/testing.
--
-- UNAPPLIED until you run it in the Supabase SQL Editor.
--
-- WHY: writes to scores/drinks are scoped to the player's own pairing (migration
-- 20260672 — commissioners included). That's the production rule and stays intact.
-- For development/testing, one account needs to enter scores for ANY pairing. This
-- adds an opt-in, per-trip flag that grants that power to a SINGLE dev account only,
-- and ONLY on a trip explicitly flagged for testing. Real trips (test_mode = false)
-- are completely unaffected; no other user ever gains write access from this flag.
--
-- The dev account is identified by email below. To hand this to someone else, change
-- the email in can_write_score (and the UI gate in TripDashboard.jsx).
-- =============================================================

ALTER TABLE trips ADD COLUMN IF NOT EXISTS test_mode boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN trips.test_mode IS
  'Dev/testing only: when true, the designated dev account may enter scores for any pairing in this trip (see can_write_score). Must stay false on real trips.';

-- Extend the pairing-scoped write check with a narrow dev override: the row''s trip is
-- in test_mode AND the caller is the designated dev account (by email). Everything
-- else is byte-for-byte the original 20260672 rule, so normal pairing scoping is
-- unchanged for every real trip and every other user.
CREATE OR REPLACE FUNCTION public.can_write_score(p_round_id uuid, p_trip_player_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Normal rule: the caller''s trip_player (by account or claimed guest slot) is in
    -- the SAME pairing, for that round, as the row''s trip_player.
    EXISTS (
      SELECT 1
      FROM pairings pg
      JOIN pairing_players pp_target ON pp_target.pairing_id = pg.id
      JOIN pairing_players pp_me     ON pp_me.pairing_id = pg.id
      JOIN trip_players me           ON me.id = pp_me.trip_player_id
      WHERE pg.round_id = p_round_id
        AND pp_target.trip_player_id = p_trip_player_id
        AND (me.user_id = auth.uid() OR me.claimed_user_id = auth.uid())
    )
    OR
    -- Dev override: the round''s trip is flagged test_mode AND the caller is the single
    -- designated dev account. No other account benefits from the flag.
    EXISTS (
      SELECT 1
      FROM rounds r
      JOIN trips t      ON t.id = r.trip_id
      JOIN auth.users u ON u.id = auth.uid()
      WHERE r.id = p_round_id
        AND t.test_mode = true
        AND lower(u.email) = 'o.chamberlin@gmail.com'
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_write_score(uuid, uuid) TO authenticated;
