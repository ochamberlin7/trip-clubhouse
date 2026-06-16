-- =============================================================
-- Trip Clubhouse — persist the day-by-day schedule on the trip.
-- The onboarding wizard records a type per day (golf / non_golf / travel /
-- unknown), but only golf days created rounds, so non-golf day types were lost.
-- Store the full schedule so the Courses page can show every day in the trip
-- range with the right placeholder (Travel Day / Non-Golf Day / Not Scheduled
-- Yet). Shape: [{ "date": "YYYY-MM-DD", "type": "golf|non_golf|travel|unknown" }].
-- Run in Supabase SQL Editor.
-- =============================================================

ALTER TABLE trips ADD COLUMN IF NOT EXISTS schedule jsonb;
