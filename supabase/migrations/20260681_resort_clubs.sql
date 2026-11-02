-- =============================================================
-- Trip Clubhouse — club-level branding (Dormie Network clubs).
--   1. FIX: grant read access on public.resorts. 20260680 added the RLS policy
--      but not the table privilege, so the app got "permission denied" and
--      silently fell back to the default look.
--   2. Logos now come from the app itself (public/brands/<slug>/, official
--      logo packs) instead of hotlinking dormienetwork.com.
--   3. Adds Briggs Ranch and Ballyhack as their own branded resorts, and moves
--      the two demo trips onto their club's branding.
-- Colors are taken from each club's official logo files.
-- Idempotent. Run in Supabase SQL Editor (after 20260680_resorts.sql).
-- =============================================================

BEGIN;

GRANT SELECT ON public.resorts TO anon, authenticated;

ALTER TABLE public.resorts ADD COLUMN IF NOT EXISTS logo_white_url text; -- for dark backgrounds

UPDATE public.resorts SET
  logo_url       = '/brands/dormie-network/logo.svg',
  logo_white_url = '/brands/dormie-network/logo-white.svg',
  primary_color  = '#1A1A1A',
  accent_color   = '#B72026'
WHERE slug = 'dormie-network';

INSERT INTO public.resorts (slug, name, tagline, logo_url, logo_white_url, primary_color, accent_color, website_url) VALUES
  ('briggs-ranch', 'Briggs Ranch Golf Club',
   'Showcasing Texas Hill Country just a half hour from downtown.',
   '/brands/briggs-ranch/logo.svg', '/brands/briggs-ranch/logo-white.svg',
   '#4E1C0E', NULL, 'https://www.dormienetwork.com/briggs-ranch'),
  ('ballyhack', 'Ballyhack Golf Club',
   'You''ve never seen the Blue Ridge Mountains quite like this.',
   '/brands/ballyhack/logo.svg', '/brands/ballyhack/logo-white.svg',
   '#4D4D4F', '#ED1C24', 'https://www.dormienetwork.com/ballyhack')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, tagline = EXCLUDED.tagline,
  logo_url = EXCLUDED.logo_url, logo_white_url = EXCLUDED.logo_white_url,
  primary_color = EXCLUDED.primary_color, accent_color = EXCLUDED.accent_color,
  website_url = EXCLUDED.website_url;

-- Demo trips → their club's branding.
UPDATE public.trips SET resort_id = (SELECT id FROM public.resorts WHERE slug = 'briggs-ranch')
 WHERE name = 'Briggs Ranch Weekend' AND deleted_at IS NULL;
UPDATE public.trips SET resort_id = (SELECT id FROM public.resorts WHERE slug = 'ballyhack')
 WHERE name = 'Ballyhack Spring Trip' AND deleted_at IS NULL;

COMMIT;
