-- =============================================================
-- Trip Clubhouse — handicap allowance percentage on trips.
-- Run in Supabase SQL Editor.
-- =============================================================

ALTER TABLE trips ADD COLUMN IF NOT EXISTS handicap_allowance integer DEFAULT 100;
