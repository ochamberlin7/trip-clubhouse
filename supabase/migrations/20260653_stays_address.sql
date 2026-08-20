-- =============================================================
-- Trip Clubhouse — add an optional address to lodging (stays).
-- Run in Supabase SQL Editor (project mjssollqfngbeetwnxml). Idempotent.
--
-- Shown on the Schedule & Courses lodging row as a muted second line.
-- =============================================================

ALTER TABLE stays ADD COLUMN IF NOT EXISTS address text;
