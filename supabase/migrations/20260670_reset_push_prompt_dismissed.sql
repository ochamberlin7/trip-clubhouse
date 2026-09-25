-- =============================================================
-- Trip Clubhouse — one-time reset of the in-chat notification banner.
-- Clears every account's dismissal so the "Turn On" prompt shows again for users
-- whose notifications are off. Users who already have notifications on are not
-- re-prompted (the client gates on an active subscription). One-time data reset,
-- not a schema change. Run in Supabase SQL Editor AFTER the localStorage-cache
-- removal is deployed, or already-dismissed devices stay hidden until they reload.
-- =============================================================

UPDATE public.profiles
SET push_prompt_dismissed_at = NULL
WHERE push_prompt_dismissed_at IS NOT NULL;
