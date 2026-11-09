-- =============================================================
-- Trip Clubhouse — change the number of teams after a trip is created.
-- Run in Supabase SQL Editor (project mjssollqfngbeetwnxml). Idempotent.
--
-- Same rule as src/lib/teamCount.js (which builds the on-screen preview):
--   • 2–4 teams; only on a trip that already has teams.
--   • More teams: empty teams added after the last (team_index / color_index =
--     next numbers, name NULL → shows as "Team N").
--   • Fewer teams: the highest-numbered teams are removed. Their players become
--     Unassigned (and lose captain); pairing sides pointing at them are cleared;
--     their Prince of Wales rows go with them (ON DELETE CASCADE).
--   • Locked once any score exists on the trip.
-- Caller must be the trip's commissioner (group admin). One transaction.
-- =============================================================

CREATE OR REPLACE FUNCTION public.change_team_count(p_trip_id uuid, p_target int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group   uuid;
  v_current int;
  v_last    int;
  v_remove  uuid[];
BEGIN
  SELECT group_id INTO v_group FROM trips WHERE id = p_trip_id AND deleted_at IS NULL;
  IF v_group IS NULL THEN
    RAISE EXCEPTION 'Trip not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT is_group_admin(v_group) THEN
    RAISE EXCEPTION 'Only the commissioner can change the number of teams' USING ERRCODE = '42501';
  END IF;
  IF p_target IS NULL OR p_target < 2 OR p_target > 4 THEN
    RAISE EXCEPTION 'Pick 2 to 4 teams' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM scores s JOIN rounds r ON r.id = s.round_id WHERE r.trip_id = p_trip_id
  ) THEN
    RAISE EXCEPTION 'Scores have been entered, so the teams are locked' USING ERRCODE = '55000';
  END IF;

  SELECT count(*), COALESCE(max(team_index), 0) INTO v_current, v_last
    FROM teams WHERE trip_id = p_trip_id;
  IF v_current = 0 THEN
    RAISE EXCEPTION 'This trip has no teams' USING ERRCODE = '22023';
  END IF;

  IF p_target > v_current THEN
    INSERT INTO teams (trip_id, name, team_index, color_index)
    SELECT p_trip_id, NULL, v_last + g, v_last + g
      FROM generate_series(1, p_target - v_current) AS g;

  ELSIF p_target < v_current THEN
    SELECT array_agg(id) INTO v_remove FROM (
      SELECT id FROM teams WHERE trip_id = p_trip_id
       ORDER BY team_index NULLS LAST, id
      OFFSET p_target
    ) q;

    UPDATE trip_players SET team_id = NULL, is_captain = false
     WHERE trip_id = p_trip_id AND team_id = ANY(v_remove);

    UPDATE pairings SET team1_id = NULL
     WHERE team1_id = ANY(v_remove)
       AND round_id IN (SELECT id FROM rounds WHERE trip_id = p_trip_id);
    UPDATE pairings SET team2_id = NULL
     WHERE team2_id = ANY(v_remove)
       AND round_id IN (SELECT id FROM rounds WHERE trip_id = p_trip_id);

    DELETE FROM teams WHERE id = ANY(v_remove);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.change_team_count(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_team_count(uuid, int) TO authenticated;
