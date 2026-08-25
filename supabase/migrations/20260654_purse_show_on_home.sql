-- =============================================================
-- Trip Clubhouse — whether the Tournament Purse widget shows on the Home tab.
-- Per-trip (the dinner amount already lives on trips.purse_amount).
-- Run in Supabase SQL Editor.
-- =============================================================

ALTER TABLE trips ADD COLUMN IF NOT EXISTS show_purse_on_home boolean DEFAULT false;
