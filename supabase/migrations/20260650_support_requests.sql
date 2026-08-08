-- =============================================================
-- Trip Clubhouse — user feedback / support requests.
-- Run in Supabase SQL Editor (project mjssollqfngbeetwnxml).
--
-- One row per submitted feedback (bug / feature request / question / other).
-- RLS: a user may INSERT only their own rows and SELECT only their own — no
-- admin/commissioner visibility in this pass. Idempotent.
-- =============================================================

CREATE TABLE IF NOT EXISTS support_requests (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id    uuid REFERENCES trips(id) ON DELETE SET NULL,
  user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  category   text NOT NULL DEFAULT 'other'
             CHECK (category IN ('bug', 'feature_request', 'question', 'other')),
  message    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.support_requests TO authenticated;

ALTER TABLE support_requests ENABLE ROW LEVEL SECURITY;

-- Insert only rows attributed to yourself.
DROP POLICY IF EXISTS "support_requests_insert_own" ON support_requests;
CREATE POLICY "support_requests_insert_own" ON support_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- View only your own submissions.
DROP POLICY IF EXISTS "support_requests_select_own" ON support_requests;
CREATE POLICY "support_requests_select_own" ON support_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid());
