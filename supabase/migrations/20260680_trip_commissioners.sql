-- 20260680_trip_commissioners.sql
-- Commissioner per TRIP, not per group (Owen, 2026-11-05).
--
-- Why: a group is the tradition and can hold many trips over the years. Until now
-- "commissioner" meant the group's admin (group_members.role = 'admin'), which only
-- worked while every group had one trip. With several trips in a group, the admin
-- would control every trip in it, and only the admin could add the next one.
--
-- What this does:
--   1. trip_commissioners: who runs each trip (can be more than one: co-commissioners).
--      Filled from today's group admins, so EVERY EXISTING TRIP KEEPS THE SAME
--      COMMISSIONERS (each group has one trip today).
--   2. Whoever creates a trip becomes its commissioner (trigger), so the current
--      wizard keeps working unchanged.
--   3. Every rule that checked is_group_admin(...) now checks is_trip_commissioner(trip)
--      — trips, rounds, players, teams, pairings, course holes, flights, Prince of
--      Wales, Change Trip Dates, Change Number of Teams, and the invite page's
--      "contact the commissioner" lookup.
--   4. Any member of a group can create a new trip in it (was admin-only).
--   5. Group-level actions (rename the group, remove someone from the group): any
--      commissioner of a trip in that group.
--   6. Security fix: joining a group used to accept ANY group id with ANY role, so
--      anyone who knew a group id could make themselves its admin. Now you can only
--      add yourself to a group you created, or one you're a player on a trip in,
--      and only the group's creator can be 'admin'.
--
-- Safe to run BEFORE the app update: the app on main still reads group admins,
-- which match trip_commissioners after the backfill.
-- Idempotent: safe to run twice. Run in the Supabase SQL editor.

BEGIN;

-- ── 1. Table ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trip_commissioners (
  trip_id    uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, user_id)
);
CREATE INDEX IF NOT EXISTS trip_commissioners_user_idx ON public.trip_commissioners (user_id);
ALTER TABLE public.trip_commissioners ENABLE ROW LEVEL SECURITY;
-- Explicit, so it doesn't depend on the project's default privileges. RLS below decides rows.
GRANT SELECT, INSERT, DELETE ON public.trip_commissioners TO authenticated;
REVOKE ALL ON public.trip_commissioners FROM anon;

-- Backfill: every trip's commissioners = its group's admins today.
INSERT INTO public.trip_commissioners (trip_id, user_id)
SELECT t.id, gm.user_id
FROM public.trips t
JOIN public.group_members gm ON gm.group_id = t.group_id AND gm.role = 'admin'
ON CONFLICT DO NOTHING;

-- ── 2. Helpers ──────────────────────────────────────────────────────────────
-- Is the signed-in user a commissioner of this trip?
CREATE OR REPLACE FUNCTION public.is_trip_commissioner(p_trip_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM trip_commissioners WHERE trip_id = p_trip_id AND user_id = auth.uid()
  );
$$;

-- Is the signed-in user a commissioner of ANY trip in this group? (group rename etc.)
CREATE OR REPLACE FUNCTION public.is_group_commissioner(gid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM trip_commissioners tc JOIN trips t ON t.id = tc.trip_id
    WHERE t.group_id = gid AND tc.user_id = auth.uid()
  );
$$;

-- May the signed-in user add themselves to this group? Only the group's creator,
-- or someone who is a player (claimed slot) on a trip in the group.
CREATE OR REPLACE FUNCTION public.can_join_group(gid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM groups g WHERE g.id = gid AND g.created_by = auth.uid())
      OR EXISTS (
        SELECT 1 FROM trip_players tp JOIN trips t ON t.id = tp.trip_id
        WHERE t.group_id = gid AND (tp.user_id = auth.uid() OR tp.claimed_user_id = auth.uid())
      );
$$;

GRANT EXECUTE ON FUNCTION public.is_trip_commissioner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_commissioner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_join_group(uuid) TO authenticated;

-- ── 3. Creator becomes commissioner; a trip can't lose its last commissioner ─
CREATE OR REPLACE FUNCTION public.add_trip_creator_as_commissioner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO trip_commissioners (trip_id, user_id) VALUES (NEW.id, auth.uid())
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trips_add_creator_commissioner ON public.trips;
CREATE TRIGGER trips_add_creator_commissioner
  AFTER INSERT ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.add_trip_creator_as_commissioner();

