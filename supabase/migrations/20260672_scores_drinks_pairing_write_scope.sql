-- =============================================================
-- Trip Clubhouse — scope score/drink WRITES to the player's own pairing.
--
-- Before: scores/drinks INSERT/UPDATE/DELETE were allowed for ANY member of the
-- trip (round_id IN the user's trips). So a commissioner, or a player in a
-- different pairing, could enter/edit/delete another pairing's scores.
--
-- After: a user may write a score/drink row only when their OWN trip_player
-- shares a pairing (for that round) with the row's trip_player_id — i.e. they're
-- in the same foursome. This still lets one person enter for the whole group
-- (including guest players) and for a teammate whose phone died, but blocks
-- anyone outside that pairing, commissioners included. SELECT is unchanged —
-- everyone on the trip still sees every pairing's scores read-only.
--
-- The check runs through a SECURITY DEFINER helper so it isn't re-filtered by the
-- joined tables' own RLS (pairings_select is user_id-only and would otherwise
-- break for a user who claimed a guest slot). Mirrors the existing
-- is_group_member / shares_group_with helper pattern.
-- Run in Supabase SQL Editor.
-- =============================================================

-- ── Helper: may the caller write a score/drink for (round, trip_player)? ──
-- True when the caller's trip_player (matched by user_id OR claimed_user_id) is
-- in the SAME pairing, for that round, as p_trip_player_id. Guests are coverable
-- because the caller — a real account in the pairing — is the one writing.
CREATE OR REPLACE FUNCTION public.can_write_score(p_round_id uuid, p_trip_player_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pairings pg
    JOIN pairing_players pp_target ON pp_target.pairing_id = pg.id
    JOIN pairing_players pp_me     ON pp_me.pairing_id = pg.id
    JOIN trip_players me           ON me.id = pp_me.trip_player_id
    WHERE pg.round_id = p_round_id
      AND pp_target.trip_player_id = p_trip_player_id
      AND (me.user_id = auth.uid() OR me.claimed_user_id = auth.uid())
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_write_score(uuid, uuid) TO authenticated;

-- ── scores: write only within your own pairing ──
DROP POLICY IF EXISTS "scores_insert" ON scores;
CREATE POLICY "scores_insert" ON scores FOR INSERT TO authenticated
  WITH CHECK (can_write_score(round_id, trip_player_id));

DROP POLICY IF EXISTS "scores_update" ON scores;
CREATE POLICY "scores_update" ON scores FOR UPDATE TO authenticated
  USING (can_write_score(round_id, trip_player_id))
  WITH CHECK (can_write_score(round_id, trip_player_id));

-- Supersedes "Trip members can delete scores" (20260624) — now pairing-scoped.
DROP POLICY IF EXISTS "Trip members can delete scores" ON scores;
DROP POLICY IF EXISTS "scores_delete" ON scores;
CREATE POLICY "scores_delete" ON scores FOR DELETE TO authenticated
  USING (can_write_score(round_id, trip_player_id));

-- ── drinks: entered on the same scorecard → same pairing scope ──
DROP POLICY IF EXISTS "drinks_insert" ON drinks;
CREATE POLICY "drinks_insert" ON drinks FOR INSERT TO authenticated
  WITH CHECK (can_write_score(round_id, trip_player_id));

DROP POLICY IF EXISTS "drinks_update" ON drinks;
CREATE POLICY "drinks_update" ON drinks FOR UPDATE TO authenticated
  USING (can_write_score(round_id, trip_player_id))
  WITH CHECK (can_write_score(round_id, trip_player_id));

DROP POLICY IF EXISTS "Trip members can delete drinks" ON drinks;
DROP POLICY IF EXISTS "drinks_delete" ON drinks;
CREATE POLICY "drinks_delete" ON drinks FOR DELETE TO authenticated
  USING (can_write_score(round_id, trip_player_id));
