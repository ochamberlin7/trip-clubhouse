-- =============================================================
-- Trip Clubhouse — permanent "don't remind me again" opt-out for the
-- Getting Started modal.
-- Run in Supabase SQL Editor (project mjssollqfngbeetwnxml).
--
-- Independent of onboarding_completed (which gates the one-time first-login
-- tips) and of the live-derived persistent item checks. Once true, the Getting
-- Started modal is suppressed for that trip_player entirely, regardless of
-- whether any checklist item later becomes incomplete again. Idempotent.
-- =============================================================

ALTER TABLE trip_players
  ADD COLUMN IF NOT EXISTS getting_started_opted_out boolean NOT NULL DEFAULT false;
