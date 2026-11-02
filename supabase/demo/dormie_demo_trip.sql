-- =============================================================
-- DEMO ONLY (not a migration). Turns one of your trips into a Dormie Club
-- demo: links it to the Dormie Network resort and adds a sample on-property
-- itinerary (cottage stay + meals). Run AFTER 20260680_resorts.sql.
--
-- 1. Create the trip in the app first (e.g. "Dormie Club Weekend", 3 days,
--    rounds at Dormie Club, West End NC; time zone America/New_York).
-- 2. Paste its id below (Supabase → trips table, or the URL), then run this.
-- Safe to re-run: meals/stays are only added if the trip has none yet.
-- To undo the branding: UPDATE trips SET resort_id = NULL WHERE id = '<id>';
-- =============================================================

DO $$
DECLARE
  v_trip_id uuid := 'PASTE-TRIP-ID-HERE';
  v_start   date;
  v_end     date;
BEGIN
  UPDATE public.trips
     SET resort_id = (SELECT id FROM public.resorts WHERE slug = 'dormie-network')
   WHERE id = v_trip_id
  RETURNING start_date, end_date INTO v_start, v_end;

  IF v_start IS NULL THEN
    RAISE EXCEPTION 'Trip % not found or has no start date', v_trip_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.stays WHERE trip_id = v_trip_id) THEN
    INSERT INTO public.stays (trip_id, hotel_name, check_in, check_out, confirmation, notes)
    VALUES (v_trip_id, 'Dormie Club — Executive Cottages', v_start, coalesce(v_end, v_start + 2),
            'DC-' || to_char(v_start, 'YYMMDD'),
            'Cottages 3 & 4 · 4 king suites each · Check-in at the clubhouse');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.meals WHERE trip_id = v_trip_id) THEN
    INSERT INTO public.meals (trip_id, day, meal_type, custom_label, location, meal_time, notes) VALUES
      (v_trip_id, v_start,     'happy_hour', NULL,               'Clubhouse Porch',      '5:30 PM', 'Welcome cocktails'),
      (v_trip_id, v_start,     'dinner',     NULL,               'Clubhouse Dining Room','7:00 PM', 'Carolina seafood boil'),
      (v_trip_id, v_start + 1, 'breakfast',  NULL,               'Clubhouse',            '7:00 AM', NULL),
      (v_trip_id, v_start + 1, 'lunch',      NULL,               'The Turn',             '12:30 PM','Between rounds'),
      (v_trip_id, v_start + 1, 'dinner',     NULL,               'Private Dining Room',  '7:30 PM', 'Steak night · awards for Day 2'),
      (v_trip_id, v_start + 2, 'breakfast',  NULL,               'Clubhouse',            '7:00 AM', NULL),
      (v_trip_id, v_start + 2, 'other',      'Farewell Lunch',   'Clubhouse Patio',      '1:00 PM', 'Trophy presentation');
  END IF;
END $$;
