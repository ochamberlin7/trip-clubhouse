-- =============================================================
-- Trip Clubhouse — emit full old_record on realtime DELETE events.
--
-- Without REPLICA IDENTITY FULL, Supabase realtime DELETE payloads only
-- include the primary key in `old`, so handlers can't match round_id /
-- trip_player_id / hole_number and deletes don't sync to other clients.
-- Run in Supabase SQL Editor.
-- =============================================================

ALTER TABLE scores REPLICA IDENTITY FULL;
ALTER TABLE drinks REPLICA IDENTITY FULL;
