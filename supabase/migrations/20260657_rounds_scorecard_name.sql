-- =============================================================
-- Trip Clubhouse — optional manual "scorecard display name" for a round,
-- used for the round-selection pill on the Scores tab. When blank, the pill
-- falls back to the course's sub-name (or club name).
-- Run in Supabase SQL Editor.
-- =============================================================

ALTER TABLE rounds ADD COLUMN IF NOT EXISTS scorecard_name text;