-- Removing the last commissioner of a live trip is refused (deleting the trip
-- itself still cascades: the trip row is already gone by then).
CREATE OR REPLACE FUNCTION public.keep_one_trip_commissioner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM trips WHERE id = OLD.trip_id)
     AND NOT EXISTS (SELECT 1 FROM trip_commissioners WHERE trip_id = OLD.trip_id AND user_id <> OLD.user_id) THEN
    RAISE EXCEPTION 'A trip needs at least one commissioner' USING ERRCODE = '55000';
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trip_commissioners_keep_one ON public.trip_commissioners;
CREATE TRIGGER trip_commissioners_keep_one
  BEFORE DELETE ON public.trip_commissioners
  FOR EACH ROW EXECUTE FUNCTION public.keep_one_trip_commissioner();

-- ── 4. trip_commissioners rules ─────────────────────────────────────────────
-- Read: anyone in the trip's group (the Players page shows who the commissioners are).
DROP POLICY IF EXISTS "trip_commissioners_select" ON public.trip_commissioners;
CREATE POLICY "trip_commissioners_select" ON public.trip_commissioners
  FOR SELECT TO authenticated
  USING (trip_id IN (SELECT id FROM trips WHERE is_group_member(group_id)));
-- Add: a commissioner can add a player who is on this trip (co-commissioner).
DROP POLICY IF EXISTS "trip_commissioners_insert" ON public.trip_commissioners;
CREATE POLICY "trip_commissioners_insert" ON public.trip_commissioners
  FOR INSERT TO authenticated
  WITH CHECK (
    is_trip_commissioner(trip_id)
    AND EXISTS (SELECT 1 FROM trip_players tp WHERE tp.trip_id = trip_commissioners.trip_id
                AND (tp.user_id = trip_commissioners.user_id OR tp.claimed_user_id = trip_commissioners.user_id))
  );
-- Remove: a commissioner (themselves or another); the trigger keeps at least one.
DROP POLICY IF EXISTS "trip_commissioners_delete" ON public.trip_commissioners;
CREATE POLICY "trip_commissioners_delete" ON public.trip_commissioners
  FOR DELETE TO authenticated
  USING (is_trip_commissioner(trip_id));

-- ── 5. Rules that checked the group admin now check the trip's commissioner ─
-- trips
DROP POLICY IF EXISTS "trips_insert" ON public.trips;
CREATE POLICY "trips_insert" ON public.trips
  FOR INSERT TO authenticated
  WITH CHECK (is_group_member(group_id));            -- any group member can start a trip
DROP POLICY IF EXISTS "trips_update" ON public.trips;
CREATE POLICY "trips_update" ON public.trips
  FOR UPDATE TO authenticated
  USING (is_trip_commissioner(id));

-- rounds
DROP POLICY IF EXISTS "rounds_insert" ON public.rounds;
CREATE POLICY "rounds_insert" ON public.rounds
  FOR INSERT TO authenticated
  WITH CHECK (is_trip_commissioner(trip_id));
DROP POLICY IF EXISTS "rounds_update" ON public.rounds;
CREATE POLICY "rounds_update" ON public.rounds
  FOR UPDATE TO authenticated
  USING (is_trip_commissioner(trip_id));

-- course_holes
DROP POLICY IF EXISTS "course_holes_manage" ON public.course_holes;
CREATE POLICY "course_holes_manage" ON public.course_holes
  FOR ALL TO authenticated
  USING (round_id IN (SELECT r.id FROM rounds r WHERE is_trip_commissioner(r.trip_id)))
  WITH CHECK (round_id IN (SELECT r.id FROM rounds r WHERE is_trip_commissioner(r.trip_id)));

-- teams
DROP POLICY IF EXISTS "teams_insert" ON public.teams;
CREATE POLICY "teams_insert" ON public.teams
  FOR INSERT TO authenticated
  WITH CHECK (is_trip_commissioner(trip_id));
DROP POLICY IF EXISTS "teams_update" ON public.teams;
CREATE POLICY "teams_update" ON public.teams
  FOR UPDATE TO authenticated
  USING (is_trip_commissioner(trip_id));
DROP POLICY IF EXISTS "teams_delete" ON public.teams;
CREATE POLICY "teams_delete" ON public.teams
  FOR DELETE TO authenticated
  USING (is_trip_commissioner(trip_id));

-- trip_players
DROP POLICY IF EXISTS "trip_players_insert" ON public.trip_players;
CREATE POLICY "trip_players_insert" ON public.trip_players
  FOR INSERT TO authenticated
  WITH CHECK (is_trip_commissioner(trip_id));
DROP POLICY IF EXISTS "trip_players_delete" ON public.trip_players;
CREATE POLICY "trip_players_delete" ON public.trip_players
  FOR DELETE TO authenticated
  USING (is_trip_commissioner(trip_id));
