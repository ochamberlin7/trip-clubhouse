-- =============================================================
-- Trip Clubhouse — (re)create the invite RPCs with a UUID token parameter.
--
-- trips.invite_token is UUID (20260614: uuid DEFAULT gen_random_uuid()), but the
-- helpers in 20260639 declared p_invite_token as TEXT and compared
-- `t.invite_token = p_invite_token` — a uuid = text mismatch with no implicit
-- cast, which fails when the SQL function body is validated at CREATE time. The
-- functions therefore never got created, so PostgREST returns 404
-- ("Could not find the function public.invite_guest_list(p_invite_token)").
--
-- Fix: drop the broken text-param versions (if any) and (re)create all three
-- invite helpers with p_invite_token UUID so the comparison type-checks. All are
-- SECURITY DEFINER (bypass RLS) and gated on the invite token — the invite secret
-- shared only via the /join/:token link — so a not-yet-member invitee can read the
-- full guest list (for email/phone/name matching), look up the commissioner, and
-- claim their slot even when it has no email/phone (name-only players).
--
-- Idempotent. Run in Supabase SQL Editor (project mjssollqfngbeetwnxml).
-- =============================================================

DROP FUNCTION IF EXISTS public.invite_guest_list(text);
DROP FUNCTION IF EXISTS public.invite_commissioner(text);
DROP FUNCTION IF EXISTS public.claim_invite_slot(text, uuid);

-- Full guest list for the trip matching the invite token (email / phone / name
-- matching in JoinTrip). Bypasses RLS, so name-only slots (no email, no phone)
-- are included.
CREATE OR REPLACE FUNCTION public.invite_guest_list(p_invite_token uuid)
RETURNS TABLE (
  id uuid,
  first_name text,
  last_name text,
  email text,
  phone text,
  guest_name text,
  is_claimed boolean,
  user_id uuid,
  claimed_user_id uuid,
  trip_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tp.id, tp.first_name, tp.last_name, tp.email, tp.phone,
         tp.guest_name, tp.is_claimed, tp.user_id, tp.claimed_user_id, tp.trip_id
  FROM public.trip_players tp
  JOIN public.trips t ON t.id = tp.trip_id
  WHERE p_invite_token IS NOT NULL AND t.invite_token = p_invite_token;
$$;
GRANT EXECUTE ON FUNCTION public.invite_guest_list(uuid) TO authenticated;

-- The trip's commissioner (group admin) name + email, for the "couldn't find you"
-- screen. SECURITY DEFINER so a non-member can read it and join auth.users.
CREATE OR REPLACE FUNCTION public.invite_commissioner(p_invite_token uuid)
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
GRANT EXECUTE ON FUNCTION public.invite_commissioner(uuid) TO authenticated;

-- Claim an unclaimed guest slot (by id), verified against the invite token's trip,
-- setting the caller as the owner. Lets phone / name-matched users (whose email
-- isn't the slot's email, or who have no email/phone at all) claim their slot.
-- Returns the trip's group_id.
CREATE OR REPLACE FUNCTION public.claim_invite_slot(p_invite_token uuid, p_slot_id uuid)
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
GRANT EXECUTE ON FUNCTION public.claim_invite_slot(uuid, uuid) TO authenticated;
