-- =============================================================
-- Trip Clubhouse — per-player "Captain" flag.
-- A boolean on trip_players marking a player as their team's captain. Unlike the
-- commissioner (which is derived from the group's admin role), captain is an
-- explicit per-player field a commissioner toggles on the Players & Teams edit
-- card. The team the captain leads is simply that player's existing team_id — no
-- separate team selection. The roster summary sorts a team's captain first.
--
-- Intended as at most one captain per team; the app clears the flag on teammates
-- when a new captain is set, but the summary/card tolerate duplicates gracefully.
-- Run in Supabase SQL Editor.
-- =============================================================

ALTER TABLE trip_players
  ADD COLUMN IF NOT EXISTS is_captain boolean NOT NULL DEFAULT false;
