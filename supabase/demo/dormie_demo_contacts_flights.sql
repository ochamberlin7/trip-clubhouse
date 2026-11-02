-- =============================================================
-- DEMO ONLY. Fills in fake contact info + flights for the two Dormie demo
-- trips (Briggs Ranch Weekend, Ballyhack Spring Trip).
--   • Emails use example.com (reserved for examples — nobody receives them).
--   • Phones use the fictional 555-01xx range.
--   • Owen's own email/phone are left alone; he only gets flights.
-- Run after dormie_demo_trips.sql. Safe to re-run (overwrites the same rows).
-- =============================================================

BEGIN;

-- Contacts (same crew on both trips).
WITH c(first_name, last_name, email, phone) AS (VALUES
  ('Jack',  'Morrison',  'jack.morrison@example.com',  '2145550101'),
  ('Tyler', 'Brooks',    'tyler.brooks@example.com',   '4695550102'),
  ('Ryan',  'Callahan',  'ryan.callahan@example.com',  '3125550103'),
  ('Matt',  'Sullivan',  'matt.sullivan@example.com',  '6175550104'),
  ('Chris', 'Delgado',   'chris.delgado@example.com',  '5125550105'),
  ('Ben',   'Hartley',   'ben.hartley@example.com',    '7045550106'),
  ('Drew',  'Patterson', 'drew.patterson@example.com', '6025550107')
)
UPDATE public.trip_players tp
   SET email = c.email, phone = c.phone
  FROM c, public.trips t
 WHERE tp.trip_id = t.id
   AND t.name IN ('Briggs Ranch Weekend', 'Ballyhack Spring Trip') AND t.deleted_at IS NULL
   AND tp.first_name = c.first_name AND tp.last_name = c.last_name
   AND tp.user_id IS NULL;

-- Flights. Owen is matched by his account (user_id), everyone else by name.
WITH f(trip_name, first_name, last_name, is_driving,
       arrive_date, arrive_time, arrive_airport, flight_in,
       depart_date, depart_time, depart_airport, flight_out) AS (VALUES
  -- Briggs Ranch Weekend — San Antonio (SAT), Dec 4–6, 2026
  ('Briggs Ranch Weekend', NULL,    NULL,        false, '2026-12-04', '10:35', 'SAT', 'AA 2417', '2026-12-06', '16:50', 'SAT', 'AA 1983'),
  ('Briggs Ranch Weekend', 'Jack',  'Morrison',  false, '2026-12-04', '09:55', 'SAT', 'WN 1188', '2026-12-06', '17:20', 'SAT', 'WN 2364'),
  ('Briggs Ranch Weekend', 'Tyler', 'Brooks',    false, '2026-12-04', '09:55', 'SAT', 'WN 1188', '2026-12-06', '17:20', 'SAT', 'WN 2364'),
  ('Briggs Ranch Weekend', 'Ryan',  'Callahan',  false, '2026-12-04', '11:10', 'SAT', 'UA 1542', '2026-12-06', '15:45', 'SAT', 'UA 2290'),
  ('Briggs Ranch Weekend', 'Matt',  'Sullivan',  false, '2026-12-04', '10:20', 'SAT', 'DL 1376', '2026-12-06', '16:05', 'SAT', 'DL 2051'),
  ('Briggs Ranch Weekend', 'Chris', 'Delgado',   true,  NULL,         NULL,    NULL,  NULL,      NULL,         NULL,    NULL,  NULL),
  ('Briggs Ranch Weekend', 'Ben',   'Hartley',   false, '2026-12-04', '08:45', 'SAT', 'AA 1205', '2026-12-06', '18:15', 'SAT', 'AA 2708'),
  ('Briggs Ranch Weekend', 'Drew',  'Patterson', false, '2026-12-04', '10:35', 'SAT', 'AA 2417', '2026-12-06', '16:50', 'SAT', 'AA 1983'),
  -- Ballyhack Spring Trip — Roanoke (ROA), Apr 23–25, 2027
  ('Ballyhack Spring Trip', NULL,    NULL,        false, '2027-04-23', '09:40', 'ROA', 'AA 5521', '2027-04-25', '16:30', 'ROA', 'AA 5874'),
  ('Ballyhack Spring Trip', 'Jack',  'Morrison',  false, '2027-04-23', '09:40', 'ROA', 'AA 5521', '2027-04-25', '16:30', 'ROA', 'AA 5874'),
  ('Ballyhack Spring Trip', 'Tyler', 'Brooks',    false, '2027-04-23', '10:15', 'ROA', 'DL 4812', '2027-04-25', '17:05', 'ROA', 'DL 4930'),
  ('Ballyhack Spring Trip', 'Ryan',  'Callahan',  false, '2027-04-23', '08:55', 'ROA', 'UA 3317', '2027-04-25', '15:50', 'ROA', 'UA 3462'),
  ('Ballyhack Spring Trip', 'Matt',  'Sullivan',  false, '2027-04-23', '10:15', 'ROA', 'DL 4812', '2027-04-25', '17:05', 'ROA', 'DL 4930'),
  ('Ballyhack Spring Trip', 'Chris', 'Delgado',   false, '2027-04-23', '11:20', 'ROA', 'AA 5609', '2027-04-25', '18:10', 'ROA', 'AA 5733'),
  ('Ballyhack Spring Trip', 'Ben',   'Hartley',   true,  NULL,         NULL,    NULL,  NULL,      NULL,         NULL,    NULL,  NULL),
  ('Ballyhack Spring Trip', 'Drew',  'Patterson', false, '2027-04-23', '09:40', 'ROA', 'AA 5521', '2027-04-25', '16:30', 'ROA', 'AA 5874')
)
INSERT INTO public.flights (trip_id, trip_player_id, is_driving,
                            arrive_date, arrive_time, arrive_airport, flight_number_in,
                            depart_date, depart_time, depart_airport, flight_number_out, updated_at)
SELECT t.id, tp.id, f.is_driving,
       f.arrive_date, f.arrive_time, f.arrive_airport, f.flight_in,
       f.depart_date, f.depart_time, f.depart_airport, f.flight_out, now()
  FROM f
  JOIN public.trips t ON t.name = f.trip_name AND t.deleted_at IS NULL
  JOIN public.trip_players tp ON tp.trip_id = t.id
   AND (  (f.first_name IS NULL AND tp.user_id = (SELECT id FROM auth.users WHERE lower(email) = 'o.chamberlin@gmail.com'))
       OR (f.first_name IS NOT NULL AND tp.user_id IS NULL AND tp.first_name = f.first_name AND tp.last_name = f.last_name))
ON CONFLICT (trip_id, trip_player_id) DO UPDATE SET
  is_driving = EXCLUDED.is_driving,
  arrive_date = EXCLUDED.arrive_date, arrive_time = EXCLUDED.arrive_time,
  arrive_airport = EXCLUDED.arrive_airport, flight_number_in = EXCLUDED.flight_number_in,
  depart_date = EXCLUDED.depart_date, depart_time = EXCLUDED.depart_time,
  depart_airport = EXCLUDED.depart_airport, flight_number_out = EXCLUDED.flight_number_out,
  updated_at = now();

COMMIT;
