-- =============================================================
-- Trip Clubhouse — tournament purse amount on trips.
-- Run in Supabase SQL Editor.
-- =============================================================

ALTER TABLE trips ADD COLUMN IF NOT EXISTS purse_amount numeric DEFAULT 0;
