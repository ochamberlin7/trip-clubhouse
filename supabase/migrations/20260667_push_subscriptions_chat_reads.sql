-- =============================================================
-- Trip Clubhouse — Web Push for the trash-talk thread.
--   • push_subscriptions — one row per user per device/browser (the browser's
--     PushSubscription: endpoint + p256dh + auth keys). Users manage their own;
--     the chat-notify Netlify function reads them via the service role to fan out.
--   • chat_reads — per (user, trip) last-read timestamp for the thread, so the
--     unread badge count is real state (cleared when the user opens the thread),
--     not just iOS's foreground auto-clear.
-- Both RLS self-managed (a user only ever sees/writes their own rows).
-- Run in Supabase SQL Editor (project mjssollqfngbeetwnxml).
-- =============================================================

-- ── push_subscriptions ──
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   text NOT NULL UNIQUE,           -- unique per device/browser subscription
  p256dh     text NOT NULL,                  -- client public key (payload encryption)
  auth       text NOT NULL,                  -- client auth secret
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;

DROP POLICY IF EXISTS "push_subscriptions_select" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_select" ON public.push_subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "push_subscriptions_insert" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_insert" ON public.push_subscriptions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "push_subscriptions_update" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_update" ON public.push_subscriptions
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "push_subscriptions_delete" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_delete" ON public.push_subscriptions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ── chat_reads ──
CREATE TABLE IF NOT EXISTS public.chat_reads (
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id      uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, trip_id)
);

ALTER TABLE public.chat_reads ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_reads TO authenticated;

DROP POLICY IF EXISTS "chat_reads_select" ON public.chat_reads;
CREATE POLICY "chat_reads_select" ON public.chat_reads
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "chat_reads_insert" ON public.chat_reads;
CREATE POLICY "chat_reads_insert" ON public.chat_reads
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "chat_reads_update" ON public.chat_reads;
CREATE POLICY "chat_reads_update" ON public.chat_reads
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
