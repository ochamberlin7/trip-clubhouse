-- =============================================================
-- Trip Clubhouse — Prince of Wales composite storage.
-- Prince of Wales is a trip-long team bonus game: for each team, each hole slot
-- 1..18 takes the single lowest score any teammate posted in that slot across all
-- tournament rounds. Two composites are kept per team — gross and net — each an
-- 18-cell array (null = unscored) plus its total (sum of scored cells).
--
-- The composites are computed live on the client from the `scores` table; this
-- table persists the latest computed result per team so it's available for
-- reference later (e.g. trip archives). It is NOT the source of truth for the live
-- display. Run in Supabase SQL Editor.
-- =============================================================

CREATE TABLE IF NOT EXISTS prince_of_wales_composites (
  trip_id     uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  team_id     uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  gross       jsonb NOT NULL DEFAULT '[]'::jsonb,   -- 18-cell array; null per unscored slot
  net         jsonb NOT NULL DEFAULT '[]'::jsonb,   -- 18-cell array; null per unscored slot
  gross_total integer NOT NULL DEFAULT 0,
  net_total   integer NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, team_id)
);

ALTER TABLE prince_of_wales_composites ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prince_of_wales_composites TO authenticated;

-- All trip members can read AND write (the composite is recomputed and upserted
-- live by whichever member is viewing the Prince of Wales tab).
DROP POLICY IF EXISTS "pow_select" ON prince_of_wales_composites;
CREATE POLICY "pow_select" ON prince_of_wales_composites FOR SELECT TO authenticated
USING (trip_id IN (SELECT id FROM trips WHERE is_group_member(group_id)));

DROP POLICY IF EXISTS "pow_insert" ON prince_of_wales_composites;
CREATE POLICY "pow_insert" ON prince_of_wales_composites FOR INSERT TO authenticated
WITH CHECK (trip_id IN (SELECT id FROM trips WHERE is_group_member(group_id)));

DROP POLICY IF EXISTS "pow_update" ON prince_of_wales_composites;
CREATE POLICY "pow_update" ON prince_of_wales_composites FOR UPDATE TO authenticated
USING (trip_id IN (SELECT id FROM trips WHERE is_group_member(group_id)))
WITH CHECK (trip_id IN (SELECT id FROM trips WHERE is_group_member(group_id)));

DROP POLICY IF EXISTS "pow_delete" ON prince_of_wales_composites;
CREATE POLICY "pow_delete" ON prince_of_wales_composites FOR DELETE TO authenticated
USING (trip_id IN (SELECT id FROM trips WHERE is_group_admin(group_id)));
