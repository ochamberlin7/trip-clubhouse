-- =============================================================
-- Trip Clubhouse — cache available tees per round's course.
-- Run in Supabase SQL Editor.
-- =============================================================

-- Available tees for the round's course, pulled from GolfCourseAPI when a
-- course is assigned to the round. Array of:
--   [{ "name": "Blue", "slope": 128, "rating": 71.4, "par": 72 }, ...]
-- Used to populate the per-player tee dropdowns in Commissioner Tools and as a
-- fallback source for slope/rating/par when computing course handicaps.
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS tees jsonb;
