-- =============================================================
-- Trip Clubhouse — allow the Stableford main format (game types, Phase 1).
--
-- trips.format had CHECK trips_format_check (migration 20260640) allowing only
-- 'stroke_play', 'points_match_play', 'standard_match_play' (or NULL). Stroke Play
-- tournaments reuse 'stroke_play' (with team_mode = true), so only 'stableford'
-- is new. Without this, creating a Stableford trip fails with
-- "violates check constraint trips_format_check".
--
-- Same name-agnostic drop as 20260640, then re-add with 'stableford'.
-- Idempotent; safe to re-run. Run in the Supabase SQL Editor.
-- =============================================================

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

ALTER TABLE public.trips
  ADD CONSTRAINT trips_format_check
  CHECK (format IS NULL OR format IN ('stroke_play', 'points_match_play', 'standard_match_play', 'stableford'));
