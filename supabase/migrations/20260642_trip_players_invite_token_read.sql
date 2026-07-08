-- =============================================================
-- Trip Clubhouse — let an invitee read a trip's guest list via the invite TOKEN,
-- so a name-only player (no email, no phone) can still be found for fuzzy name
-- matching in JoinTrip. Chicken-and-egg fix: previously reading the row required
-- an email/phone match, but name matching needs to read the row first.
--
-- Mechanism: JoinTrip sets `app.invite_token` for the request, then the
-- trip_players SELECT policy gains a 5th clause that exposes every slot of the
-- trip whose invite_token matches that setting. The token is a secret shared only
-- via the invite link, so this is safe.
--
-- 1. public.set_config — a thin, callable-via-PostgREST wrapper around
--    pg_catalog.set_config (which isn't exposed by default). Restricted to
--    app.* settings so it can't be used to change arbitrary GUCs.
-- 2. trip_players_select — re-declared (idempotent) with the invite-token clause
--    added alongside the existing membership / claimed / email / phone clauses.
--
-- Additive + idempotent. Run in Supabase SQL Editor (project mjssollqfngbeetwnxml).
-- =============================================================

CREATE OR REPLACE FUNCTION public.set_config(parameter text, value text, is_local boolean)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only allow application settings (never role, search_path, timeouts, etc.).
  IF parameter IS NULL OR parameter !~ '^app\.' THEN
    RAISE EXCEPTION 'set_config: only app.* settings may be configured';
  END IF;
  RETURN pg_catalog.set_config(parameter, value, is_local);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_config(text, text, boolean) TO authenticated;

DROP POLICY IF EXISTS "trip_players_select" ON public.trip_players;
CREATE POLICY "trip_players_select" ON public.trip_players
  FOR SELECT TO authenticated
  USING (
    trip_id IN (SELECT id FROM trips WHERE is_group_member(group_id))
    OR claimed_user_id = auth.uid()
    OR lower(trim(email)) = lower(trim(auth.jwt() ->> 'email'))
    OR nullif(regexp_replace(phone, '[^0-9]', '', 'g'), '')
       = nullif(regexp_replace(
           coalesce(nullif(auth.jwt() ->> 'phone', ''), auth.jwt() -> 'user_metadata' ->> 'phone'),
           '[^0-9]', '', 'g'), '')
    OR trip_id IN (
         SELECT id FROM trips
         WHERE invite_token = nullif(current_setting('app.invite_token', true), '')
       )
  );
