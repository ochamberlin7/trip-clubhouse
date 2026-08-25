-- =============================================================
-- Trip Clubhouse — mark a round as "no scoring": it still appears in Tee Times
-- and Schedule & Courses (it has tee times), but is hidden from the Scores tab
-- and the leaderboard. For rounds the group isn't keeping score on.
-- Run in Supabase SQL Editor.
-- =============================================================

ALTER TABLE rounds ADD COLUMN IF NOT EXISTS no_scoring boolean DEFAULT false;
