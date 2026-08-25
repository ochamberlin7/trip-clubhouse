-- =============================================================
-- Trip Clubhouse — publish `trips` for realtime so trip-setting changes
-- (e.g. the Tournament Purse amount / "show on home" toggle) reach open
-- clients instantly without a refresh. UPDATE payloads include the full new
-- row by default, so no REPLICA IDENTITY change is needed.
-- Run in Supabase SQL Editor.
-- =============================================================

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE trips;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
