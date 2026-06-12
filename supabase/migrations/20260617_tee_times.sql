-- =============================================================
-- Trip Clubhouse — per-pairing tee times + round type on rounds.
-- Run in Supabase SQL Editor.
-- =============================================================

ALTER TABLE rounds ADD COLUMN IF NOT EXISTS tee_time_1 text;
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS tee_time_2 text;
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS round_type text
  DEFAULT 'tournament' CHECK (round_type IN ('tournament','practice'));

-- Migrate an existing `tee_time` column into tee_time_1, if that column exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rounds' AND column_name = 'tee_time'
  ) THEN
    UPDATE rounds SET tee_time_1 = tee_time
      WHERE tee_time IS NOT NULL AND tee_time_1 IS NULL;
  END IF;
END $$;
