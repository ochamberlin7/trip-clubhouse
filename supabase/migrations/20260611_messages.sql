-- =============================================================
-- Trip Clubhouse — Sh*t Talk Thread (chat) messages table
-- Run in Supabase SQL Editor.
-- =============================================================

CREATE TABLE IF NOT EXISTS messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id uuid REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  sender_name text NOT NULL,
  content text NOT NULL CHECK (char_length(content) <= 300),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trip members can read messages" ON messages;
CREATE POLICY "Trip members can read messages"
  ON messages FOR SELECT
  USING (trip_id IN (
    SELECT trip_id FROM trip_players WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Trip members can insert messages" ON messages;
CREATE POLICY "Trip members can insert messages"
  ON messages FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND trip_id IN (
      SELECT trip_id FROM trip_players WHERE user_id = auth.uid()
    )
  );

-- Realtime: stream INSERTs to subscribed clients.
-- (Wrapped so re-running this file doesn't error if already added.)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
