-- =============================================================
-- Trip Clubhouse — reconcile an EXISTING messages table to the
-- Sh*t Talk Thread schema. Run this ONLY if a `messages` table
-- already exists (created by the earlier inline chat widget).
--
-- IDEMPOTENT: safe to run multiple times.
-- Run in Supabase SQL Editor.
-- =============================================================

-- 1. Rename display_name -> sender_name (only if needed).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'display_name'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'sender_name'
  ) THEN
    ALTER TABLE public.messages RENAME COLUMN display_name TO sender_name;
  END IF;
END $$;

-- Ensure sender_name exists at all (in case neither column was present).
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS sender_name text;

-- 2. Ensure trip_id exists, is a FK to trips, and is NOT NULL.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS trip_id uuid;

-- Add the FK constraint only if it isn't already present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'messages'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name = 'messages_trip_id_fkey'
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_trip_id_fkey
      FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Remove orphan rows with no trip_id, then enforce NOT NULL.
-- (NOT NULL cannot be applied while null values remain.)
DELETE FROM public.messages WHERE trip_id IS NULL;
ALTER TABLE public.messages ALTER COLUMN trip_id SET NOT NULL;

-- 3. Enforce content length <= 300 (only if the constraint isn't there yet).
-- Trim any existing rows that would violate so the constraint can validate.
UPDATE public.messages
  SET content = left(content, 300)
  WHERE char_length(content) > 300;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_schema = 'public'
      AND table_name = 'messages'
      AND constraint_name = 'messages_content_len_chk'
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_content_len_chk CHECK (char_length(content) <= 300);
  END IF;
END $$;

-- 4. Add the table to the realtime publication (no-op if already added).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 5. Row Level Security: trip members can read; members can insert as themselves.
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trip members can read messages" ON public.messages;
CREATE POLICY "Trip members can read messages"
  ON public.messages FOR SELECT
  USING (trip_id IN (
    SELECT trip_id FROM public.trip_players WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Trip members can insert messages" ON public.messages;
CREATE POLICY "Trip members can insert messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND trip_id IN (
      SELECT trip_id FROM public.trip_players WHERE user_id = auth.uid()
    )
  );
