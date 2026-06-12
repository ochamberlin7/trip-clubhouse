-- =============================================================
-- Trip Clubhouse — par total + hole count on rounds.
-- Run in Supabase SQL Editor.
-- =============================================================

ALTER TABLE rounds ADD COLUMN IF NOT EXISTS par_total integer;
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS number_of_holes integer DEFAULT 18;
