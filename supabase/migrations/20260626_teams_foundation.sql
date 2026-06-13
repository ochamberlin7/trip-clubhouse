-- =============================================================
-- Trip Clubhouse — teams foundation
-- Teams are created at trip creation (not lazily). This adds a stable team_index
-- and color_index, makes name nullable (teams start unnamed), removes duplicate
-- rows left by the old insert-on-save bug, and enforces one row per
-- (trip_id, team_index).
-- IDEMPOTENT: safe to run multiple times.
-- =============================================================

-- 1. Columns + nullable name (a team exists before it is named).
ALTER TABLE teams ADD COLUMN IF NOT EXISTS team_index  smallint;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS color_index smallint;
ALTER TABLE teams ALTER COLUMN name DROP NOT NULL;

-- 2. De-duplicate. The teams table has no timestamp column, so order by id (UUID) as a
--    stable tiebreaker. Per trip, keep the first two rows by id and delete the rest.
--    Detach any players on a doomed row first — trip_players.team_id has no ON DELETE,
--    so the delete would otherwise be blocked; those players become Unassigned and can
--    be re-assigned from a player card. NOTE: this targets the standard 2-team setup
--    the duplicate bug affected. If a trip legitimately has 3-4 teams, re-create/rename
--    them in Commissioner Tools.
UPDATE trip_players SET team_id = NULL WHERE team_id IN (
  SELECT id FROM (
    SELECT id, row_number() OVER (PARTITION BY trip_id ORDER BY id) AS rn
    FROM teams
  ) q WHERE q.rn > 2
);

DELETE FROM teams WHERE id IN (
  SELECT id FROM (
    SELECT id, row_number() OVER (PARTITION BY trip_id ORDER BY id) AS rn
    FROM teams
  ) q WHERE q.rn > 2
);

-- 3. Re-sequence team_index (1, 2 by id order) and set color_index = team_index.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY trip_id ORDER BY id) AS rn
  FROM teams
)
UPDATE teams t SET team_index = r.rn, color_index = r.rn
FROM ranked r
WHERE t.id = r.id;

-- 4. Enforce one row per (trip_id, team_index) so duplicates can never reappear.
DROP INDEX IF EXISTS teams_trip_index_uniq;
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_trip_index_uniq;
ALTER TABLE teams ADD CONSTRAINT teams_trip_index_uniq UNIQUE (trip_id, team_index);
