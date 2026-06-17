-- =============================================================
-- Trip Clubhouse — track whether a member has dismissed the
-- "Getting Started" checklist for a trip.
--
-- Chunk 1 of 4 (data foundation only — no UI). Adds a per-trip-player flag,
-- defaulting to false so every existing and new member starts with the
-- checklist un-dismissed. Idempotent.
-- Run in Supabase SQL Editor (project mjssollqfngbeetwnxml).
-- =============================================================

ALTER TABLE trip_players
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;