-- Same as 20260641 (own row / unclaimed email or phone match), commissioner part swapped.
DROP POLICY IF EXISTS "trip_players_update" ON public.trip_players;
CREATE POLICY "trip_players_update" ON public.trip_players
  FOR UPDATE TO authenticated
  USING (
    is_trip_commissioner(trip_id)
    OR user_id = auth.uid()
    OR claimed_user_id = auth.uid()
    OR (is_claimed = false AND lower(trim(email)) = lower(trim(auth.jwt() ->> 'email')))
    OR (is_claimed = false AND nullif(regexp_replace(phone, '[^0-9]', '', 'g'), '')
        = nullif(regexp_replace(
            coalesce(nullif(auth.jwt() ->> 'phone', ''), auth.jwt() -> 'user_metadata' ->> 'phone'),
            '[^0-9]', '', 'g'), ''))
  )
  WITH CHECK (true);

-- pairings / pairing_players
DROP POLICY IF EXISTS "pairings_manage" ON public.pairings;
CREATE POLICY "pairings_manage" ON public.pairings FOR ALL TO authenticated
  USING (round_id IN (SELECT r.id FROM rounds r WHERE is_trip_commissioner(r.trip_id)))
  WITH CHECK (round_id IN (SELECT r.id FROM rounds r WHERE is_trip_commissioner(r.trip_id)));
DROP POLICY IF EXISTS "pairing_players_manage" ON public.pairing_players;
CREATE POLICY "pairing_players_manage" ON public.pairing_players FOR ALL TO authenticated
  USING (pairing_id IN (SELECT p.id FROM pairings p JOIN rounds r ON r.id = p.round_id WHERE is_trip_commissioner(r.trip_id)))
  WITH CHECK (pairing_id IN (SELECT p.id FROM pairings p JOIN rounds r ON r.id = p.round_id WHERE is_trip_commissioner(r.trip_id)));

-- flights (your own flight, or the commissioner)
DROP POLICY IF EXISTS "flights_insert" ON public.flights;
CREATE POLICY "flights_insert" ON public.flights FOR INSERT TO authenticated
WITH CHECK (
  trip_player_id IN (SELECT id FROM trip_players WHERE user_id = auth.uid() OR claimed_user_id = auth.uid())
  OR is_trip_commissioner(trip_id)
);
DROP POLICY IF EXISTS "flights_update" ON public.flights;
CREATE POLICY "flights_update" ON public.flights FOR UPDATE TO authenticated
USING (
  trip_player_id IN (SELECT id FROM trip_players WHERE user_id = auth.uid() OR claimed_user_id = auth.uid())
  OR is_trip_commissioner(trip_id)
);

-- Prince of Wales
DROP POLICY IF EXISTS "pow_delete" ON public.prince_of_wales_composites;
CREATE POLICY "pow_delete" ON public.prince_of_wales_composites FOR DELETE TO authenticated
USING (is_trip_commissioner(trip_id));

-- ── 6. Group-level rules ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "groups_update" ON public.groups;
CREATE POLICY "groups_update" ON public.groups
  FOR UPDATE TO authenticated
  USING (is_group_commissioner(id) OR is_group_admin(id));
DROP POLICY IF EXISTS "group_members_delete" ON public.group_members;
CREATE POLICY "group_members_delete" ON public.group_members
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR is_group_commissioner(group_id));
DROP POLICY IF EXISTS "invitations_insert" ON public.invitations;
CREATE POLICY "invitations_insert" ON public.invitations
  FOR INSERT TO authenticated
  WITH CHECK (is_group_commissioner(group_id));
-- Security fix (see top): only a group you created (any role) or one you play in (as 'player').
DROP POLICY IF EXISTS "group_members_insert" ON public.group_members;
CREATE POLICY "group_members_insert" ON public.group_members
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      EXISTS (SELECT 1 FROM groups g WHERE g.id = group_id AND g.created_by = auth.uid())
      OR (role = 'player' AND can_join_group(group_id))
    )
  );

