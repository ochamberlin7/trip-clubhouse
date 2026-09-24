-- =============================================================
-- Trip Clubhouse — restore service_role's standard grants on the public schema.
--
-- This project hand-granted only `authenticated` (see e.g. 20260621), never
-- `service_role`, so `service_role` lacked SELECT/INSERT/etc. on public tables.
-- That went unnoticed because nothing used the service-role key for direct REST
-- queries until the chat-notify push fan-out — which then failed with
-- `permission denied for table trips (42501)` even with the correct key.
--
-- service_role is the privileged backend role: it bypasses RLS by design and is
-- only ever used server-side (the key never reaches the client). Supabase grants
-- it ALL on public by default; this re-establishes that. It does NOT affect anon
-- or authenticated — their grants/RLS are separate and unchanged.
--
-- Comprehensive on purpose: grant existing objects AND set default privileges so
-- future tables/sequences/functions don't reopen the same gap table by table.
-- Run in Supabase SQL Editor (as postgres) — project mjssollqfngbeetwnxml.
-- =============================================================

GRANT USAGE ON SCHEMA public TO service_role;

-- Existing objects.
GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Future objects created by postgres (the role that runs migrations here), so a
-- newly-created table is usable by service_role without another manual grant.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;
