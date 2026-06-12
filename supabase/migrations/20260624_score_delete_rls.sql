-- =============================================================
-- Trip Clubhouse — fix silent score/drink deletes.
--
-- scores/drinks are keyed by trip_player_id (no user_id column), so any
-- "user_id = auth.uid()" delete policy matches 0 rows and the DELETE returns
-- 204 having deleted nothing. Replace with a trip-membership delete policy.
-- Run in Supabase SQL Editor.
-- =============================================================

GRANT DELETE ON public.scores TO authenticated;
GRANT DELETE ON public.drinks TO authenticated;

-- ── scores ──
DROP POLICY IF EXISTS "Players can delete own scores" ON scores;
DROP POLICY IF EXISTS "scores_delete" ON scores;
CREATE POLICY "Trip members can delete scores"
  ON scores FOR DELETE TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND round_id IN (
      SELECT r.id FROM rounds r
      JOIN trip_players tp ON tp.trip_id = r.trip_id
      WHERE tp.user_id = auth.uid() OR tp.claimed_user_id = auth.uid()
    )
  );

-- ── drinks ──
DROP POLICY IF EXISTS "Players can delete own drinks" ON drinks;
DROP POLICY IF EXISTS "drinks_delete" ON drinks;
CREATE POLICY "Trip members can delete drinks"
  ON drinks FOR DELETE TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND round_id IN (
      SELECT r.id FROM rounds r
      JOIN trip_players tp ON tp.trip_id = r.trip_id
      WHERE tp.user_id = auth.uid() OR tp.claimed_user_id = auth.uid()
    )
  );
