-- =============================================================
-- Trip Clubhouse — make teams.name nullable.
-- Teams are created (at trip creation) before they're named. A null name means
-- "not yet named": getTeamDisplayName() falls back to "Team {index}" and
-- teamsAllNamed() treats null as unnamed so the naming editor opens. The wizard
-- inserts teams with name = null, which fails if the column is still NOT NULL.
-- (This restates the change from 20260626_teams_foundation.sql in isolation, for
-- databases where that migration hasn't been applied.)
-- IDEMPOTENT: safe to run multiple times.
-- Run in Supabase SQL Editor.
-- =============================================================

ALTER TABLE teams ALTER COLUMN name DROP NOT NULL;
