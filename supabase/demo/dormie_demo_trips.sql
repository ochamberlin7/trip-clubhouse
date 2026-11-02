-- =============================================================
-- DEMO ONLY (not a numbered migration). Creates two Dormie Network demo trips
-- for o.chamberlin@gmail.com in a group called "The Dormie Crew":
--   • Briggs Ranch Weekend   — Dec 4–6, 2026 (2 nights), San Antonio TX
--   • Ballyhack Spring Trip  — Apr 23–25, 2027 (2 nights), Roanoke VA
-- Each has real course scorecards (from the golf-course API), 4 rounds with
-- tee times, 8 players on 2 teams with pairings, a cottage stay and meals,
-- and is linked to the Dormie Network resort (branded).
--
-- Run AFTER 20260680_resorts.sql. Safe to re-run: a trip that already exists
-- (same name, in your groups, not deleted) is skipped.
-- To remove: soft-delete them from the app, or
--   UPDATE trips SET deleted_at = now() WHERE name IN ('Briggs Ranch Weekend','Ballyhack Spring Trip');
-- =============================================================

DO $demo$
DECLARE
  v_uid    uuid;
  v_email  text;
  v_first  text;
  v_last   text;
  v_resort uuid;
  v_group  uuid;
  v_trip   uuid;
  v_t1     uuid;
  v_t2     uuid;
  v_round  uuid;
  v_pair   uuid;
  v_p      uuid[];
  v_tmp    uuid;