-- ── 7. Commissioner Tools functions ─────────────────────────────────────────
-- Unchanged from 20260677 / 20260678 except the commissioner check.
CREATE OR REPLACE FUNCTION public.change_trip_dates(
  p_trip_id  uuid,
  p_start    date,
  p_end      date,
  p_schedule jsonb DEFAULT '[]'::jsonb,
  p_rounds   jsonb DEFAULT '[]'::jsonb,  -- [{ "id": uuid, "date": "YYYY-MM-DD" }]
  p_meals    jsonb DEFAULT '[]'::jsonb,  -- [{ "id": uuid, "day":  "YYYY-MM-DD" }]
  p_stays    jsonb DEFAULT '[]'::jsonb,  -- [{ "id": uuid, "check_in": ..., "check_out": ... }]
  p_delete_rounds uuid[] DEFAULT '{}',   -- rounds on cut days
  p_delete_meals  uuid[] DEFAULT '{}',   -- meals on cut days
  p_delete_stays  uuid[] DEFAULT '{}'    -- lodging with no nights left
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group uuid;
  v_cut   uuid[];
BEGIN
  SELECT group_id INTO v_group FROM trips WHERE id = p_trip_id AND deleted_at IS NULL;
  IF v_group IS NULL THEN
    RAISE EXCEPTION 'Trip not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT is_trip_commissioner(p_trip_id) THEN
    RAISE EXCEPTION 'Only the commissioner can change trip dates' USING ERRCODE = '42501';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start THEN
    RAISE EXCEPTION 'End date cannot be before start date' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM scores s JOIN rounds r ON r.id = s.round_id WHERE r.trip_id = p_trip_id
  ) THEN
    RAISE EXCEPTION 'Scores have been entered, so the dates are locked' USING ERRCODE = '55000';
  END IF;

  -- Cut rounds: only this trip's, and only ones with no scores (checked above
  -- for the whole trip). Dependents first, since not every FK cascades.
  SELECT COALESCE(array_agg(id), '{}') INTO v_cut
    FROM rounds WHERE trip_id = p_trip_id AND id = ANY(COALESCE(p_delete_rounds, '{}'));
  IF array_length(v_cut, 1) > 0 THEN
    DELETE FROM drinks WHERE round_id = ANY(v_cut);
    DELETE FROM pairing_players WHERE pairing_id IN (SELECT id FROM pairings WHERE round_id = ANY(v_cut));
    DELETE FROM pairings WHERE round_id = ANY(v_cut);
    DELETE FROM player_rounds WHERE round_id = ANY(v_cut);
    DELETE FROM course_holes WHERE round_id = ANY(v_cut);
    DELETE FROM rounds WHERE id = ANY(v_cut);
  END IF;

  DELETE FROM meals WHERE trip_id = p_trip_id AND id = ANY(COALESCE(p_delete_meals, '{}'));
  DELETE FROM stays WHERE trip_id = p_trip_id AND id = ANY(COALESCE(p_delete_stays, '{}'));

  UPDATE trips
     SET start_date = p_start,
         end_date   = p_end,
         schedule   = COALESCE(p_schedule, '[]'::jsonb)
   WHERE id = p_trip_id;

  UPDATE rounds r
     SET date = (x->>'date')::date
    FROM jsonb_array_elements(COALESCE(p_rounds, '[]'::jsonb)) x
   WHERE r.id = (x->>'id')::uuid AND r.trip_id = p_trip_id;

  UPDATE meals m
     SET day = (x->>'day')::date
    FROM jsonb_array_elements(COALESCE(p_meals, '[]'::jsonb)) x
   WHERE m.id = (x->>'id')::uuid AND m.trip_id = p_trip_id;

  UPDATE stays st
     SET check_in  = NULLIF(x->>'check_in', '')::date,
         check_out = NULLIF(x->>'check_out', '')::date
    FROM jsonb_array_elements(COALESCE(p_stays, '[]'::jsonb)) x
   WHERE st.id = (x->>'id')::uuid AND st.trip_id = p_trip_id;
END;
$$;

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
  IF NOT is_trip_commissioner(p_trip_id) THEN
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

-- Invite page's "couldn't find you, contact the commissioner" lookup.
CREATE OR REPLACE FUNCTION public.invite_commissioner(p_invite_token uuid)
RETURNS TABLE (display_name text, email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pr.display_name, au.email
  FROM public.trips t
  JOIN public.trip_commissioners tc ON tc.trip_id = t.id
  LEFT JOIN public.profiles pr ON pr.id = tc.user_id
  LEFT JOIN auth.users au ON au.id = tc.user_id
  WHERE t.invite_token = p_invite_token
  ORDER BY tc.created_at
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.invite_commissioner(uuid) TO authenticated;

-- Realtime: the Players page refreshes when commissioners change.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'trip_commissioners') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_commissioners;
  END IF;
END $$;

COMMIT;

-- Check after running (should list every trip with at least one commissioner):
--   SELECT t.name, count(tc.user_id) AS commissioners
--   FROM trips t LEFT JOIN trip_commissioners tc ON tc.trip_id = t.id
--   GROUP BY t.name ORDER BY commissioners, t.name;
