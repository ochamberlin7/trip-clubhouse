-- =============================================================
-- Trip Clubhouse — ensure the tournament purse amount column exists.
-- The original 20260611_purse.sql was never applied on some databases, so
-- saving the purse amount fails with "column trips.purse_amount does not exist".
-- Idempotent. Run in Supabase SQL Editor.
-- =============================================================

ALTER TABLE trips ADD COLUMN IF NOT EXISTS purse_amount numeric DEFAULT 0;
