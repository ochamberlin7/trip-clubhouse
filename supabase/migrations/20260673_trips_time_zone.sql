-- =============================================================
-- Trip Clubhouse — trip-local time zone.
--
-- UNAPPLIED / PROPOSAL. Do NOT run against production until the app is wired to
-- read + write this column (a later branch). Nothing uses it yet; until then
-- callers pass the phone's zone to getTripPhase and behaviour is unchanged.
--
-- WHY: the app stores no time zone, so "today"/"now" comes from the phone. A viewer
-- in Phoenix looking at a Michigan trip reads the wrong day for the first 3 hours
-- after Eastern midnight. getTripPhase() takes an explicit IANA zone; this column is
-- where that zone will live.
--
-- FORMAT: an IANA zone name such as 'America/Detroit' (NOT an offset — offsets break
-- across DST). NULL means "unknown" → callers keep using the phone's zone.
--
-- DEFAULTING (app-side, at trip creation — NOT a SQL default): derive from the first
-- course's stored coordinates (rounds.location_lat / location_lon) via a lat/lon → IANA
-- lookup, falling back to the creator's device zone, then NULL.
--
-- BACKFILL for the CTI Michigan trip: its courses are in Michigan (Eastern), so:
--     UPDATE trips SET time_zone = 'America/Detroit' WHERE time_zone IS NULL
--       AND id = '<CTI trip id>';
-- (Left commented — fill in the trip id and run deliberately once the app reads it.)
-- =============================================================

ALTER TABLE trips ADD COLUMN IF NOT EXISTS time_zone text;

COMMENT ON COLUMN trips.time_zone IS
  'IANA time zone name (e.g. America/Detroit) for the trip''s locale. NULL = unknown; callers fall back to the device zone.';

-- Backfill, deliberately commented out — run only after the app reads this column:
-- UPDATE trips SET time_zone = 'America/Detroit'
--   WHERE time_zone IS NULL AND id = '<CTI trip id>';
