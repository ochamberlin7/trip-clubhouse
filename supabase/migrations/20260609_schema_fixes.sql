-- =============================================================
-- Trip Clubhouse — Schema fixes + guest player support
-- IDEMPOTENT: safe to run multiple times
-- Run in Supabase SQL Editor
-- =============================================================

-- 1. Fix: invited_by was NOT NULL but the app inserts it conditionally.
--    Make it nullable so invite generation never hits a constraint error.
ALTER TABLE invitations ALTER COLUMN invited_by DROP NOT NULL;

-- 2. Guest player support: allow adding players by name without requiring
--    them to have a Supabase account yet. Admins add them during trip setup;
--    accounts can be linked later when players accept invitations.
ALTER TABLE trip_players ADD COLUMN IF NOT EXISTS guest_name TEXT;

-- Allow null user_id for guest players (they have no account yet).
-- Existing rows already have a user_id so this is a safe change.
ALTER TABLE trip_players ALTER COLUMN user_id DROP NOT NULL;

-- Ensure the RLS policies are still correct after the schema change.
-- (These are the same policies from 20260608_rls_idempotent.sql but
--  repeated here so this file is self-contained for the changed tables.)

-- ── invitations ──────────────────────────────────────────────
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invitations_select" ON invitations;
DROP POLICY IF EXISTS "invitations_insert" ON invitations;
DROP POLICY IF EXISTS "invitations_update" ON invitations;

CREATE POLICY "invitations_select" ON invitations
  FOR SELECT TO authenticated, anon
  USING (status = 'pending');

CREATE POLICY "invitations_insert" ON invitations
  FOR INSERT TO authenticated
  WITH CHECK (is_group_admin(group_id));

CREATE POLICY "invitations_update" ON invitations
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (status = 'accepted');

-- ── trip_players ─────────────────────────────────────────────
ALTER TABLE trip_players ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trip_players_select" ON trip_players;
DROP POLICY IF EXISTS "trip_players_insert" ON trip_players;
DROP POLICY IF EXISTS "trip_players_delete" ON trip_players;

CREATE POLICY "trip_players_select" ON trip_players
  FOR SELECT TO authenticated
  USING (
    trip_id IN (SELECT id FROM trips WHERE is_group_member(group_id))
  );

CREATE POLICY "trip_players_insert" ON trip_players
  FOR INSERT TO authenticated
  WITH CHECK (
    trip_id IN (SELECT id FROM trips WHERE is_group_admin(group_id))
  );

CREATE POLICY "trip_players_delete" ON trip_players
  FOR DELETE TO authenticated
  USING (
    trip_id IN (SELECT id FROM trips WHERE is_group_admin(group_id))
  );
