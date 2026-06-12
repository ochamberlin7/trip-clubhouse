-- =============================================================
-- Trip Clubhouse — GolfCourseAPI course data on rounds.
-- Run in Supabase SQL Editor.
-- =============================================================

ALTER TABLE rounds ADD COLUMN IF NOT EXISTS golfcourse_id integer;
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS club_name text;
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS tee_name text;
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS course_rating numeric;
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS slope_rating numeric;

-- Full 18-hole array from the API, 0-indexed (holes[0] = hole 1):
--   [{ "par": 4, "yardage": 484, "handicap": 9 }, ...] × 18
-- where "handicap" = stroke index (1–18 difficulty rank).
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS holes jsonb;
