-- 20260684_past_trips.sql
-- Past trips (Owen, 2026-11-06): the Couch Tour Invitational's trips from before
-- Trip Clubhouse, brought in from the old trip spreadsheets. Only who went, each
-- player's handicap index, the teams and the result: the sheets have no
-- hole-by-hole scores. They count toward trips played, the handicap chart and
-- trips won on the Career stats page (Individual and Group); see src/lib/pastTrips.js.
--
-- Kept in their own tables, NOT in trips, so they never appear in the trip
-- switcher, Home's trip list or anywhere a real trip can be opened.
--
-- The CTI group is the "Couch Tour..." group with the most players on its trips
-- (there are several groups with that name). Players are matched to their
-- accounts by name (first name + last initial) among that group's trip players. Anyone with no account (e.g. Tony,
-- Eric, John E.) is stored by name only: listed on the trip, no stats of their own.
--
-- Read access: members of the trip's group. No one writes from the app.
-- Idempotent: safe to run twice (fixed trip ids; players are replaced).
-- Run in the Supabase SQL editor.

BEGIN;

CREATE TABLE IF NOT EXISTS public.past_trips (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  name          text NOT NULL,
  start_date    date,
  end_date      date,
  location      text,
  format_label  text,
  rounds        int,
  courses       text[] NOT NULL DEFAULT '{}',
  result_kind   text NOT NULL DEFAULT 'team' CHECK (result_kind IN ('team', 'player')),
  -- [{ "index": 1, "name": "Wang Rails", "points": 90, "rank": 1 }]; points may be null
  teams         jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.past_trip_players (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  past_trip_id    uuid NOT NULL REFERENCES public.past_trips(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name            text NOT NULL,
  handicap_index  numeric,
  team_index      int,
  rank            int            -- individual trips: 1 = winner
);
CREATE INDEX IF NOT EXISTS past_trip_players_trip_idx ON public.past_trip_players (past_trip_id);
CREATE INDEX IF NOT EXISTS past_trip_players_user_idx ON public.past_trip_players (user_id);
CREATE INDEX IF NOT EXISTS past_trips_group_idx ON public.past_trips (group_id);

ALTER TABLE public.past_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.past_trip_players ENABLE ROW LEVEL SECURITY;

-- The app reads these as the signed-in user (RLS below decides which rows).
GRANT SELECT ON public.past_trips, public.past_trip_players TO authenticated;

DROP POLICY IF EXISTS "past_trips_select" ON public.past_trips;
CREATE POLICY "past_trips_select" ON public.past_trips FOR SELECT TO authenticated
USING (is_group_member(group_id));

DROP POLICY IF EXISTS "past_trip_players_select" ON public.past_trip_players;
CREATE POLICY "past_trip_players_select" ON public.past_trip_players FOR SELECT TO authenticated
USING (past_trip_id IN (SELECT id FROM public.past_trips WHERE is_group_member(group_id)));

-- ── The CTI's four past trips ────────────────────────────────────────────────
DO $$
DECLARE
  g uuid;
  n int;
BEGIN
  -- Several groups can be named "Couch Tour..." (test / duplicate groups). Use
  -- the one holding the real CTI trips: the most players with accounts on its
  -- (not deleted) trips. Stop if none has any, or if two are level.
  WITH c AS (
    SELECT gr.id, count(DISTINCT COALESCE(tp.claimed_user_id, tp.user_id)) AS people
    FROM public.groups gr
    JOIN public.trips t ON t.group_id = gr.id AND t.deleted_at IS NULL
    JOIN public.trip_players tp ON tp.trip_id = t.id AND COALESCE(tp.claimed_user_id, tp.user_id) IS NOT NULL
    WHERE gr.name ILIKE 'Couch Tour%'
    GROUP BY gr.id
  )
  SELECT (SELECT id FROM c ORDER BY people DESC LIMIT 1),
         (SELECT count(*) FROM c WHERE people = (SELECT max(people) FROM c))
    INTO g, n;
  IF g IS NULL THEN
    RAISE EXCEPTION 'No Couch Tour group with players found';
  END IF;
  IF n > 1 THEN
    RAISE EXCEPTION 'Two Couch Tour groups have the same number of players; pick one by id';
  END IF;
  RAISE NOTICE 'Using group % (%)', (SELECT name FROM public.groups WHERE id = g), g;

  -- Account for a name: first name + last initial (or first name alone when the
  -- sheet only had that), among this group's trip players. NULL unless exactly
  -- one account matches.
  CREATE TEMP TABLE cti_people ON COMMIT DROP AS
    SELECT DISTINCT COALESCE(tp.claimed_user_id, tp.user_id) AS uid,
           lower(trim(tp.first_name)) AS first, lower(left(trim(coalesce(tp.last_name, '')), 1)) AS init
    FROM public.trip_players tp JOIN public.trips t ON t.id = tp.trip_id
    WHERE t.group_id = g AND COALESCE(tp.claimed_user_id, tp.user_id) IS NOT NULL;

  CREATE TEMP TABLE sheet (trip uuid, name text, hcp numeric, team int, rank int) ON COMMIT DROP;

  INSERT INTO public.past_trips (id, group_id, name, start_date, end_date, location, format_label, rounds, courses, result_kind, teams) VALUES
    ('039f06f6-50b5-47a3-9343-6853e1a3ba8a', g, 'Wisconsin 2022', '2022-08-11', '2022-08-15', 'Wisconsin',
     'Better ball Nassau, rotating partners', 5,
     ARRAY['Lawsonia Woodlands', 'Lawsonia Links', 'Erin Hills', 'Mammoth Dunes', 'Sand Valley'], 'player', '[]'),
    ('2f9c1d5b-32c3-47b7-bbc0-a2d30a479096', g, 'Pinehurst 2023', '2023-06-08', '2023-06-12', 'Pinehurst, NC',
     'Team better ball (Nassau)', 6,
     ARRAY['Mid Pines', 'Southern Pines', 'Tobacco Road', 'Pinehurst No. 2', 'Pinehurst No. 8', 'Duke University GC'], 'team',
     '[{"index":1,"name":"Leather Cheerios","points":null,"rank":1},{"index":2,"name":"Steve Claws","points":null,"rank":2}]'),
    ('9d896778-a1b8-4af7-873e-989e3d594841', g, 'Kiawah 2024', '2024-10-10', '2024-10-14', 'Kiawah Island, SC',
     'Team match play (points)', 5,
     ARRAY['Turtle Point', 'Ocean Course', 'Cougar Point', 'Osprey Point'], 'team',
     '[{"index":1,"name":"Wang Rails","points":90,"rank":1},{"index":2,"name":"Tony P and Scissor Sisters","points":90,"rank":1}]'),
    ('71159cfd-d5c7-4dcd-aec8-c6c07d20c485', g, 'Prairie Club 2025', '2025-09-16', '2025-09-21', 'Valentine, NE',
     'Team match play (points)', 6,
     ARRAY['Prairie Club Pines', 'Prairie Club Dunes', 'Wild Horse'], 'team',
     '[{"index":1,"name":null,"points":null,"rank":2},{"index":2,"name":null,"points":null,"rank":1}]')
  ON CONFLICT (id) DO UPDATE SET
    group_id = EXCLUDED.group_id, name = EXCLUDED.name, start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date,
    location = EXCLUDED.location, format_label = EXCLUDED.format_label, rounds = EXCLUDED.rounds,
    courses = EXCLUDED.courses, result_kind = EXCLUDED.result_kind, teams = EXCLUDED.teams;

  INSERT INTO sheet VALUES
    -- Wisconsin 2022: individual; "Result = Jeff won"
    ('039f06f6-50b5-47a3-9343-6853e1a3ba8a', 'Jeff Nelson', 15, NULL, 1),
    ('039f06f6-50b5-47a3-9343-6853e1a3ba8a', 'Jon Nelson', 19, NULL, NULL),
    ('039f06f6-50b5-47a3-9343-6853e1a3ba8a', 'Owen Chamberlin', 9.9, NULL, NULL),
    ('039f06f6-50b5-47a3-9343-6853e1a3ba8a', 'Tony Pacello', 6.0, NULL, NULL),
    -- Pinehurst 2023: Leather Cheerios (1) beat Steve Claws (2)
    ('2f9c1d5b-32c3-47b7-bbc0-a2d30a479096', 'Tony Pacello', 7, 1, NULL),
    ('2f9c1d5b-32c3-47b7-bbc0-a2d30a479096', 'Jeff Nelson', 15, 1, NULL),
    ('2f9c1d5b-32c3-47b7-bbc0-a2d30a479096', 'Nate Riegler', 22, 1, NULL),
    ('2f9c1d5b-32c3-47b7-bbc0-a2d30a479096', 'Owen Chamberlin', 10, 2, NULL),
    ('2f9c1d5b-32c3-47b7-bbc0-a2d30a479096', 'Steve', 16, 2, NULL),
    ('2f9c1d5b-32c3-47b7-bbc0-a2d30a479096', 'Jon Nelson', 18, 2, NULL),
    -- Kiawah 2024: Wang Rails (1) 90, Tony P and Scissor Sisters (2) 90 — tie
    ('9d896778-a1b8-4af7-873e-989e3d594841', 'Cody Lewis', 18.0, 1, NULL),
    ('9d896778-a1b8-4af7-873e-989e3d594841', 'Jeff Nelson', 14.4, 1, NULL),
    ('9d896778-a1b8-4af7-873e-989e3d594841', 'Owen Chamberlin', 9.8, 1, NULL),
    ('9d896778-a1b8-4af7-873e-989e3d594841', 'John Edmison', 15.0, 1, NULL),
    ('9d896778-a1b8-4af7-873e-989e3d594841', 'Jon Nelson', 17.3, 2, NULL),
    ('9d896778-a1b8-4af7-873e-989e3d594841', 'Nate Riegler', 23.1, 2, NULL),
    ('9d896778-a1b8-4af7-873e-989e3d594841', 'Eric Brinen', 4.2, 2, NULL),
    ('9d896778-a1b8-4af7-873e-989e3d594841', 'Tony Pacello', 7.7, 2, NULL),
    -- Prairie Club 2025: Team 2 won ("Loser buys dinner — Owen, Bryan, Cody, Nate")
    ('71159cfd-d5c7-4dcd-aec8-c6c07d20c485', 'Owen Chamberlin', 9.3, 1, NULL),
    ('71159cfd-d5c7-4dcd-aec8-c6c07d20c485', 'Bryan Redden', 8.6, 1, NULL),
    ('71159cfd-d5c7-4dcd-aec8-c6c07d20c485', 'Nate Riegler', 24.0, 1, NULL),
    ('71159cfd-d5c7-4dcd-aec8-c6c07d20c485', 'Cody Lewis', 23.0, 1, NULL),
    ('71159cfd-d5c7-4dcd-aec8-c6c07d20c485', 'Jon Nelson', 16.1, 2, NULL),
    ('71159cfd-d5c7-4dcd-aec8-c6c07d20c485', 'Ben Freeman', 17.7, 2, NULL),
    ('71159cfd-d5c7-4dcd-aec8-c6c07d20c485', 'Jeff Nelson', 13.4, 2, NULL),
    ('71159cfd-d5c7-4dcd-aec8-c6c07d20c485', 'Steve', 13.6, 2, NULL);

  DELETE FROM public.past_trip_players WHERE past_trip_id IN (SELECT DISTINCT trip FROM sheet);

  INSERT INTO public.past_trip_players (past_trip_id, user_id, name, handicap_index, team_index, rank)
  SELECT s.trip,
         (SELECT CASE WHEN count(DISTINCT p.uid) = 1 THEN min(p.uid::text)::uuid END
            FROM cti_people p
           WHERE p.first = lower(split_part(s.name, ' ', 1))
             AND (position(' ' IN s.name) = 0 OR p.init = lower(left(split_part(s.name, ' ', 2), 1)))),
         s.name, s.hcp, s.team, s.rank
  FROM sheet s;
END $$;

COMMIT;

-- Make the API see the new tables right away.
NOTIFY pgrst, 'reload schema';

-- Check who got matched to an account (NULL user_id = stored by name only):
-- SELECT t.name AS trip, p.name, p.user_id IS NOT NULL AS has_account, p.handicap_index, p.team_index
-- FROM past_trip_players p JOIN past_trips t ON t.id = p.past_trip_id ORDER BY t.start_date, p.team_index, p.name;
