-- =============================================================
-- Trip Clubhouse — Wizard schema additions
-- Adds start_date/end_date to trips; creates teams table with RLS.
-- IDEMPOTENT: safe to run multiple times.
-- =============================================================

-- Add date columns to trips
ALTER TABLE trips ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS end_date DATE;

-- Teams table
CREATE TABLE IF NOT EXISTS teams (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id     UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teams_select" ON teams;
DROP POLICY IF EXISTS "teams_insert" ON teams;
DROP POLICY IF EXISTS "teams_update" ON teams;
DROP POLICY IF EXISTS "teams_delete" ON teams;

CREATE POLICY "teams_select" ON teams
  FOR SELECT TO authenticated
  USING (trip_id IN (SELECT id FROM trips WHERE is_group_member(group_id)));

CREATE POLICY "teams_insert" ON teams
  FOR INSERT TO authenticated
  WITH CHECK (trip_id IN (SELECT id FROM trips WHERE is_group_admin(group_id)));

CREATE POLICY "teams_update" ON teams
  FOR UPDATE TO authenticated
  USING (trip_id IN (SELECT id FROM trips WHERE is_group_admin(group_id)));

CREATE POLICY "teams_delete" ON teams
  FOR DELETE TO authenticated
  USING (trip_id IN (SELECT id FROM trips WHERE is_group_admin(group_id)));
