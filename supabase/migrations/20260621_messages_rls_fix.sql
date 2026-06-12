-- =============================================================
-- Trip Clubhouse — fix chat (messages) permissions.
--
-- "permission denied for table messages" is a GRANT-level error (not an RLS
-- row rejection), so the real fix is the GRANT below. The policies are also
-- rebuilt to allow any trip member (player or group member) to read/insert.
-- Run in Supabase SQL Editor.
-- =============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trip members can read messages" ON messages;
DROP POLICY IF EXISTS "Trip members can insert messages" ON messages;

-- Read: any trip member (player row, claimed account, or group member).
CREATE POLICY "Trip members can read messages"
  ON messages FOR SELECT
  USING (
    trip_id IN (
      SELECT trip_id FROM trip_players
      WHERE user_id = auth.uid()
        OR claimed_user_id = auth.uid()
    )
    OR
    trip_id IN (
      SELECT t.id FROM trips t
      JOIN group_members gm ON gm.group_id = t.group_id
      WHERE gm.user_id = auth.uid()
    )
  );

-- Insert: same membership check, plus user_id must match the sender.
CREATE POLICY "Trip members can insert messages"
  ON messages FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
    AND (
      trip_id IN (
        SELECT trip_id FROM trip_players
        WHERE user_id = auth.uid()
          OR claimed_user_id = auth.uid()
      )
      OR
      trip_id IN (
        SELECT t.id FROM trips t
        JOIN group_members gm ON gm.group_id = t.group_id
        WHERE gm.user_id = auth.uid()
      )
    )
  );
