-- =============================================================
-- Trip Clubhouse — change a trip's dates after it's created.
-- Run in Supabase SQL Editor (project mjssollqfngbeetwnxml). Idempotent.
--
-- The app works out where every round / meal / lodging stay goes
-- (src/lib/tripDates.js → planTripDateChange) and sends the result here, so the
-- whole change saves in ONE transaction: either every date moves or none do.
--
-- Rule: Day 1 always stays Day 1. Lengthening adds days at the end. Shortening
-- cuts the last days, and the rounds / meals on them are DELETED here (with a
-- round's pairings, player tees, course holes and drinks). Lodging is trimmed to
-- the new last day, or deleted if it has no nights left. Flights are never touched.
--
-- Rules enforced here (not just in the app):
--   • caller must be the trip's commissioner (group admin);
--   • start <= end;
--   • no score entered on any of the trip's rounds yet (dates lock once
--     scoring starts, same as Tournament Format);
--   • only rows belonging to this trip are touched.
-- =============================================================

-- Earlier draft of this function (no delete lists) — drop it if it was applied.
DROP FUNCTION IF EXISTS public.change_trip_dates(uuid, date, date, jsonb, jsonb, jsonb, jsonb);

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
  IF NOT is_group_admin(v_group) THEN
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

REVOKE ALL ON FUNCTION public.change_trip_dates(uuid, date, date, jsonb, jsonb, jsonb, jsonb, uuid[], uuid[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_trip_dates(uuid, date, date, jsonb, jsonb, jsonb, jsonb, uuid[], uuid[], uuid[]) TO authenticated;
