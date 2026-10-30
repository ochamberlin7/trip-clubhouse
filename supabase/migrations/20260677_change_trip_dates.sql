-- =============================================================
-- Trip Clubhouse — change a trip's dates after it's created.
-- Run in Supabase SQL Editor (project mjssollqfngbeetwnxml). Idempotent.
--
-- The app works out where every round / meal / lodging stay goes
-- (src/lib/tripDates.js → planTripDateChange) and sends the result here, so the
-- whole change saves in ONE transaction: either every date moves or none do.
--
-- Rules enforced here (not just in the app):
--   • caller must be the trip's commissioner (group admin);
--   • start <= end;
--   • no score entered on any of the trip's rounds yet (dates lock once
--     scoring starts, same as Tournament Format);
--   • only rows belonging to this trip are touched.
-- =============================================================

CREATE OR REPLACE FUNCTION public.change_trip_dates(
  p_trip_id  uuid,
  p_start    date,
  p_end      date,
  p_schedule jsonb DEFAULT '[]'::jsonb,
  p_rounds   jsonb DEFAULT '[]'::jsonb,  -- [{ "id": uuid, "date": "YYYY-MM-DD" }]
  p_meals    jsonb DEFAULT '[]'::jsonb,  -- [{ "id": uuid, "day":  "YYYY-MM-DD" }]
  p_stays    jsonb DEFAULT '[]'::jsonb   -- [{ "id": uuid, "check_in": ..., "check_out": ... }]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group uuid;
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

REVOKE ALL ON FUNCTION public.change_trip_dates(uuid, date, date, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_trip_dates(uuid, date, date, jsonb, jsonb, jsonb, jsonb) TO authenticated;
