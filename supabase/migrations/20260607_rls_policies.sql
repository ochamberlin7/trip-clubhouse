-- =============================================================
-- Trip Clubhouse – Row Level Security Policies
-- Run this in the Supabase SQL editor (project mjssollqfngbeetwnxml)
-- =============================================================

-- Helper functions (SECURITY DEFINER so they bypass RLS on
-- group_members itself, preventing infinite-recursion in policies
-- that join back to group_members to check membership).

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

-- Authenticated users can create a group; they must set created_by to their own uid.
CREATE POLICY "groups_insert" ON groups
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- Members can read groups they belong to.
-- created_by clause also covers the window between INSERT and the first
-- group_members row being written — without it, .insert().select() returns
-- null (SELECT policy blocks the read-back), causing an uncaught TypeError.
CREATE POLICY "groups_select" ON groups
  FOR SELECT TO authenticated
  USING (is_group_member(id) OR auth.uid() = created_by);

-- Only admins can rename / update a group.
CREATE POLICY "groups_update" ON groups
  FOR UPDATE TO authenticated
  USING (is_group_admin(id));

-- =====================
-- group_members
-- =====================
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

-- Users can add themselves (create-group flow sets role='admin',
-- invite-accept flow sets role='player').
CREATE POLICY "group_members_insert" ON group_members
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Members can see all members in any group they belong to.
CREATE POLICY "group_members_select" ON group_members
  FOR SELECT TO authenticated
  USING (is_group_member(group_id));

-- Users can leave a group; admins can remove anyone.
CREATE POLICY "group_members_delete" ON group_members
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR is_group_admin(group_id));

-- =====================
-- trips
-- =====================
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trips_select" ON trips
  FOR SELECT TO authenticated
  USING (is_group_member(group_id));

-- Only group admins can create or modify trips.
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

-- The invite page reads invitations before the user is logged in (they may
-- need to sign up first), so allow anon reads of pending invitations.
-- The token itself is a secret; Supabase filters to the matching token in JS.
CREATE POLICY "invitations_select" ON invitations
  FOR SELECT TO authenticated, anon
  USING (status = 'pending');

-- Only group admins can send invites.
CREATE POLICY "invitations_insert" ON invitations
  FOR INSERT TO authenticated
  WITH CHECK (is_group_admin(group_id));

-- Any authenticated user can accept an invitation (mark as accepted).
CREATE POLICY "invitations_update" ON invitations
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (status = 'accepted');

-- =====================
-- profiles
-- =====================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read profiles (needed for trip_players join
-- that shows display names on the dashboard).
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO authenticated
  USING (true);

-- Users can only update their own profile.
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id);
