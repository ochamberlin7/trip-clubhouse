-- =============================================================
-- Trip Clubhouse — Lodging (Stays) and Meals.
-- Run in Supabase SQL Editor (project mjssollqfngbeetwnxml).
--
-- • stays: hotel stays for a TRIP (a trip can have more than one — the group
--   may change hotels mid-trip). Not tied to a single day.
-- • meals: meal entries for a specific DAY of a trip (zero or more per day).
--   meal_time is stored as a display string ("6:30 PM") like tee_time_* so it
--   sorts/renders the same way alongside tee times.
--
-- RLS mirrors the app's trip-scoped convention: any member of the trip's group
-- may read and write (is_group_member(group_id)). Idempotent.
-- =============================================================

-- ── stays ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stays (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      uuid REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
  hotel_name   text,
  check_in     date,
  check_out    date,
  confirmation text,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stays TO authenticated;
ALTER TABLE stays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stays_select" ON stays;
CREATE POLICY "stays_select" ON stays FOR SELECT TO authenticated
  USING (trip_id IN (SELECT id FROM trips WHERE is_group_member(group_id)));

DROP POLICY IF EXISTS "stays_insert" ON stays;
CREATE POLICY "stays_insert" ON stays FOR INSERT TO authenticated
  WITH CHECK (trip_id IN (SELECT id FROM trips WHERE is_group_member(group_id)));

DROP POLICY IF EXISTS "stays_update" ON stays;
CREATE POLICY "stays_update" ON stays FOR UPDATE TO authenticated
  USING (trip_id IN (SELECT id FROM trips WHERE is_group_member(group_id)))
  WITH CHECK (trip_id IN (SELECT id FROM trips WHERE is_group_member(group_id)));

DROP POLICY IF EXISTS "stays_delete" ON stays;
CREATE POLICY "stays_delete" ON stays FOR DELETE TO authenticated
  USING (trip_id IN (SELECT id FROM trips WHERE is_group_member(group_id)));

-- ── meals ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      uuid REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
  day          date NOT NULL,
  meal_type    text NOT NULL DEFAULT 'dinner'
               CHECK (meal_type IN ('breakfast', 'lunch', 'happy_hour', 'dinner', 'other')),
  custom_label text,               -- free-text label when meal_type = 'other'
  location     text,               -- restaurant / venue name
  meal_time    text,               -- display string, e.g. "6:30 PM"
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meals TO authenticated;
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meals_select" ON meals;
CREATE POLICY "meals_select" ON meals FOR SELECT TO authenticated
  USING (trip_id IN (SELECT id FROM trips WHERE is_group_member(group_id)));

DROP POLICY IF EXISTS "meals_insert" ON meals;
CREATE POLICY "meals_insert" ON meals FOR INSERT TO authenticated
  WITH CHECK (trip_id IN (SELECT id FROM trips WHERE is_group_member(group_id)));

DROP POLICY IF EXISTS "meals_update" ON meals;
CREATE POLICY "meals_update" ON meals FOR UPDATE TO authenticated
  USING (trip_id IN (SELECT id FROM trips WHERE is_group_member(group_id)))
  WITH CHECK (trip_id IN (SELECT id FROM trips WHERE is_group_member(group_id)));

DROP POLICY IF EXISTS "meals_delete" ON meals;
CREATE POLICY "meals_delete" ON meals FOR DELETE TO authenticated
  USING (trip_id IN (SELECT id FROM trips WHERE is_group_member(group_id)));
