-- =============================================================
-- Trip Clubhouse — resorts (white-label branding).
--   1. public.resorts: a resort's name, logo and brand colors.
--   2. trips.resort_id: a trip linked to a resort shows that resort's
--      branding (logo in the header, its colors, "Powered by Trip Clubhouse").
--   3. resort_branding_for_invite(token): lets the sign-in / sign-up pages show
--      the resort's branding to an invitee BEFORE they log in. Returns branding
--      plus the trip name only — no players, no other trip data.
--
-- Branding is public info, so anyone can read resorts. There are no write
-- policies: resorts are managed in the SQL editor for now.
-- Seeds the Dormie Network demo resort.
-- Idempotent. Run in Supabase SQL Editor.
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.resorts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text UNIQUE NOT NULL,
  name          text NOT NULL,
  tagline       text,
  logo_url      text,               -- logo for light backgrounds (header, sign-in card)
  primary_color text CHECK (primary_color IS NULL OR primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color  text CHECK (accent_color  IS NULL OR accent_color  ~ '^#[0-9A-Fa-f]{6}$'),
  website_url   text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.resorts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS resorts_select_all ON public.resorts;
CREATE POLICY resorts_select_all ON public.resorts FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS resort_id uuid REFERENCES public.resorts(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.resort_branding_for_invite(p_invite_token uuid)
RETURNS TABLE (
  trip_name text, resort_name text, tagline text, logo_url text,
  primary_color text, accent_color text
)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT t.name, r.name, r.tagline, r.logo_url, r.primary_color, r.accent_color
  FROM public.trips t
  JOIN public.resorts r ON r.id = t.resort_id
  WHERE p_invite_token IS NOT NULL
    AND t.invite_token = p_invite_token
    AND t.deleted_at IS NULL;
$$;
REVOKE ALL ON FUNCTION public.resort_branding_for_invite(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.resort_branding_for_invite(uuid) TO anon, authenticated;

-- Demo resort. Colors are approximated from the public logo (black / red);
-- confirm against Dormie Network's brand-standards PDF before showing widely.
INSERT INTO public.resorts (slug, name, tagline, logo_url, primary_color, accent_color, website_url)
VALUES (
  'dormie-network',
  'Dormie Network',
  'Where pure golf meets genuine hospitality',
  'https://images.squarespace-cdn.com/content/v1/61df380b5fb02b0f290a928f/1f9683a6-f8dc-4623-8444-9b942cacef9c/Dormie_Network_Logo-R-Black_White_Red.png?format=750w',
  '#1F1F1F',
  '#A6192E',
  'https://www.dormienetwork.com'
)
ON CONFLICT (slug) DO NOTHING;

COMMIT;
