// The app-wide brand (white-label build). Shown on Home, the sign-in pages and
// any trip that isn't linked to a specific club. Its colors live in
// src/index.css (:root); a club trip overrides them (see useResortBrand.js).
// Logos are served from public/brands/<slug>/ (official logo packs).
export const APP_BRAND = {
  slug: 'dormie-network',
  name: 'Dormie Network',
  logo_url: '/brands/dormie-network/logo.svg',             // for light backgrounds
  logo_white_url: '/brands/dormie-network/logo-white.svg', // for dark backgrounds
}
