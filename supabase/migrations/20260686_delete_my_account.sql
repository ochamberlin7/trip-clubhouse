-- =============================================================
-- Trip Clubhouse: a signed-in user can delete their own account.
--
-- What goes:
--   • The login itself (auth.users), so the email can't sign in any more.
--   • Their profile (name, phone, photo link), group memberships, commissioner
--     rows, push subscriptions, chat read markers and their own chat messages.
--   • On trips that HAVEN'T STARTED: their spot becomes an empty "Player TBD"
--     (exactly what Leave trip does) and their flight details are blanked.
--
-- What stays (it is the group's history, not just theirs):
--   • On trips that HAVE STARTED or are over: the spot keeps the player's name,
--     handicap, team and every score, drink and pairing, so standings, match
--     results and everyone else's stats don't change. Only the account link,
--     email and phone are removed from the spot.
--   • Past-trip records keep the name (past_trip_players.user_id is SET NULL).
--
-- Blocked (nothing is deleted) when the user is the ONLY commissioner of a trip
-- that isn't over yet: they hand it off first (Make commissioner) or delete it.
--
-- Safety: before the auth row goes, every foreign key that points at
-- auth.users or public.profiles is checked. Rows in the tables listed in
-- `personal` are deleted; any other referencing column is set to NULL so a
-- cascade can never take group data (trips, groups, scores, rounds) with it.
-- If such a column is NOT NULL the function stops and names it, and the whole
-- transaction rolls back, so nothing is half-deleted.
--
-- The profile photo files live in Storage; the app removes them through the
-- Storage API just before calling this (Supabase blocks deleting storage
-- objects with SQL).
--
-- Idempotent. Run in the Supabase SQL editor.
-- =============================================================

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  blocking_trip text;
  personal text[] := ARRAY[
    'public.profiles', 'public.group_members', 'public.trip_commissioners',
    'public.push_subscriptions', 'public.chat_reads', 'public.messages'
  ];
  fk record;
  hit boolean;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  -- 1. Sole commissioner of a trip that isn't over → stop.
  SELECT t.name INTO blocking_trip
  FROM trip_commissioners tc
  JOIN trips t ON t.id = tc.trip_id
  WHERE tc.user_id = me
    AND (t.end_date IS NULL OR t.end_date >= current_date)
    AND NOT EXISTS (
      SELECT 1 FROM trip_commissioners o WHERE o.trip_id = tc.trip_id AND o.user_id <> me
    )
  LIMIT 1;
  IF blocking_trip IS NOT NULL THEN
    RAISE EXCEPTION 'SOLE_COMMISSIONER:%', blocking_trip USING ERRCODE = 'P0001';
  END IF;

  -- 2. Trips that haven't started: blank the flight, turn the spot into Player TBD.
  UPDATE flights f SET
    is_driving = false,
    arrive_date = NULL, arrive_time = NULL, arrive_airport = NULL, flight_number_in = NULL,
    depart_date = NULL, depart_time = NULL, depart_airport = NULL, flight_number_out = NULL
  FROM trip_players tp JOIN trips t ON t.id = tp.trip_id
  WHERE f.trip_player_id = tp.id
    AND (tp.user_id = me OR tp.claimed_user_id = me)
    AND t.start_date > current_date;

  UPDATE trip_players tp SET
    first_name = NULL, last_name = NULL, guest_name = NULL, team_id = NULL,
    handicap_index = NULL, email = NULL, phone = NULL,
    user_id = NULL, claimed_user_id = NULL, is_claimed = false, is_captain = false,
    onboarding_completed = false, getting_started_opted_out = false, manual_drinks = 0
  FROM trips t
  WHERE t.id = tp.trip_id
    AND (tp.user_id = me OR tp.claimed_user_id = me)
    AND t.start_date > current_date;

  -- 3. Trips that have started or are over: keep name, handicap, team and scores;
  --    drop only the account link and contact details. is_claimed stays as it
  --    was so nobody else can claim the spot through an invite link.
  UPDATE trip_players SET user_id = NULL, claimed_user_id = NULL, email = NULL, phone = NULL
  WHERE user_id = me OR claimed_user_id = me;

  -- 4. Every other reference to this user: personal rows go, the rest unlink.
  FOR fk IN
    SELECT n.nspname || '.' || cl.relname AS tbl,
           a.attname AS col,
           a.attnotnull AS notnull
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND array_length(c.conkey, 1) = 1
      AND c.confrelid IN ('auth.users'::regclass, 'public.profiles'::regclass)
      AND c.connamespace = 'public'::regnamespace
  LOOP
    IF fk.tbl = ANY (personal) THEN
      EXECUTE format('DELETE FROM %s WHERE %I = $1', fk.tbl::regclass, fk.col) USING me;
    ELSIF fk.notnull THEN
      -- Would cascade or block: refuse rather than lose group data.
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE %I = $1)', fk.tbl::regclass, fk.col)
        INTO hit USING me;
      IF hit THEN
        RAISE EXCEPTION 'ACCOUNT_IN_USE:%.%', fk.tbl, fk.col;
      END IF;
    ELSE
      EXECUTE format('UPDATE %s SET %I = NULL WHERE %I = $1', fk.tbl::regclass, fk.col, fk.col) USING me;
    END IF;
  END LOOP;

  -- 5. The profile row itself (in case profiles.id has no FK to auth.users).
  DELETE FROM profiles WHERE id = me;

  -- 6. The login. Sessions and identities go with it (auth schema cascades).
  DELETE FROM auth.users WHERE id = me;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

NOTIFY pgrst, 'reload schema';
