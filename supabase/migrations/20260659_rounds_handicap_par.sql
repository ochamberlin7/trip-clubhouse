-- =============================================================
-- Trip Clubhouse — separate "handicap par" for the Course Handicap formula.
-- Non-18-hole courses publish an 18-hole-equivalent par used ONLY in
--   Course Handicap = Index × (Slope/113) + (Rating − Handicap Par).
-- Distinct from the actual par (sum of hole pars) shown as "Par N · H holes".
-- NULL → fall back to actual par (par_total), so 18-hole courses are unaffected.
-- Run in Supabase SQL Editor.
-- =============================================================

ALTER TABLE rounds ADD COLUMN IF NOT EXISTS handicap_par numeric;
