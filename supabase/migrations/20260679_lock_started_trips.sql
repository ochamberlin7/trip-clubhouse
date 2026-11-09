-- =============================================================
-- Trip Clubhouse — once a trip starts, it's locked for everyone.
--   1. A started (or finished) trip can't be deleted, even by its commissioner.
--   2. Nobody can leave / be removed from a started trip (a player's spot can't
--      be unlinked from their account).
-- The app already hides these actions; this is the server-side backstop.
--
-- "Started" = the trip's local date (trips.time_zone, falling back to Eastern)
-- is on or after start_date — same rule as isRosterLocked() in scoring.js.
-- Test-mode trips (trips.test_mode) are exempt, like the app's dev override.
-- Restoring a deleted trip (deleted_at → NULL) is always allowed.
-- Run in Supabase SQL Editor.
-- =============================================================

CREATE OR REPLACE FUNCTION public.trip_has_started(t public.trips)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT t.start_date IS NOT NULL
     AND (now() AT TIME ZONE coalesce(nullif(t.time_zone, ''), 'America/New_York'))::date >= t.start_date;
$$;

-- 1. No deleting a started trip.
CREATE OR REPLACE FUNCTION public.block_delete_started_trip()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL
     AND NOT coalesce(OLD.test_mode, false)
     AND public.trip_has_started(OLD) THEN
    RAISE EXCEPTION 'This trip has started, so it can''t be deleted.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trips_block_delete_started ON public.trips;
CREATE TRIGGER trips_block_delete_started
  BEFORE UPDATE OF deleted_at ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.block_delete_started_trip();

-- 2. No leaving (or removing someone from) a started trip.
CREATE OR REPLACE FUNCTION public.block_leave_started_trip()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  t public.trips;
BEGIN
  IF (OLD.user_id IS NOT NULL AND NEW.user_id IS NULL)
     OR (OLD.claimed_user_id IS NOT NULL AND NEW.claimed_user_id IS NULL) THEN
    SELECT * INTO t FROM public.trips WHERE id = OLD.trip_id;
    IF FOUND AND NOT coalesce(t.test_mode, false) AND public.trip_has_started(t) THEN
      RAISE EXCEPTION 'This trip has started, so nobody can leave it.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trip_players_block_leave_started ON public.trip_players;
CREATE TRIGGER trip_players_block_leave_started
  BEFORE UPDATE OF user_id, claimed_user_id ON public.trip_players
  FOR EACH ROW EXECUTE FUNCTION public.block_leave_started_trip();
