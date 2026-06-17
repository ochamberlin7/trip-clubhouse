-- =============================================================
-- Trip Clubhouse — let an invitee self-join + always read their own memberships.
--
-- After claiming a guest slot, JoinTrip inserts the user's own group_members row
-- (role 'member'). If the live INSERT policy is admin-only (or diverged from the
-- migration), that insert fails silently → the user is never a real member, so:
--   • the dashboard can't read the invited trip (is_group_member false) → blank,
--   • a later direct login finds no membership → onboarding wizard.
--
-- Re-declare (idempotent) so the live DB matches intent:
--   • INSERT: a user may insert their OWN membership (auth.uid() = user_id).
--   • SELECT: a user can ALWAYS see their own rows (user_id = auth.uid()), plus
--     rows of any group they belong to — so group-loading reliably finds them.
-- Run in Supabase SQL Editor.
-- =============================================================

DROP POLICY IF EXISTS "group_members_insert" ON public.group_members;
CREATE POLICY "group_members_insert" ON public.group_members
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "group_members_select" ON public.group_members;
CREATE POLICY "group_members_select" ON public.group_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_group_member(group_id));
