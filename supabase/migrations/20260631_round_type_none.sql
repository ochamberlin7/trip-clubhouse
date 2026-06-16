-- =============================================================
-- Trip Clubhouse — add round_type 'none'.
-- 'none' is a placeholder meaning "we haven't decided yet": rounds created when
-- the commissioner skips tournament setup default to 'none' and are hidden from
-- scoring, the leaderboard, the live banner and tee times until changed to
-- 'tournament' or 'practice' on the Courses page.
-- Run in Supabase SQL Editor.
-- =============================================================

ALTER TABLE rounds DROP CONSTRAINT IF EXISTS rounds_round_type_check;
ALTER TABLE rounds ADD CONSTRAINT rounds_round_type_check
  CHECK (round_type IN ('tournament', 'practice', 'none'));
