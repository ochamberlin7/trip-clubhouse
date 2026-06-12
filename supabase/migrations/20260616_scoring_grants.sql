-- =============================================================
-- Trip Clubhouse — table privileges for the scoring tables.
--
-- "permission denied for table pairings" means the authenticated role was
-- never granted base access to these tables (raw-SQL-created tables don't get
-- Supabase's automatic grants). RLS policies only apply AFTER the role has the
-- table-level privilege. Run in Supabase SQL Editor.
-- =============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pairings        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pairing_players TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drinks          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scores          TO authenticated;
