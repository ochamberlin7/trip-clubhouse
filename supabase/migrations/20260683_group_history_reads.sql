-- 20260683_group_history_reads.sql
-- Group history is shared (Owen, 2026-11-05): a group's members can read the
-- results of every trip in the group, so the Group stats page adds up all of it.
--
-- Before: trips, rounds, players and teams were already readable by the whole
-- group, but scores, pairings, tee choices (player_rounds) and drinks were only
-- readable by people ON that trip. Someone who joins next year's trip would see
-- the group's earlier trips with no scores.
--
-- After: each of those four tables is readable by the trip's own players (as
-- before) OR any member of the trip's group. Writing is unchanged. Trip chats
-- (messages) are NOT touched: they stay readable by that trip's players only.
--
-- Idempotent: safe to run twice. Run in the Supabase SQL editor.

BEGIN;

DROP POLICY IF EXISTS "scores_select" ON public.scores;
CREATE POLICY "scores_select" ON public.scores FOR SELECT TO authenticated
USING (
  round_id IN (SELECT r.id FROM rounds r JOIN trips t ON t.id = r.trip_id WHERE is_group_member(t.group_id))
  OR round_id IN (SELECT r.id FROM rounds r JOIN trip_players tp ON tp.trip_id = r.trip_id
                  WHERE tp.user_id = auth.uid() OR tp.claimed_user_id = auth.uid())
);

DROP POLICY IF EXISTS "pairings_select" ON public.pairings;
CREATE POLICY "pairings_select" ON public.pairings FOR SELECT TO authenticated
USING (
  round_id IN (SELECT r.id FROM rounds r JOIN trips t ON t.id = r.trip_id WHERE is_group_member(t.group_id))
  OR round_id IN (SELECT r.id FROM rounds r JOIN trip_players tp ON tp.trip_id = r.trip_id
                  WHERE tp.user_id = auth.uid() OR tp.claimed_user_id = auth.uid())
);

DROP POLICY IF EXISTS "player_rounds_select" ON public.player_rounds;
CREATE POLICY "player_rounds_select" ON public.player_rounds FOR SELECT TO authenticated
USING (
  round_id IN (SELECT r.id FROM rounds r JOIN trips t ON t.id = r.trip_id WHERE is_group_member(t.group_id))
  OR round_id IN (SELECT r.id FROM rounds r JOIN trip_players tp ON tp.trip_id = r.trip_id
                  WHERE tp.user_id = auth.uid() OR tp.claimed_user_id = auth.uid())
);

DROP POLICY IF EXISTS "drinks_select" ON public.drinks;
CREATE POLICY "drinks_select" ON public.drinks FOR SELECT TO authenticated
USING (
  round_id IN (SELECT r.id FROM rounds r JOIN trips t ON t.id = r.trip_id WHERE is_group_member(t.group_id))
  OR round_id IN (SELECT r.id FROM rounds r JOIN trip_players tp ON tp.trip_id = r.trip_id
                  WHERE tp.user_id = auth.uid() OR tp.claimed_user_id = auth.uid())
);

COMMIT;