BEGIN
  SELECT id, email INTO v_uid, v_email FROM auth.users WHERE lower(email) = 'o.chamberlin@gmail.com';
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No account for o.chamberlin@gmail.com'; END IF;

  SELECT id INTO v_resort FROM public.resorts WHERE slug = 'dormie-network';
  IF v_resort IS NULL THEN RAISE EXCEPTION 'Run 20260680_resorts.sql first (Dormie Network resort missing)'; END IF;

  -- Owen's name for his player card, from his profile.
  SELECT split_part(coalesce(nullif(trim(display_name), ''), 'Owen Chamberlin'), ' ', 1),
         nullif(trim(substr(coalesce(nullif(trim(display_name), ''), 'Owen Chamberlin'),
                strpos(coalesce(nullif(trim(display_name), ''), 'Owen Chamberlin') || ' ', ' ') + 1)), '')
    INTO v_first, v_last
    FROM public.profiles WHERE id = v_uid;
  v_first := coalesce(v_first, 'Owen');
  v_last  := coalesce(v_last, 'Chamberlin');

  -- One group for both trips, with Owen as admin (= commissioner).
  SELECT g.id INTO v_group FROM public.groups g
    JOIN public.group_members m ON m.group_id = g.id AND m.user_id = v_uid AND m.role = 'admin'
   WHERE g.name = 'The Dormie Crew' LIMIT 1;
  IF v_group IS NULL THEN
    INSERT INTO public.groups (name, created_by) VALUES ('The Dormie Crew', v_uid) RETURNING id INTO v_group;
    INSERT INTO public.group_members (group_id, user_id, role) VALUES (v_group, v_uid, 'admin');
  END IF;


  -- ───────────── Briggs Ranch Weekend ─────────────
  IF EXISTS (SELECT 1 FROM public.trips tr JOIN public.group_members m ON m.group_id = tr.group_id AND m.user_id = v_uid
              WHERE tr.name = 'Briggs Ranch Weekend' AND tr.deleted_at IS NULL) THEN
    RAISE NOTICE 'Skipping %: already exists', 'Briggs Ranch Weekend';
  ELSE
    INSERT INTO public.trips (group_id, name, format, team_mode, bonus_games, created_by, status,
                              start_date, end_date, time_zone, schedule, resort_id)
    VALUES (v_group, 'Briggs Ranch Weekend', 'standard_match_play', true, '[]'::jsonb, v_uid, 'active',
            '2026-12-04', '2026-12-06', 'America/Chicago', '[{"date": "2026-12-04", "type": "golf"}, {"date": "2026-12-05", "type": "golf"}, {"date": "2026-12-06", "type": "golf"}]'::jsonb, v_resort)
    RETURNING id INTO v_trip;

    INSERT INTO public.teams (trip_id, name, team_index, color_index) VALUES (v_trip, 'Longhorns', 1, 1) RETURNING id INTO v_t1;
    INSERT INTO public.teams (trip_id, name, team_index, color_index) VALUES (v_trip, 'Mustangs', 2, 2) RETURNING id INTO v_t2;

    v_p := ARRAY[]::uuid[];
    INSERT INTO public.trip_players (trip_id, user_id, claimed_user_id, is_claimed, first_name, last_name, email, handicap_index, team_id)
      VALUES (v_trip, v_uid, v_uid, true, v_first, v_last, v_email, 8.4, v_t1) RETURNING id INTO v_tmp;
    v_p := v_p || v_tmp;
    INSERT INTO public.trip_players (trip_id, user_id, is_claimed, first_name, last_name, guest_name, handicap_index, team_id)
      VALUES (v_trip, NULL, false, 'Jack', 'Morrison', 'Jack Morrison', 6.2, v_t1) RETURNING id INTO v_tmp;
    v_p := v_p || v_tmp;
    INSERT INTO public.trip_players (trip_id, user_id, is_claimed, first_name, last_name, guest_name, handicap_index, team_id)
      VALUES (v_trip, NULL, false, 'Tyler', 'Brooks', 'Tyler Brooks', 12.5, v_t1) RETURNING id INTO v_tmp;
    v_p := v_p || v_tmp;
    INSERT INTO public.trip_players (trip_id, user_id, is_claimed, first_name, last_name, guest_name, handicap_index, team_id)
      VALUES (v_trip, NULL, false, 'Ryan', 'Callahan', 'Ryan Callahan', 4.8, v_t1) RETURNING id INTO v_tmp;
    v_p := v_p || v_tmp;
    INSERT INTO public.trip_players (trip_id, user_id, is_claimed, first_name, last_name, guest_name, handicap_index, team_id)
      VALUES (v_trip, NULL, false, 'Matt', 'Sullivan', 'Matt Sullivan', 9.1, v_t2) RETURNING id INTO v_tmp;
    v_p := v_p || v_tmp;
    INSERT INTO public.trip_players (trip_id, user_id, is_claimed, first_name, last_name, guest_name, handicap_index, team_id)
      VALUES (v_trip, NULL, false, 'Chris', 'Delgado', 'Chris Delgado', 14.3, v_t2) RETURNING id INTO v_tmp;
    v_p := v_p || v_tmp;
    INSERT INTO public.trip_players (trip_id, user_id, is_claimed, first_name, last_name, guest_name, handicap_index, team_id)
      VALUES (v_trip, NULL, false, 'Ben', 'Hartley', 'Ben Hartley', 3.9, v_t2) RETURNING id INTO v_tmp;
    v_p := v_p || v_tmp;
    INSERT INTO public.trip_players (trip_id, user_id, is_claimed, first_name, last_name, guest_name, handicap_index, team_id)
      VALUES (v_trip, NULL, false, 'Drew', 'Patterson', 'Drew Patterson', 10.7, v_t2) RETURNING id INTO v_tmp;
    v_p := v_p || v_tmp;

    INSERT INTO public.rounds (trip_id, round_number, course_name, club_name, tee_name, course_rating, slope_rating,
                               holes, location_city, location_state, location_lat, location_lon, par_total, number_of_holes,
                               tees, round_type, date, status, tee_time_1, tee_time_2)
    VALUES (v_trip, 1, 'Briggs Ranch Golf Club', 'Briggs Ranch Golf Club', 'Black', 72.7, 131,
            '[{"par": 4, "yardage": 441, "handicap": 5}, {"par": 4, "yardage": 413, "handicap": 11}, {"par": 3, "yardage": 182, "handicap": 15}, {"par": 4, "yardage": 323, "handicap": 13}, {"par": 5, "yardage": 492, "handicap": 3}, {"par": 4, "yardage": 421, "handicap": 9}, {"par": 5, "yardage": 532, "handicap": 1}, {"par": 3, "yardage": 162, "handicap": 17}, {"par": 4, "yardage": 428, "handicap": 7}, {"par": 4, "yardage": 393, "handicap": 10}, {"par": 5, "yardage": 579, "handicap": 2}, {"par": 4, "yardage": 434, "handicap": 6}, {"par": 5, "yardage": 576, "handicap": 4}, {"par": 4, "yardage": 294, "handicap": 16}, {"par": 3, "yardage": 184, "handicap": 14}, {"par": 4, "yardage": 383, "handicap": 12}, {"par": 3, "yardage": 183, "handicap": 18}, {"par": 4, "yardage": 390, "handicap": 8}]'::jsonb, 'San Antonio', 'TX', 29.407543, -98.759908, 72, 18,
            '[{"name": "Red", "slope": 135, "rating": 74.7, "par": 72, "gender": "male"}, {"name": "Red (W)", "slope": 147, "rating": 81.9, "par": 72, "gender": "female"}, {"name": "Black", "slope": 131, "rating": 72.7, "par": 72, "gender": "male"}, {"name": "Black (W)", "slope": 142, "rating": 79.5, "par": 72, "gender": "female"}, {"name": "Black/White", "slope": 127, "rating": 71.3, "par": 72, "gender": "male"}, {"name": "Black/White (W)", "slope": 137, "rating": 77.8, "par": 72, "gender": "female"}, {"name": "White", "slope": 123, "rating": 70.1, "par": 72, "gender": "male"}, {"name": "White (W)", "slope": 134, "rating": 75.9, "par": 72, "gender": "female"}, {"name": "White/Blue", "slope": 118, "rating": 68.6, "par": 72, "gender": "male"}, {"name": "White/Blue (W)", "slope": 130, "rating": 73.8, "par": 72, "gender": "female"}, {"name": "Blue", "slope": 112, "rating": 67.2, "par": 72, "gender": "male"}, {"name": "Blue (W)", "slope": 127, "rating": 72, "par": 72, "gender": "female"}, {"name": "Green", "slope": 107, "rating": 63.8, "par": 72, "gender": "male"}, {"name": "Green (W)", "slope": 123, "rating": 69, "par": 72, "gender": "female"}]'::jsonb, 'tournament', '2026-12-04', 'upcoming', '1:00 PM', '1:15 PM')
    RETURNING id INTO v_round;
    INSERT INTO public.pairings (round_id, pairing_number, team1_id, team2_id) VALUES (v_round, 1, v_t1, v_t2) RETURNING id INTO v_pair;
    INSERT INTO public.pairing_players (pairing_id, trip_player_id, team_slot) VALUES
      (v_pair, v_p[1], 1), (v_pair, v_p[2], 2), (v_pair, v_p[5], 3), (v_pair, v_p[6], 4);
    INSERT INTO public.pairings (round_id, pairing_number, team1_id, team2_id) VALUES (v_round, 2, v_t1, v_t2) RETURNING id INTO v_pair;
    INSERT INTO public.pairing_players (pairing_id, trip_player_id, team_slot) VALUES
      (v_pair, v_p[3], 1), (v_pair, v_p[4], 2), (v_pair, v_p[7], 3), (v_pair, v_p[8], 4);

    INSERT INTO public.rounds (trip_id, round_number, course_name, club_name, tee_name, course_rating, slope_rating,
                               holes, location_city, location_state, location_lat, location_lon, par_total, number_of_holes,
                               tees, round_type, date, status, tee_time_1, tee_time_2)
    VALUES (v_trip, 2, 'Briggs Ranch Golf Club', 'Briggs Ranch Golf Club', 'Black', 72.7, 131,
            '[{"par": 4, "yardage": 441, "handicap": 5}, {"par": 4, "yardage": 413, "handicap": 11}, {"par": 3, "yardage": 182, "handicap": 15}, {"par": 4, "yardage": 323, "handicap": 13}, {"par": 5, "yardage": 492, "handicap": 3}, {"par": 4, "yardage": 421, "handicap": 9}, {"par": 5, "yardage": 532, "handicap": 1}, {"par": 3, "yardage": 162, "handicap": 17}, {"par": 4, "yardage": 428, "handicap": 7}, {"par": 4, "yardage": 393, "handicap": 10}, {"par": 5, "yardage": 579, "handicap": 2}, {"par": 4, "yardage": 434, "handicap": 6}, {"par": 5, "yardage": 576, "handicap": 4}, {"par": 4, "yardage": 294, "handicap": 16}, {"par": 3, "yardage": 184, "handicap": 14}, {"par": 4, "yardage": 383, "handicap": 12}, {"par": 3, "yardage": 183, "handicap": 18}, {"par": 4, "yardage": 390, "handicap": 8}]'::jsonb, 'San Antonio', 'TX', 29.407543, -98.759908, 72, 18,
            '[{"name": "Red", "slope": 135, "rating": 74.7, "par": 72, "gender": "male"}, {"name": "Red (W)", "slope": 147, "rating": 81.9, "par": 72, "gender": "female"}, {"name": "Black", "slope": 131, "rating": 72.7, "par": 72, "gender": "male"}, {"name": "Black (W)", "slope": 142, "rating": 79.5, "par": 72, "gender": "female"}, {"name": "Black/White", "slope": 127, "rating": 71.3, "par": 72, "gender": "male"}, {"name": "Black/White (W)", "slope": 137, "rating": 77.8, "par": 72, "gender": "female"}, {"name": "White", "slope": 123, "rating": 70.1, "par": 72, "gender": "male"}, {"name": "White (W)", "slope": 134, "rating": 75.9, "par": 72, "gender": "female"}, {"name": "White/Blue", "slope": 118, "rating": 68.6, "par": 72, "gender": "male"}, {"name": "White/Blue (W)", "slope": 130, "rating": 73.8, "par": 72, "gender": "female"}, {"name": "Blue", "slope": 112, "rating": 67.2, "par": 72, "gender": "male"}, {"name": "Blue (W)", "slope": 127, "rating": 72, "par": 72, "gender": "female"}, {"name": "Green", "slope": 107, "rating": 63.8, "par": 72, "gender": "male"}, {"name": "Green (W)", "slope": 123, "rating": 69, "par": 72, "gender": "female"}]'::jsonb, 'tournament', '2026-12-05', 'upcoming', '8:00 AM', '8:15 AM')
    RETURNING id INTO v_round;
    INSERT INTO public.pairings (round_id, pairing_number, team1_id, team2_id) VALUES (v_round, 1, v_t1, v_t2) RETURNING id INTO v_pair;
    INSERT INTO public.pairing_players (pairing_id, trip_player_id, team_slot) VALUES
      (v_pair, v_p[1], 1), (v_pair, v_p[3], 2), (v_pair, v_p[5], 3), (v_pair, v_p[7], 4);
    INSERT INTO public.pairings (round_id, pairing_number, team1_id, team2_id) VALUES (v_round, 2, v_t1, v_t2) RETURNING id INTO v_pair;
    INSERT INTO public.pairing_players (pairing_id, trip_player_id, team_slot) VALUES
      (v_pair, v_p[2], 1), (v_pair, v_p[4], 2), (v_pair, v_p[6], 3), (v_pair, v_p[8], 4);

    INSERT INTO public.rounds (trip_id, round_number, course_name, club_name, tee_name, course_rating, slope_rating,
                               holes, location_city, location_state, location_lat, location_lon, par_total, number_of_holes,
                               tees, round_type, date, status, tee_time_1, tee_time_2)
    VALUES (v_trip, 3, 'Briggs Ranch Golf Club', 'Briggs Ranch Golf Club', 'Black', 72.7, 131,
            '[{"par": 4, "yardage": 441, "handicap": 5}, {"par": 4, "yardage": 413, "handicap": 11}, {"par": 3, "yardage": 182, "handicap": 15}, {"par": 4, "yardage": 323, "handicap": 13}, {"par": 5, "yardage": 492, "handicap": 3}, {"par": 4, "yardage": 421, "handicap": 9}, {"par": 5, "yardage": 532, "handicap": 1}, {"par": 3, "yardage": 162, "handicap": 17}, {"par": 4, "yardage": 428, "handicap": 7}, {"par": 4, "yardage": 393, "handicap": 10}, {"par": 5, "yardage": 579, "handicap": 2}, {"par": 4, "yardage": 434, "handicap": 6}, {"par": 5, "yardage": 576, "handicap": 4}, {"par": 4, "yardage": 294, "handicap": 16}, {"par": 3, "yardage": 184, "handicap": 14}, {"par": 4, "yardage": 383, "handicap": 12}, {"par": 3, "yardage": 183, "handicap": 18}, {"par": 4, "yardage": 390, "handicap": 8}]'::jsonb, 'San Antonio', 'TX', 29.407543, -98.759908, 72, 18,
            '[{"name": "Red", "slope": 135, "rating": 74.7, "par": 72, "gender": "male"}, {"name": "Red (W)", "slope": 147, "rating": 81.9, "par": 72, "gender": "female"}, {"name": "Black", "slope": 131, "rating": 72.7, "par": 72, "gender": "male"}, {"name": "Black (W)", "slope": 142, "rating": 79.5, "par": 72, "gender": "female"}, {"name": "Black/White", "slope": 127, "rating": 71.3, "par": 72, "gender": "male"}, {"name": "Black/White (W)", "slope": 137, "rating": 77.8, "par": 72, "gender": "female"}, {"name": "White", "slope": 123, "rating": 70.1, "par": 72, "gender": "male"}, {"name": "White (W)", "slope": 134, "rating": 75.9, "par": 72, "gender": "female"}, {"name": "White/Blue", "slope": 118, "rating": 68.6, "par": 72, "gender": "male"}, {"name": "White/Blue (W)", "slope": 130, "rating": 73.8, "par": 72, "gender": "female"}, {"name": "Blue", "slope": 112, "rating": 67.2, "par": 72, "gender": "male"}, {"name": "Blue (W)", "slope": 127, "rating": 72, "par": 72, "gender": "female"}, {"name": "Green", "slope": 107, "rating": 63.8, "par": 72, "gender": "male"}, {"name": "Green (W)", "slope": 123, "rating": 69, "par": 72, "gender": "female"}]'::jsonb, 'tournament', '2026-12-05', 'upcoming', '1:30 PM', '1:45 PM')
    RETURNING id INTO v_round;
    INSERT INTO public.pairings (round_id, pairing_number, team1_id, team2_id) VALUES (v_round, 1, v_t1, v_t2) RETURNING id INTO v_pair;
    INSERT INTO public.pairing_players (pairing_id, trip_player_id, team_slot) VALUES
      (v_pair, v_p[1], 1), (v_pair, v_p[4], 2), (v_pair, v_p[5], 3), (v_pair, v_p[8], 4);
    INSERT INTO public.pairings (round_id, pairing_number, team1_id, team2_id) VALUES (v_round, 2, v_t1, v_t2) RETURNING id INTO v_pair;
    INSERT INTO public.pairing_players (pairing_id, trip_player_id, team_slot) VALUES
      (v_pair, v_p[2], 1), (v_pair, v_p[3], 2), (v_pair, v_p[6], 3), (v_pair, v_p[7], 4);

    INSERT INTO public.rounds (trip_id, round_number, course_name, club_name, tee_name, course_rating, slope_rating,
                               holes, location_city, location_state, location_lat, location_lon, par_total, number_of_holes,
                               tees, round_type, date, status, tee_time_1, tee_time_2)
    VALUES (v_trip, 4, 'Briggs Ranch Golf Club', 'Briggs Ranch Golf Club', 'Black', 72.7, 131,
            '[{"par": 4, "yardage": 441, "handicap": 5}, {"par": 4, "yardage": 413, "handicap": 11}, {"par": 3, "yardage": 182, "handicap": 15}, {"par": 4, "yardage": 323, "handicap": 13}, {"par": 5, "yardage": 492, "handicap": 3}, {"par": 4, "yardage": 421, "handicap": 9}, {"par": 5, "yardage": 532, "handicap": 1}, {"par": 3, "yardage": 162, "handicap": 17}, {"par": 4, "yardage": 428, "handicap": 7}, {"par": 4, "yardage": 393, "handicap": 10}, {"par": 5, "yardage": 579, "handicap": 2}, {"par": 4, "yardage": 434, "handicap": 6}, {"par": 5, "yardage": 576, "handicap": 4}, {"par": 4, "yardage": 294, "handicap": 16}, {"par": 3, "yardage": 184, "handicap": 14}, {"par": 4, "yardage": 383, "handicap": 12}, {"par": 3, "yardage": 183, "handicap": 18}, {"par": 4, "yardage": 390, "handicap": 8}]'::jsonb, 'San Antonio', 'TX', 29.407543, -98.759908, 72, 18,
            '[{"name": "Red", "slope": 135, "rating": 74.7, "par": 72, "gender": "male"}, {"name": "Red (W)", "slope": 147, "rating": 81.9, "par": 72, "gender": "female"}, {"name": "Black", "slope": 131, "rating": 72.7, "par": 72, "gender": "male"}, {"name": "Black (W)", "slope": 142, "rating": 79.5, "par": 72, "gender": "female"}, {"name": "Black/White", "slope": 127, "rating": 71.3, "par": 72, "gender": "male"}, {"name": "Black/White (W)", "slope": 137, "rating": 77.8, "par": 72, "gender": "female"}, {"name": "White", "slope": 123, "rating": 70.1, "par": 72, "gender": "male"}, {"name": "White (W)", "slope": 134, "rating": 75.9, "par": 72, "gender": "female"}, {"name": "White/Blue", "slope": 118, "rating": 68.6, "par": 72, "gender": "male"}, {"name": "White/Blue (W)", "slope": 130, "rating": 73.8, "par": 72, "gender": "female"}, {"name": "Blue", "slope": 112, "rating": 67.2, "par": 72, "gender": "male"}, {"name": "Blue (W)", "slope": 127, "rating": 72, "par": 72, "gender": "female"}, {"name": "Green", "slope": 107, "rating": 63.8, "par": 72, "gender": "male"}, {"name": "Green (W)", "slope": 123, "rating": 69, "par": 72, "gender": "female"}]'::jsonb, 'tournament', '2026-12-06', 'upcoming', '8:30 AM', '8:45 AM')
    RETURNING id INTO v_round;
    INSERT INTO public.pairings (round_id, pairing_number, team1_id, team2_id) VALUES (v_round, 1, v_t1, v_t2) RETURNING id INTO v_pair;
    INSERT INTO public.pairing_players (pairing_id, trip_player_id, team_slot) VALUES
      (v_pair, v_p[1], 1), (v_pair, v_p[2], 2), (v_pair, v_p[7], 3), (v_pair, v_p[8], 4);
    INSERT INTO public.pairings (round_id, pairing_number, team1_id, team2_id) VALUES (v_round, 2, v_t1, v_t2) RETURNING id INTO v_pair;
    INSERT INTO public.pairing_players (pairing_id, trip_player_id, team_slot) VALUES
      (v_pair, v_p[3], 1), (v_pair, v_p[4], 2), (v_pair, v_p[5], 3), (v_pair, v_p[6], 4);

    INSERT INTO public.stays (trip_id, hotel_name, check_in, check_out, confirmation, notes)
    VALUES (v_trip, 'Briggs Ranch — Dormie Casitas', '2026-12-04', '2026-12-06', 'DN-261204', 'Casitas 2 & 3 · 4 king suites each · Check in at the clubhouse');

    INSERT INTO public.meals (trip_id, day, meal_type, custom_label, location, meal_time, notes) VALUES
      (v_trip, '2026-12-04', 'happy_hour', NULL, 'Bourbon Bar', '5:30 PM', 'Welcome pour · 40+ rare bourbons'),
      (v_trip, '2026-12-04', 'dinner', NULL, 'Clubhouse Dining Room', '7:00 PM', 'Tex-Mex night'),
      (v_trip, '2026-12-05', 'breakfast', NULL, 'Clubhouse', '7:00 AM', NULL),
      (v_trip, '2026-12-05', 'lunch', NULL, 'The Turn', '12:30 PM', 'Between rounds'),
      (v_trip, '2026-12-05', 'dinner', NULL, 'Private Dining Room', '7:30 PM', 'Steak night · Day 2 awards'),
      (v_trip, '2026-12-06', 'breakfast', NULL, 'Clubhouse', '7:15 AM', NULL),
      (v_trip, '2026-12-06', 'other', 'Farewell Lunch', 'Clubhouse Patio', '1:00 PM', 'Trophy presentation');

    RAISE NOTICE 'Created %', 'Briggs Ranch Weekend';
  END IF;

  -- ───────────── Ballyhack Spring Trip ─────────────
  IF EXISTS (SELECT 1 FROM public.trips tr JOIN public.group_members m ON m.group_id = tr.group_id AND m.user_id = v_uid
              WHERE tr.name = 'Ballyhack Spring Trip' AND tr.deleted_at IS NULL) THEN
    RAISE NOTICE 'Skipping %: already exists', 'Ballyhack Spring Trip';
  ELSE
    INSERT INTO public.trips (group_id, name, format, team_mode, bonus_games, created_by, status,
                              start_date, end_date, time_zone, schedule, resort_id)
    VALUES (v_group, 'Ballyhack Spring Trip', 'standard_match_play', true, '[]'::jsonb, v_uid, 'active',
            '2027-04-23', '2027-04-25', 'America/New_York', '[{"date": "2027-04-23", "type": "golf"}, {"date": "2027-04-24", "type": "golf"}, {"date": "2027-04-25", "type": "golf"}]'::jsonb, v_resort)
    RETURNING id INTO v_trip;

    INSERT INTO public.teams (trip_id, name, team_index, color_index) VALUES (v_trip, 'Blue Ridge', 1, 1) RETURNING id INTO v_t1;
    INSERT INTO public.teams (trip_id, name, team_index, color_index) VALUES (v_trip, 'Big Lick', 2, 2) RETURNING id INTO v_t2;

    v_p := ARRAY[]::uuid[];
    INSERT INTO public.trip_players (trip_id, user_id, claimed_user_id, is_claimed, first_name, last_name, email, handicap_index, team_id)
      VALUES (v_trip, v_uid, v_uid, true, v_first, v_last, v_email, 8.4, v_t1) RETURNING id INTO v_tmp;
    v_p := v_p || v_tmp;
    INSERT INTO public.trip_players (trip_id, user_id, is_claimed, first_name, last_name, guest_name, handicap_index, team_id)
      VALUES (v_trip, NULL, false, 'Jack', 'Morrison', 'Jack Morrison', 6.2, v_t1) RETURNING id INTO v_tmp;
    v_p := v_p || v_tmp;
    INSERT INTO public.trip_players (trip_id, user_id, is_claimed, first_name, last_name, guest_name, handicap_index, team_id)
      VALUES (v_trip, NULL, false, 'Tyler', 'Brooks', 'Tyler Brooks', 12.5, v_t1) RETURNING id INTO v_tmp;
    v_p := v_p || v_tmp;
    INSERT INTO public.trip_players (trip_id, user_id, is_claimed, first_name, last_name, guest_name, handicap_index, team_id)
      VALUES (v_trip, NULL, false, 'Ryan', 'Callahan', 'Ryan Callahan', 4.8, v_t1) RETURNING id INTO v_tmp;
    v_p := v_p || v_tmp;
    INSERT INTO public.trip_players (trip_id, user_id, is_claimed, first_name, last_name, guest_name, handicap_index, team_id)
      VALUES (v_trip, NULL, false, 'Matt', 'Sullivan', 'Matt Sullivan', 9.1, v_t2) RETURNING id INTO v_tmp;
    v_p := v_p || v_tmp;
    INSERT INTO public.trip_players (trip_id, user_id, is_claimed, first_name, last_name, guest_name, handicap_index, team_id)
      VALUES (v_trip, NULL, false, 'Chris', 'Delgado', 'Chris Delgado', 14.3, v_t2) RETURNING id INTO v_tmp;
    v_p := v_p || v_tmp;
    INSERT INTO public.trip_players (trip_id, user_id, is_claimed, first_name, last_name, guest_name, handicap_index, team_id)
      VALUES (v_trip, NULL, false, 'Ben', 'Hartley', 'Ben Hartley', 3.9, v_t2) RETURNING id INTO v_tmp;
    v_p := v_p || v_tmp;
    INSERT INTO public.trip_players (trip_id, user_id, is_claimed, first_name, last_name, guest_name, handicap_index, team_id)
      VALUES (v_trip, NULL, false, 'Drew', 'Patterson', 'Drew Patterson', 10.7, v_t2) RETURNING id INTO v_tmp;
    v_p := v_p || v_tmp;

    INSERT INTO public.rounds (trip_id, round_number, course_name, club_name, tee_name, course_rating, slope_rating,
                               holes, location_city, location_state, location_lat, location_lon, par_total, number_of_holes,
                               tees, round_type, date, status, tee_time_1, tee_time_2)
    VALUES (v_trip, 1, 'Ballyhack Golf Club', 'Ballyhack Golf Club', 'Ballyhack', 73.6, 152,
            '[{"par": 4, "yardage": 349, "handicap": 3}, {"par": 5, "yardage": 514, "handicap": 11}, {"par": 3, "yardage": 211, "handicap": 15}, {"par": 4, "yardage": 447, "handicap": 1}, {"par": 4, "yardage": 378, "handicap": 5}, {"par": 4, "yardage": 334, "handicap": 13}, {"par": 3, "yardage": 188, "handicap": 17}, {"par": 4, "yardage": 350, "handicap": 9}, {"par": 5, "yardage": 530, "handicap": 7}, {"par": 5, "yardage": 569, "handicap": 12}, {"par": 4, "yardage": 322, "handicap": 14}, {"par": 4, "yardage": 427, "handicap": 4}, {"par": 3, "yardage": 214, "handicap": 16}, {"par": 4, "yardage": 361, "handicap": 6}, {"par": 5, "yardage": 544, "handicap": 10}, {"par": 4, "yardage": 461, "handicap": 2}, {"par": 3, "yardage": 126, "handicap": 18}, {"par": 4, "yardage": 428, "handicap": 8}]'::jsonb, 'Roanoke', 'VA', 37.22971070000001, -79.8909974, 72, 18,
            '[{"name": "Big Lick", "slope": 155, "rating": 76.3, "par": 72, "gender": "male"}, {"name": "Ballyhack", "slope": 152, "rating": 73.6, "par": 72, "gender": "male"}, {"name": "Appalachian", "slope": 149, "rating": 72.1, "par": 72, "gender": "male"}, {"name": "Blue Ridge", "slope": 146, "rating": 71, "par": 72, "gender": "male"}, {"name": "Star", "slope": 140, "rating": 68.9, "par": 72, "gender": "male"}, {"name": "Star (W)", "slope": 143, "rating": 74.8, "par": 72, "gender": "female"}, {"name": "Valley", "slope": 135, "rating": 66.8, "par": 72, "gender": "male"}, {"name": "Valley (W)", "slope": 137, "rating": 72.3, "par": 72, "gender": "female"}]'::jsonb, 'tournament', '2027-04-23', 'upcoming', '12:30 PM', '12:45 PM')
    RETURNING id INTO v_round;
    INSERT INTO public.pairings (round_id, pairing_number, team1_id, team2_id) VALUES (v_round, 1, v_t1, v_t2) RETURNING id INTO v_pair;
    INSERT INTO public.pairing_players (pairing_id, trip_player_id, team_slot) VALUES
      (v_pair, v_p[1], 1), (v_pair, v_p[2], 2), (v_pair, v_p[5], 3), (v_pair, v_p[6], 4);
    INSERT INTO public.pairings (round_id, pairing_number, team1_id, team2_id) VALUES (v_round, 2, v_t1, v_t2) RETURNING id INTO v_pair;
    INSERT INTO public.pairing_players (pairing_id, trip_player_id, team_slot) VALUES
      (v_pair, v_p[3], 1), (v_pair, v_p[4], 2), (v_pair, v_p[7], 3), (v_pair, v_p[8], 4);

    INSERT INTO public.rounds (trip_id, round_number, course_name, club_name, tee_name, course_rating, slope_rating,
                               holes, location_city, location_state, location_lat, location_lon, par_total, number_of_holes,
                               tees, round_type, date, status, tee_time_1, tee_time_2)
    VALUES (v_trip, 2, 'Ballyhack Golf Club', 'Ballyhack Golf Club', 'Ballyhack', 73.6, 152,
            '[{"par": 4, "yardage": 349, "handicap": 3}, {"par": 5, "yardage": 514, "handicap": 11}, {"par": 3, "yardage": 211, "handicap": 15}, {"par": 4, "yardage": 447, "handicap": 1}, {"par": 4, "yardage": 378, "handicap": 5}, {"par": 4, "yardage": 334, "handicap": 13}, {"par": 3, "yardage": 188, "handicap": 17}, {"par": 4, "yardage": 350, "handicap": 9}, {"par": 5, "yardage": 530, "handicap": 7}, {"par": 5, "yardage": 569, "handicap": 12}, {"par": 4, "yardage": 322, "handicap": 14}, {"par": 4, "yardage": 427, "handicap": 4}, {"par": 3, "yardage": 214, "handicap": 16}, {"par": 4, "yardage": 361, "handicap": 6}, {"par": 5, "yardage": 544, "handicap": 10}, {"par": 4, "yardage": 461, "handicap": 2}, {"par": 3, "yardage": 126, "handicap": 18}, {"par": 4, "yardage": 428, "handicap": 8}]'::jsonb, 'Roanoke', 'VA', 37.22971070000001, -79.8909974, 72, 18,
            '[{"name": "Big Lick", "slope": 155, "rating": 76.3, "par": 72, "gender": "male"}, {"name": "Ballyhack", "slope": 152, "rating": 73.6, "par": 72, "gender": "male"}, {"name": "Appalachian", "slope": 149, "rating": 72.1, "par": 72, "gender": "male"}, {"name": "Blue Ridge", "slope": 146, "rating": 71, "par": 72, "gender": "male"}, {"name": "Star", "slope": 140, "rating": 68.9, "par": 72, "gender": "male"}, {"name": "Star (W)", "slope": 143, "rating": 74.8, "par": 72, "gender": "female"}, {"name": "Valley", "slope": 135, "rating": 66.8, "par": 72, "gender": "male"}, {"name": "Valley (W)", "slope": 137, "rating": 72.3, "par": 72, "gender": "female"}]'::jsonb, 'tournament', '2027-04-24', 'upcoming', '8:00 AM', '8:15 AM')
    RETURNING id INTO v_round;
    INSERT INTO public.pairings (round_id, pairing_number, team1_id, team2_id) VALUES (v_round, 1, v_t1, v_t2) RETURNING id INTO v_pair;
    INSERT INTO public.pairing_players (pairing_id, trip_player_id, team_slot) VALUES
      (v_pair, v_p[1], 1), (v_pair, v_p[3], 2), (v_pair, v_p[5], 3), (v_pair, v_p[7], 4);
    INSERT INTO public.pairings (round_id, pairing_number, team1_id, team2_id) VALUES (v_round, 2, v_t1, v_t2) RETURNING id INTO v_pair;
    INSERT INTO public.pairing_players (pairing_id, trip_player_id, team_slot) VALUES
      (v_pair, v_p[2], 1), (v_pair, v_p[4], 2), (v_pair, v_p[6], 3), (v_pair, v_p[8], 4);

    INSERT INTO public.rounds (trip_id, round_number, course_name, club_name, tee_name, course_rating, slope_rating,
                               holes, location_city, location_state, location_lat, location_lon, par_total, number_of_holes,
                               tees, round_type, date, status, tee_time_1, tee_time_2)
    VALUES (v_trip, 3, 'Ballyhack Golf Club', 'Ballyhack Golf Club', 'Ballyhack', 73.6, 152,
            '[{"par": 4, "yardage": 349, "handicap": 3}, {"par": 5, "yardage": 514, "handicap": 11}, {"par": 3, "yardage": 211, "handicap": 15}, {"par": 4, "yardage": 447, "handicap": 1}, {"par": 4, "yardage": 378, "handicap": 5}, {"par": 4, "yardage": 334, "handicap": 13}, {"par": 3, "yardage": 188, "handicap": 17}, {"par": 4, "yardage": 350, "handicap": 9}, {"par": 5, "yardage": 530, "handicap": 7}, {"par": 5, "yardage": 569, "handicap": 12}, {"par": 4, "yardage": 322, "handicap": 14}, {"par": 4, "yardage": 427, "handicap": 4}, {"par": 3, "yardage": 214, "handicap": 16}, {"par": 4, "yardage": 361, "handicap": 6}, {"par": 5, "yardage": 544, "handicap": 10}, {"par": 4, "yardage": 461, "handicap": 2}, {"par": 3, "yardage": 126, "handicap": 18}, {"par": 4, "yardage": 428, "handicap": 8}]'::jsonb, 'Roanoke', 'VA', 37.22971070000001, -79.8909974, 72, 18,
            '[{"name": "Big Lick", "slope": 155, "rating": 76.3, "par": 72, "gender": "male"}, {"name": "Ballyhack", "slope": 152, "rating": 73.6, "par": 72, "gender": "male"}, {"name": "Appalachian", "slope": 149, "rating": 72.1, "par": 72, "gender": "male"}, {"name": "Blue Ridge", "slope": 146, "rating": 71, "par": 72, "gender": "male"}, {"name": "Star", "slope": 140, "rating": 68.9, "par": 72, "gender": "male"}, {"name": "Star (W)", "slope": 143, "rating": 74.8, "par": 72, "gender": "female"}, {"name": "Valley", "slope": 135, "rating": 66.8, "par": 72, "gender": "male"}, {"name": "Valley (W)", "slope": 137, "rating": 72.3, "par": 72, "gender": "female"}]'::jsonb, 'tournament', '2027-04-24', 'upcoming', '1:30 PM', '1:45 PM')
    RETURNING id INTO v_round;
    INSERT INTO public.pairings (round_id, pairing_number, team1_id, team2_id) VALUES (v_round, 1, v_t1, v_t2) RETURNING id INTO v_pair;
    INSERT INTO public.pairing_players (pairing_id, trip_player_id, team_slot) VALUES
      (v_pair, v_p[1], 1), (v_pair, v_p[4], 2), (v_pair, v_p[5], 3), (v_pair, v_p[8], 4);
    INSERT INTO public.pairings (round_id, pairing_number, team1_id, team2_id) VALUES (v_round, 2, v_t1, v_t2) RETURNING id INTO v_pair;
    INSERT INTO public.pairing_players (pairing_id, trip_player_id, team_slot) VALUES
      (v_pair, v_p[2], 1), (v_pair, v_p[3], 2), (v_pair, v_p[6], 3), (v_pair, v_p[7], 4);

    INSERT INTO public.rounds (trip_id, round_number, course_name, club_name, tee_name, course_rating, slope_rating,
                               holes, location_city, location_state, location_lat, location_lon, par_total, number_of_holes,
                               tees, round_type, date, status, tee_time_1, tee_time_2)
    VALUES (v_trip, 4, 'Ballyhack Golf Club', 'Ballyhack Golf Club', 'Ballyhack', 73.6, 152,
            '[{"par": 4, "yardage": 349, "handicap": 3}, {"par": 5, "yardage": 514, "handicap": 11}, {"par": 3, "yardage": 211, "handicap": 15}, {"par": 4, "yardage": 447, "handicap": 1}, {"par": 4, "yardage": 378, "handicap": 5}, {"par": 4, "yardage": 334, "handicap": 13}, {"par": 3, "yardage": 188, "handicap": 17}, {"par": 4, "yardage": 350, "handicap": 9}, {"par": 5, "yardage": 530, "handicap": 7}, {"par": 5, "yardage": 569, "handicap": 12}, {"par": 4, "yardage": 322, "handicap": 14}, {"par": 4, "yardage": 427, "handicap": 4}, {"par": 3, "yardage": 214, "handicap": 16}, {"par": 4, "yardage": 361, "handicap": 6}, {"par": 5, "yardage": 544, "handicap": 10}, {"par": 4, "yardage": 461, "handicap": 2}, {"par": 3, "yardage": 126, "handicap": 18}, {"par": 4, "yardage": 428, "handicap": 8}]'::jsonb, 'Roanoke', 'VA', 37.22971070000001, -79.8909974, 72, 18,
            '[{"name": "Big Lick", "slope": 155, "rating": 76.3, "par": 72, "gender": "male"}, {"name": "Ballyhack", "slope": 152, "rating": 73.6, "par": 72, "gender": "male"}, {"name": "Appalachian", "slope": 149, "rating": 72.1, "par": 72, "gender": "male"}, {"name": "Blue Ridge", "slope": 146, "rating": 71, "par": 72, "gender": "male"}, {"name": "Star", "slope": 140, "rating": 68.9, "par": 72, "gender": "male"}, {"name": "Star (W)", "slope": 143, "rating": 74.8, "par": 72, "gender": "female"}, {"name": "Valley", "slope": 135, "rating": 66.8, "par": 72, "gender": "male"}, {"name": "Valley (W)", "slope": 137, "rating": 72.3, "par": 72, "gender": "female"}]'::jsonb, 'tournament', '2027-04-25', 'upcoming', '8:30 AM', '8:45 AM')
    RETURNING id INTO v_round;
    INSERT INTO public.pairings (round_id, pairing_number, team1_id, team2_id) VALUES (v_round, 1, v_t1, v_t2) RETURNING id INTO v_pair;
    INSERT INTO public.pairing_players (pairing_id, trip_player_id, team_slot) VALUES
      (v_pair, v_p[1], 1), (v_pair, v_p[2], 2), (v_pair, v_p[7], 3), (v_pair, v_p[8], 4);
    INSERT INTO public.pairings (round_id, pairing_number, team1_id, team2_id) VALUES (v_round, 2, v_t1, v_t2) RETURNING id INTO v_pair;
    INSERT INTO public.pairing_players (pairing_id, trip_player_id, team_slot) VALUES
      (v_pair, v_p[3], 1), (v_pair, v_p[4], 2), (v_pair, v_p[5], 3), (v_pair, v_p[6], 4);

    INSERT INTO public.stays (trip_id, hotel_name, check_in, check_out, confirmation, notes)
    VALUES (v_trip, 'Ballyhack — Dormie Cottages', '2027-04-23', '2027-04-25', 'DN-270423', 'Cottages 4 & 5 · 4 king suites each · Check in at the clubhouse');

    INSERT INTO public.meals (trip_id, day, meal_type, custom_label, location, meal_time, notes) VALUES
      (v_trip, '2027-04-23', 'happy_hour', NULL, 'Stone Patio', '5:30 PM', 'Welcome cocktails'),
      (v_trip, '2027-04-23', 'dinner', NULL, 'Dining Room', '7:00 PM', 'Southern supper'),
      (v_trip, '2027-04-24', 'breakfast', NULL, 'Clubhouse', '7:00 AM', NULL),
      (v_trip, '2027-04-24', 'lunch', NULL, 'The Turn', '12:30 PM', 'Between rounds'),
      (v_trip, '2027-04-24', 'dinner', NULL, 'Board Room', '7:30 PM', 'Private dinner · Day 2 awards'),
      (v_trip, '2027-04-25', 'breakfast', NULL, 'Clubhouse', '7:15 AM', NULL),
      (v_trip, '2027-04-25', 'other', 'Farewell Lunch', 'Stone Patio', '1:00 PM', 'Trophy presentation');

    RAISE NOTICE 'Created %', 'Ballyhack Spring Trip';
  END IF;
END $demo$;
