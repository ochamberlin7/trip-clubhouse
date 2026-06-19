-- =============================================================
-- Trip Clubhouse — invite matching by phone + fuzzy name, and a
-- commissioner-contact lookup for the "couldn't find you" screen.
--
-- 1. profiles.phone — stored alongside display_name from signup.
-- 2. Three SECURITY DEFINER helpers, each gated on the trip's invite_token
--    (the invite secret). They exist because RLS otherwise limits a NOT-yet-member
--    invitee to their OWN email-matching trip_players row — so they could neither
--    read the full guest list (needed for phone / fuzzy-name matching) nor claim a
--    slot whose email isn't theirs. Existing RLS policies are left untouched.
--
-- Idempotent. Run in Supabase SQL Editor (project mjssollqfngbeetwnxml).
-- =============================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;

-- Full guest list for a trip, for invite matching (email / phone / name).
CREATE OR REPLACE FUNCTION public.invite_guest_list(p_invite_token text)
RETURNS TABLE (
  id uuid, email text, phone text, first_name text, last_name text,
  guest_name text, is_claimed boolean, claimed_user_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tp.id, tp.email, tp.phone, tp.first_name, tp.last_name,
         tp.guest_name, tp.is_claimed, tp.claimed_user_id
  FROM public.trip_players tp
  JOIN public.trips t ON t.id = tp.trip_id
  WHERE p_invite_token IS NOT NULL AND t.invite_token = p_invite_token;
$$;
GRANT EXECUTE ON FUNCTION public.invite_guest_list(text) TO authenticated;

-- Claim an unclaimed guest slot (by id) verified against the invite_token's trip,
-- setting the caller as the owner. Lets phone / name-matched users (whose email
-- isn't the slot's email) claim. Returns the trip's group_id.
CREATE OR REPLACE FUNCTION public.claim_invite_slot(p_invite_token text, p_slot_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip_id uuid;
  v_group_id uuid;
  v_claimed boolean;
  v_owner uuid;
BEGIN
  SELECT t.id, t.group_id INTO v_trip_id, v_group_id
  FROM public.trips t WHERE t.invite_token = p_invite_token;
  IF v_trip_id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite token';
  END IF;

  SELECT tp.is_claimed, tp.claimed_user_id INTO v_claimed, v_owner
  FROM public.trip_players tp WHERE tp.id = p_slot_id AND tp.trip_id = v_trip_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guest slot not found for this trip';
  END IF;
  IF v_claimed AND v_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'That guest slot has already been claimed';
  END IF;

  UPDATE public.trip_players
    SET is_claimed = true, claimed_user_id = auth.uid(), user_id = auth.uid()
    WHERE id = p_slot_id;
  RETURN v_group_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_invite_slot(text, uuid) TO authenticated;

-- The trip's commissioner (group admin) name + email, for the "couldn't find you"
-- screen. SECURITY DEFINER so a non-member can read it and it can join auth.users.
CREATE OR REPLACE FUNCTION public.invite_commissioner(p_invite_token text)
RETURNS TABLE (display_name text, email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pr.display_name, au.email
  FROM public.trips t
  JOIN public.group_members gm ON gm.group_id = t.group_id AND gm.role = 'admin'
  LEFT JOIN public.profiles pr ON pr.id = gm.user_id
  LEFT JOIN auth.users au ON au.id = gm.user_id
  WHERE t.invite_token = p_invite_token
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.invite_commissioner(text) TO authenticated;
