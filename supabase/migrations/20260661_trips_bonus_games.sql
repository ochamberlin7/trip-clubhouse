-- =============================================================
-- Trip Clubhouse — bonus games on a trip.
-- A trip can opt into one or more trip-long "bonus games" (separate from the main
-- tournament format), chosen once during trip setup. Stored as a JSONB array of
-- game ids, e.g. ["prince_of_wales"]. Empty array → no bonus games. Data-driven so
-- more games can be added later without a schema change.
-- Run in Supabase SQL Editor.
-- =============================================================

ALTER TABLE trips ADD COLUMN IF NOT EXISTS bonus_games jsonb NOT NULL DEFAULT '[]'::jsonb;
