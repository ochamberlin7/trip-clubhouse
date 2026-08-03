-- =============================================================
-- Trip Clubhouse — tee times for more than two pairings.
-- Run in Supabase SQL Editor (project mjssollqfngbeetwnxml).
--
-- A round can have up to ceil(players/4) pairings (2v2 foursomes) — up to 5 at
-- the 20-player max — each teeing off at its own time. rounds only had
-- tee_time_1 / tee_time_2, which capped the Tee Times tab at 2. Add 3/4/5 so
-- slot N maps to tee_time_N. Idempotent.
-- =============================================================

ALTER TABLE rounds ADD COLUMN IF NOT EXISTS tee_time_3 text;
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS tee_time_4 text;
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS tee_time_5 text;
