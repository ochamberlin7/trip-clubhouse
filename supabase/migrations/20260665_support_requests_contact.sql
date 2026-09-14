-- =============================================================
-- Trip Clubhouse — capture the submitter's email + name on support requests.
-- Feedback rows already store user_id/trip_id, but reading the person's email
-- and display name meant a second join (and RLS blocks that for triage). Store
-- them denormalized on the row at submit time so a plain SELECT shows who wrote
-- in. Both are nullable — older rows and any unauthenticated submit stay valid.
-- Run in Supabase SQL Editor.
-- =============================================================

ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS name  text;
