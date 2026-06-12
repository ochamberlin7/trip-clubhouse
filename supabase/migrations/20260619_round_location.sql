-- =============================================================
-- Trip Clubhouse — per-round course location (for weather).
-- Run in Supabase SQL Editor.
-- =============================================================

ALTER TABLE rounds ADD COLUMN IF NOT EXISTS location_city text;
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS location_state text;
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS location_lat numeric;
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS location_lon numeric;
