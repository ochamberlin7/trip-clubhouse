-- =============================================================
-- Trip Clubhouse — per-course Handicap Allowance % override.
-- The trip carries a global allowance (trips.handicap_allowance) applied when
-- turning Course Handicap into Playing Handicap: PH = round(CH × allowance/100).
-- A course can override it for its own rounds — e.g. a shortened course where the
-- standard allowance over-concentrates strokes onto too few holes (a 12-hole
-- course played at ~65%). NULL → fall back to the trip-wide allowance, so courses
-- without an override are unaffected (resolved via effectiveAllowance() at calc time).
-- Run in Supabase SQL Editor.
-- =============================================================

ALTER TABLE rounds ADD COLUMN IF NOT EXISTS handicap_allowance numeric;
