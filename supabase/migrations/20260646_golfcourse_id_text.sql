-- =============================================================
-- Trip Clubhouse — fix rounds.golfcourse_id type.
-- Run in Supabase SQL Editor (project mjssollqfngbeetwnxml).
--
-- GolfCourseAPI course ids are ALPHANUMERIC strings (e.g. "46samd7y",
-- "j7rt0gct"), not integers — the column was mistyped as integer in
-- 20260612_course_data.sql. Inserting a round with a real selected course
-- therefore fails with: invalid input syntax for type integer: "46samd7y".
-- The id is used to re-fetch course details (getCourseDetails), so it must
-- store the real string id, not be discarded — change the column to text.
-- Idempotent (a no-op if already text).
-- =============================================================

ALTER TABLE rounds ALTER COLUMN golfcourse_id TYPE text USING golfcourse_id::text;
