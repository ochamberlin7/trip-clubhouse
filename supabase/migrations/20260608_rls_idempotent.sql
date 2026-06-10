-- =============================================================
-- Trip Clubhouse – Row Level Security Policies (IDEMPOTENT)
-- Safe to run multiple times. Run this in the Supabase SQL editor.
-- =============================================================

-- Helper functions (SECURITY DEFINER bypasses RLS on group_members
-- to avoid infinite recursion in policies that join back to it).

CREATE OR REPLACE FUNCTION public.is_group_member(gid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members WHERE group_id = gid AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_group_admin(gid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members WHERE group_id = gid AND user_id = auth.uid() AND role = 'admin'
  );
$$;

-- =====================
-- groups
-- =====================
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "groups_insert" ON groups;
DROP POLICY IF EXISTS "groups_select" ON groups;
DROP POLICY IF EXISTS "groups_update" ON groups;

-- Authenticated users can create a group; created_by must be their own uid.
CREATE POLICY "groups_insert" ON groups
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- Members can read groups they belong to.
-- The OR clause covers the window between INSERT and the group_members row
-- being written — without it .insert().select().single() returns null and
-- the JS code throws a TypeError.
CREATE POLICY "groups_select" ON groups
  FOR SELECT TO authenticated
  USING (is_group_member(id) OR auth.uid() = created_by);

-- Only admins can rename/update a group.
CREATE POLICY "groups_update" ON groups
  FOR UPDATE TO authenticated
  USING (is_group_admin(id));

-- =====================
-- group_members
-- =====================
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "group_members_insert" ON group_members;
DROP POLICY IF EXISTS "group_members_select" ON group_members;
DROP POLICY IF EXISTS "group_members_delete" ON group_members;

-- Users can only add themselves (create-group and invite-accept flows).
CREATE POLICY "group_members_insert" ON group_members
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Members can see all members of any group they belong to.
CREATE POLICY "group_members_select" ON group_members
  FOR SELECT TO authenticated
  USING (is_group_member(group_id));

-- Users can leave; admins can remove anyone.
CREATE POLICY "group_members_delete" ON group_members
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR is_group_admin(group_id));

-- =====================
-- trips
-- =====================
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trips_select" ON trips;
DROP POLICY IF EXISTS "trips_insert" ON trips;
DROP POLICY IF EXISTS "trips_update" ON trips;

CREATE POLICY "trips_select" ON trips
  FOR SELECT TO authenticated
  USING (is_group_member(group_id));

CREATE POLICY "trips_insert" ON trips
  FOR INSERT TO authenticated
  WITH CHECK (is_group_admin(group_id));

CREATE POLICY "trips_update" ON trips
  FOR UPDATE TO authenticated
  USING (is_group_admin(group_id));

-- =====================
-- rounds
-- =====================
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rounds_select" ON rounds;
DROP POLICY IF EXISTS "rounds_insert" ON rounds;
DROP POLICY IF EXISTS "rounds_update" ON rounds;

CREATE POLICY "rounds_select" ON rounds
  FOR SELECT TO authenticated
  USING (
    trip_id IN (SELECT id FROM trips WHERE is_group_member(group_id))
  );

CREATE POLICY "rounds_insert" ON rounds
  FOR INSERT TO authenticated
  WITH CHECK (
    trip_id IN (SELECT id FROM trips WHERE is_group_admin(group_id))
  );

CREATE POLICY "rounds_update" ON rounds
  FOR UPDATE TO authenticated
  USING (
    trip_id IN (SELECT id FROM trips WHERE is_group_admin(group_id))
  );

-- =====================
-- trip_players
-- =====================
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

-- =====================
-- invitations
-- =====================
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invitations_select" ON invitations;
DROP POLICY IF EXISTS "invitations_insert" ON invitations;
DROP POLICY IF EXISTS "invitations_update" ON invitations;

-- Allow anon reads so the invite page works before the user signs up.
-- The token is a secret; JS filters to the matching row.
CREATE POLICY "invitations_select" ON invitations
  FOR SELECT TO authenticated, anon
  USING (status = 'pending');

-- Only group admins can generate invite links.
CREATE POLICY "invitations_insert" ON invitations
  FOR INSERT TO authenticated
  WITH CHECK (is_group_admin(group_id));

-- Any authenticated user can accept (flip status to accepted).
CREATE POLICY "invitations_update" ON invitations
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (status = 'accepted');

-- =====================
-- profiles
-- =====================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;
DROP POLICY IF EXISTS "profiles_insert" ON profiles;

-- All authenticated users can read profiles (needed for display_name joins).
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO authenticated
  USING (true);

-- Users can only write their own profile.
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id);

-- Allow insert so the signup trigger can create a profile row.
CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);
