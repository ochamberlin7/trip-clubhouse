-- =============================================================
-- Trip Clubhouse — permanent (per-account) dismissal of the in-chat
-- "enable notifications" prompt.
--
-- Dismissal was localStorage-only, so it came back on reinstall / cleared data /
-- a different device. Record it on the user's profile instead — the DB is the
-- source of truth; localStorage stays only as a fast-path cache. Set the moment
-- the user dismisses the prompt (X) or answers the OS permission dialog (accept
-- or decline). Once set, the prompt never shows again on any device; enabling is
-- then only via the Profile toggle.
--
-- No RLS/grant change: profiles is already self-read/self-update (a user reads
-- and writes only their own row). Run in Supabase SQL Editor.
-- =============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS push_prompt_dismissed_at timestamptz;
