-- =============================================================
-- Trip Clubhouse — editable local rules
-- Stores the Rules page's "Local Rules" as a JSONB array of strings on the trip.
-- Null means "not set yet" (the UI falls back to the default rules).
-- IDEMPOTENT.
-- =============================================================
ALTER TABLE trips ADD COLUMN IF NOT EXISTS local_rules jsonb;
