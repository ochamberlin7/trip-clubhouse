-- =============================================================
-- Trip Clubhouse — diagnostic helper for the invite-token RLS approach.
--
-- Returns the current value of the `app.invite_token` session setting. JoinTrip
-- calls this right after set_config to verify the setting actually persisted into
-- a subsequent request/transaction. If it comes back null/empty, set_config is
-- not persisting (PostgREST runs each request in its own transaction, typically
-- on a different pooled connection), which is why the trip_players invite-token
-- RLS clause never matches for name-only players.
--
-- SECURITY DEFINER so it reads the same session GUC regardless of the caller's
-- role. current_setting(..., true) = missing_ok, so it never raises.
--
-- Idempotent. Run in Supabase SQL Editor (project mjssollqfngbeetwnxml).
-- =============================================================

CREATE OR REPLACE FUNCTION public.get_invite_token_setting()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT current_setting('app.invite_token', true);
$$;

GRANT EXECUTE ON FUNCTION public.get_invite_token_setting() TO authenticated;
