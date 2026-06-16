-- =============================================================
-- Trip Clubhouse — enable RLS on tables flagged by rls_disabled_in_public.
--
-- Ground truth: this environment can't run the pg_tables query, so the live DB
-- was probed with the public anon key. Findings:
--   • teams        — anon could read all 8 rows though only `authenticated`
--                    policies exist → RLS was OFF in the live DB (even though it
--                    was enabled back in 20260610). Re-enabled here.
--   • course_holes — no RLS enable and no policies in ANY migration → the alert
--                    culprit; exposed to every authenticated user. Fixed here.
--   • invitations  — left untouched: it already has working policies including a
--                    deliberate anon read of pending invites; verify separately
--                    with pg_tables and enable RLS if rowsecurity = false.
--
-- "Commissioner" = group admin (group_members.role = 'admin'); there is NO
-- trip_players.role column in this schema, so writes are gated via is_group_admin.
-- Idempotent: safe to re-run (re-enables RLS, DROP POLICY IF EXISTS before each
-- CREATE). Run in the Supabase SQL Editor.
-- =============================================================

-- ── course_holes ──────────────────────────────────────────────────
-- Trip members can read their rounds' holes; only the commissioner (group
-- admin) can modify them. Join path: course_holes.round_id → rounds.trip_id →
-- trip_players.trip_id WHERE trip_players.user_id = auth.uid().
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_holes TO authenticated;
ALTER TABLE public.course_holes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "course_holes_select" ON public.course_holes;
CREATE POLICY "course_holes_select" ON public.course_holes
  FOR SELECT TO authenticated
  USING (round_id IN (
    SELECT r.id FROM rounds r JOIN trip_players tp ON tp.trip_id = r.trip_id
    WHERE tp.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "course_holes_manage" ON public.course_holes;
CREATE POLICY "course_holes_manage" ON public.course_holes
  FOR ALL TO authenticated
  USING (round_id IN (
    SELECT r.id FROM rounds r WHERE r.trip_id IN (SELECT id FROM trips WHERE is_group_admin(group_id))
  ))
  WITH CHECK (round_id IN (
    SELECT r.id FROM rounds r WHERE r.trip_id IN (SELECT id FROM trips WHERE is_group_admin(group_id))
  ));

-- ── teams ─────────────────────────────────────────────────────────
-- Re-enable RLS and re-declare the canonical policies (members read;
-- commissioner/group-admin writes) so turning RLS back on can never lock anyone
-- out. Matches the policies originally defined in 20260610_wizard_schema.sql.
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teams_select" ON public.teams;
CREATE POLICY "teams_select" ON public.teams
  FOR SELECT TO authenticated
  USING (trip_id IN (SELECT id FROM trips WHERE is_group_member(group_id)));

DROP POLICY IF EXISTS "teams_insert" ON public.teams;
CREATE POLICY "teams_insert" ON public.teams
  FOR INSERT TO authenticated
  WITH CHECK (trip_id IN (SELECT id FROM trips WHERE is_group_admin(group_id)));

DROP POLICY IF EXISTS "teams_update" ON public.teams;
CREATE POLICY "teams_update" ON public.teams
  FOR UPDATE TO authenticated
  USING (trip_id IN (SELECT id FROM trips WHERE is_group_admin(group_id)));

DROP POLICY IF EXISTS "teams_delete" ON public.teams;
CREATE POLICY "teams_delete" ON public.teams
  FOR DELETE TO authenticated
  USING (trip_id IN (SELECT id FROM trips WHERE is_group_admin(group_id)));
