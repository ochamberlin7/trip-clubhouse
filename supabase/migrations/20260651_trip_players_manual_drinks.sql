-- =============================================================
-- Trip Clubhouse — manual drink tally for the Stats page drink leaderboard.
-- Run in Supabase SQL Editor (project mjssollqfngbeetwnxml).
--
-- Drinks are otherwise stored per hole (drinks table, hole_number 1-18). The
-- Stats page drink leaderboard adds an ad-hoc +/- adjuster that isn't tied to a
-- hole, so store that running manual count here. Total drinks =
-- sum(per-hole drinks.count) + trip_players.manual_drinks. Idempotent.
-- Writes go through the existing trip_players_update RLS (commissioner or the
-- player's own row).
-- =============================================================

ALTER TABLE trip_players
  ADD COLUMN IF NOT EXISTS manual_drinks integer NOT NULL DEFAULT 0 CHECK (manual_drinks >= 0);
