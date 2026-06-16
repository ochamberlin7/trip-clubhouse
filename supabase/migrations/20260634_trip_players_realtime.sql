-- =============================================================
-- Trip Clubhouse — publish trip_players for realtime.
-- Handicap index (HI) lives in trip_players.handicap_index and is never stored
-- as a derived value — course handicaps and net scores are computed on the fly
-- from the current HI. Publishing the table lets an HI edit propagate live to
-- the course cards, the scorecard headers, and all scoring/leaderboard
-- calculations (including completed rounds), via postgres_changes.
-- UPDATE payloads include the full new row by default, so no REPLICA IDENTITY
-- change is needed here.
-- Run in Supabase SQL Editor.
-- =============================================================

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE trip_players; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
