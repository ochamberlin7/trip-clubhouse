-- 20260681_multiple_trips_per_group.sql
-- Let a group hold more than one trip (Owen, 2026-11-05).
--
-- Production has a rule that isn't in any migration file: "one_active_trip_per_group"
-- (from the original design, where a group had one active trip at a time). Every
-- trip is created with status 'active', so it blocks a second trip in a group —
-- found when moving CTI Washington 2027 into CTI Michigan's group failed with
-- "duplicate key value violates unique constraint one_active_trip_per_group".
-- Groups are now the tradition and hold many trips (migration 20260680, the
-- wizard's group dropdown), so the rule goes. Nothing in the app relies on it.
--
-- Drops it whether it was made as a table constraint or as a unique index.
-- Idempotent: safe to run twice. Run in the Supabase SQL editor.

-- For the record: what the rule was (shows nothing once it's gone).
SELECT 'index' AS kind, indexdef AS definition FROM pg_indexes WHERE indexname = 'one_active_trip_per_group'
UNION ALL
SELECT 'constraint', pg_get_constraintdef(c.oid) FROM pg_constraint c WHERE c.conname = 'one_active_trip_per_group';

ALTER TABLE public.trips DROP CONSTRAINT IF EXISTS one_active_trip_per_group;
DROP INDEX IF EXISTS public.one_active_trip_per_group;

-- Check: should return no rows.
SELECT indexname FROM pg_indexes WHERE indexname = 'one_active_trip_per_group'
UNION ALL
SELECT conname FROM pg_constraint WHERE conname = 'one_active_trip_per_group';
