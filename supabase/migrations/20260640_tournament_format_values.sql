-- =============================================================
-- Trip Clubhouse — split the tournament format into two variants.
--
-- The existing "Match Play" format (stored as 'match_play') is renamed to
-- 'points_match_play' for clarity, and a second variant 'standard_match_play'
-- is introduced. Display names:
--   'points_match_play'   → "Point Match Play"
--   'standard_match_play' → "Standard Match Play"
-- Non-tournament trips keep storing 'stroke_play'.
--
-- Session 1 of 3 (database + rename + onboarding only — scoring/leaderboard/
-- live banner are untouched for now).
--
-- 1. Drop any CHECK constraint currently on trips.format (name-agnostic) so the
--    value rename can't be blocked by an old ('match_play','stroke_play') check.
-- 2. Rename the stored value 'match_play' → 'points_match_play'.
-- 3. Re-add a CHECK constraint allowing both match-play variants plus the
--    existing stroke_play (and NULL, for legacy rows).
--
-- Idempotent. Run in Supabase SQL Editor (project mjssollqfngbeetwnxml).
-- =============================================================

-- 1. Remove any existing CHECK constraint referencing the format column.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'public'
      AND rel.relname = 'trips'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%format%'
  LOOP
    EXECUTE format('ALTER TABLE public.trips DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

-- 2. Rename the existing stored value.
UPDATE public.trips
  SET format = 'points_match_play'
  WHERE format = 'match_play';

-- 3. Allow both match-play variants (and the existing stroke_play / NULL).
ALTER TABLE public.trips
  ADD CONSTRAINT trips_format_check
  CHECK (format IS NULL OR format IN ('stroke_play', 'points_match_play', 'standard_match_play'));
