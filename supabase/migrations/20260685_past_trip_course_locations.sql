-- 20260685_past_trip_course_locations.sql
-- City and state for each course on the CTI's past trips (Owen, 2026-11-07), shown
-- on the right of each course row in the Group stats trip summary. Same order as
-- past_trips.courses. Changes no players or results.
--
-- Idempotent: safe to run twice. Run in the Supabase SQL editor.

BEGIN;

ALTER TABLE public.past_trips ADD COLUMN IF NOT EXISTS course_locations text[] NOT NULL DEFAULT '{}';

-- Wisconsin 2022: Lawsonia Woodlands, Lawsonia Links, Erin Hills, Mammoth Dunes, Sand Valley
UPDATE public.past_trips SET course_locations = ARRAY['Green Lake, WI', 'Green Lake, WI', 'Erin, WI', 'Nekoosa, WI', 'Nekoosa, WI']
WHERE id = '039f06f6-50b5-47a3-9343-6853e1a3ba8a';

-- Pinehurst 2023: Mid Pines, Southern Pines, Tobacco Road, Pinehurst No. 2, Pinehurst No. 8, Duke University GC
UPDATE public.past_trips SET course_locations = ARRAY['Southern Pines, NC', 'Southern Pines, NC', 'Sanford, NC', 'Pinehurst, NC', 'Pinehurst, NC', 'Durham, NC']
WHERE id = '2f9c1d5b-32c3-47b7-bbc0-a2d30a479096';

-- Kiawah 2024: Turtle Point, Ocean Course, Cougar Point, Osprey Point
UPDATE public.past_trips SET course_locations = ARRAY['Kiawah Island, SC', 'Kiawah Island, SC', 'Kiawah Island, SC', 'Kiawah Island, SC']
WHERE id = '9d896778-a1b8-4af7-873e-989e3d594841';

-- Prairie Club 2025: Prairie Club Pines, Prairie Club Dunes, Wild Horse
UPDATE public.past_trips SET course_locations = ARRAY['Valentine, NE', 'Valentine, NE', 'Gothenburg, NE']
WHERE id = '71159cfd-d5c7-4dcd-aec8-c6c07d20c485';

COMMIT;

-- Make the API see the new column right away.
NOTIFY pgrst, 'reload schema';
