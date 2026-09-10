-- =============================================================
-- Trip Clubhouse — soft-delete for trips (Recently Deleted / restore).
-- Deleting a trip now sets `deleted_at` instead of removing the row: the trip
-- (and all its child data) stays intact and restorable for 30 days, after which
-- purge_expired_trips() permanently removes it. Restore simply clears deleted_at.
--
-- Every normal trip list filters `deleted_at IS NULL`; the Switch Trip screen's
-- "Recently Deleted" section reads the non-null rows within the 30-day window.
-- Run in Supabase SQL Editor.
-- =============================================================

ALTER TABLE trips ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Fast lookups of the (small) set of soft-deleted trips.
CREATE INDEX IF NOT EXISTS trips_deleted_at_idx ON trips (deleted_at) WHERE deleted_at IS NOT NULL;

-- Permanently remove trips soft-deleted more than 30 days ago, plus their child
-- rows (same order the app's dev-reset uses; scores/drinks/pairing_players
-- cascade from rounds/trip_players). SECURITY DEFINER so it can hard-delete past
-- RLS. Returns the number of trips purged.
CREATE OR REPLACE FUNCTION purge_expired_trips()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ids uuid[];
  n integer;
BEGIN
  SELECT array_agg(id) INTO ids
    FROM trips
    WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '30 days';
  IF ids IS NULL THEN
    RETURN 0;
  END IF;
  DELETE FROM rounds       WHERE trip_id = ANY(ids);
  DELETE FROM trip_players WHERE trip_id = ANY(ids);
  DELETE FROM teams        WHERE trip_id = ANY(ids);
  DELETE FROM trips        WHERE id = ANY(ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION purge_expired_trips() TO authenticated;

-- Schedule a daily purge if pg_cron is available; harmless no-op otherwise. The
-- 30-day window is enforced client-side regardless (expired trips stop showing
-- as restorable), so a missing scheduler only delays the physical purge.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('purge-expired-trips', '0 4 * * *', 'SELECT purge_expired_trips()');
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END;
$$;
