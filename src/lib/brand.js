// Resort (white-label) branding: turns a resort's colors into the app's CSS
// theme variables, and reads the invite token out of a sign-in redirect.
// Pure helpers here; the React hooks live in useResortBrand.js.

const HEX = /^#([0-9a-f]{6})$/i

export function isHexColor(v) {
  return typeof v === 'string' && HEX.test(v.trim())
}

function toRgb(hex) {
  const n = parseInt(hex.trim().slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toHex([r, g, b]) {
  return '#' + [r, g, b].map(c => Math.round(c).toString(16).padStart(2, '0')).join('').toUpperCase()
}

// Blend `hex` toward `toward` by `amount` (0 = hex, 1 = toward).
export function mixHex(hex, toward, amount) {
  const a = toRgb(hex), b = toRgb(toward)
  return toHex(a.map((c, i) => c + (b[i] - c) * amount))
}

// CSS variables that re-theme the app for a resort. Only the brand family
// (navy + its tints) changes; team colors, score colors and errors stay put.
// Returns {} when the resort has no usable primary color.
export function brandThemeVars(resort) {
  const primary = resort?.primary_color
  if (!isHexColor(primary)) return {}
  const vars = {
    '--navy': primary.toUpperCase(),
    '--navy2': mixHex(primary, '#FFFFFF', 0.22),
    '--accent-bg': mixHex(primary, '#FFFFFF', 0.9),
    '--navy-soft-text': mixHex(primary, '#FFFFFF', 0.78),
    '--navy-soft-text-2': mixHex(primary, '#FFFFFF', 0.66),
    '--brand-link': primary.toUpperCase(),
  }
  if (isHexColor(resort.accent_color)) vars['--brand-accent'] = resort.accent_color.toUpperCase()
  return vars
}

// "/join/<uuid>" → "<uuid>"; anything else → null.
export function inviteTokenFromRedirect(redirect) {
  const m = String(redirect || '').match(/^\/join\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i)
  return m ? m[1] : null
}
