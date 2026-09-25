-- =============================================================
-- Trip Clubhouse — per-trip unread trash-talk counts for the current user.
-- Powers the cross-trip unread red-dot cascade (Menu icon → Trips row → each
-- trip) and the OS badge total.
--
-- SECURITY INVOKER (runs as the caller), so RLS does the scoping for us: the
-- messages read policy limits `m` to the caller's own trips, and chat_reads RLS
-- limits `cr` to the caller's own read rows. Returns one row per trip that has
-- messages from someone else newer than the caller's last_read_at (COALESCE to
-- the epoch when they've never opened that trip's chat).
-- Run in Supabase SQL Editor.
-- =============================================================

CREATE OR REPLACE FUNCTION public.unread_chat_by_trip()
RETURNS TABLE (trip_id uuid, unread bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT m.trip_id, count(*) AS unread
  FROM public.messages m
  LEFT JOIN public.chat_reads cr
    ON cr.trip_id = m.trip_id AND cr.user_id = auth.uid()
  WHERE m.user_id <> auth.uid()
    AND m.created_at > COALESCE(cr.last_read_at, to_timestamp(0))
  GROUP BY m.trip_id;
$$;

GRANT EXECUTE ON FUNCTION public.unread_chat_by_trip() TO authenticated;
