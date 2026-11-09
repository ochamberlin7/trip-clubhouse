-- 20260682_move_trip_to_group.sql
-- Commissioner Tools → Group: move a trip into another group (Owen, 2026-11-05).
--
-- A group is the tradition and can hold many trips (20260680, 20260681). Trips
-- made before the wizard's group dropdown each got their own group, so this is
-- how they get linked (e.g. last year's trip into this year's group), and how a
-- stray trip leaves a group.
--
-- move_trip_to_group(trip, group)        → into a group you're already in
-- move_trip_to_group(trip, NULL, 'Name') → into a brand-new group of its own
--   • only the trip's commissioner can move it;
--   • everyone on the trip who has an account becomes a member of the new group
--     (so the trip stays in their list); their old group membership is left alone;
--   • players, scores, chats, rounds, teams and commissioners don't change.
--
-- Guard: a trip's group can only change through this function now. Before, a
-- commissioner could set trips.group_id to ANY group id directly, which would
-- push the trip into a stranger's group. (Changes run from the SQL editor, with
-- no signed-in user, are still allowed for one-off fixes.)
--
-- Idempotent: safe to run twice. Run in the Supabase SQL editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.move_trip_to_group(
  p_trip_id uuid,
  p_group_id uuid DEFAULT NULL,
  p_new_group_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_old    uuid;
  v_target uuid;
  v_name   text := left(trim(coalesce(p_new_group_name, '')), 80);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501';
  END IF;
  SELECT group_id INTO v_old FROM trips WHERE id = p_trip_id AND deleted_at IS NULL;
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'Trip not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT is_trip_commissioner(p_trip_id) THEN
    RAISE EXCEPTION 'Only the trip''s commissioner can move it' USING ERRCODE = '42501';
  END IF;

  IF p_group_id IS NULL THEN
    IF v_name = '' THEN
      RAISE EXCEPTION 'Name the new group' USING ERRCODE = '22023';
    END IF;
    INSERT INTO groups (name, created_by) VALUES (v_name, v_uid) RETURNING id INTO v_target;
    INSERT INTO group_members (group_id, user_id, role) VALUES (v_target, v_uid, 'admin');
  ELSE
    IF NOT is_group_member(p_group_id) THEN
      RAISE EXCEPTION 'You can only move a trip into a group you''re in' USING ERRCODE = '42501';
    END IF;
    v_target := p_group_id;
  END IF;

  IF v_target = v_old THEN
    RETURN v_target; -- already there
  END IF;

  -- Everyone on the trip with an account joins the group (as a player).
  INSERT INTO group_members (group_id, user_id, role)
  SELECT v_target, x.u, 'player'
  FROM (
    SELECT user_id AS u FROM trip_players WHERE trip_id = p_trip_id AND user_id IS NOT NULL
    UNION
    SELECT claimed_user_id FROM trip_players WHERE trip_id = p_trip_id AND claimed_user_id IS NOT NULL
  ) x
  WHERE NOT EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = v_target AND gm.user_id = x.u);

  -- Tell the guard below this change is allowed, for this transaction only.
  PERFORM set_config('app.moving_trip', p_trip_id::text, true);
  UPDATE trips SET group_id = v_target WHERE id = p_trip_id;
  PERFORM set_config('app.moving_trip', '', true);

  RETURN v_target;
END;
$$;
REVOKE ALL ON FUNCTION public.move_trip_to_group(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_trip_to_group(uuid, uuid, text) TO authenticated;

-- Guard: a signed-in user can't change trips.group_id except through the function above.
CREATE OR REPLACE FUNCTION public.guard_trip_group_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.group_id IS DISTINCT FROM OLD.group_id
     AND auth.uid() IS NOT NULL
     AND coalesce(current_setting('app.moving_trip', true), '') <> OLD.id::text THEN
    RAISE EXCEPTION 'Move a trip with Commissioner Tools → Group' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trips_guard_group_change ON public.trips;
CREATE TRIGGER trips_guard_group_change
  BEFORE UPDATE OF group_id ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.guard_trip_group_change();

COMMIT;
