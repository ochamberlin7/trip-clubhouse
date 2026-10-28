// Canonical team colours, keyed by team index — the SINGLE source of truth. The team
// NAME can change, but the colour is fixed to the index. Used for every team colour in
// the app (player pills, score-entry modal badge, leaderboard/pairing headers, live
// banner, scorecard badges & totals). Stylesheet rules read these via CSS variables
// published by applyTeamColorVars(); never hardcode a team hex anywhere else.
// Trips that ended before TEAM_COLORS_CHANGED_ON keep LEGACY_TEAM_COLORS (below);
// the trip screen picks the palette with setTeamPalette(paletteForTrip(trip)).
//
//   1 red · 2 blue · 3 green · 4 purple · 5 amber · 6 teal (5-6 cover future growth).
// Red and blue are the Ryder Cup colours. There's no published Ryder Cup hex code —
// its logo takes the colours from the two flags — so team 1 is the US flag's
// "Old Glory Red" (#B22234) and team 2 the EU flag's "Reflex Blue" (#003399).
//
// Every `solid` is dark enough to carry WHITE text as a header fill AND to read as text
// on the app's white/light surfaces (all ≥ ~4.5:1 on white). `pillBg` is the same hue
// at low alpha for light pills; `text` is the hue at text weight for those pills. Team
// colours are only ever painted on light backgrounds in the app, so on-navy contrast
// is not required.
export const TEAM_COLORS = {
  1: { solid: '#B22234', pillBg: 'rgba(178,34,52,0.15)', text: '#9E1E2E' },   // Ryder Cup USA red (US flag)
  2: { solid: '#003399', pillBg: 'rgba(0,51,153,0.13)', text: '#003399' },    // Ryder Cup Europe blue (EU flag)
  3: { solid: '#1E7A46', pillBg: 'rgba(30,122,70,0.15)', text: '#1B6E3F' },
  4: { solid: '#7A3F9E', pillBg: 'rgba(122,63,158,0.15)', text: '#6E3890' },
  5: { solid: '#B5720E', pillBg: 'rgba(181,114,14,0.18)', text: '#8A5609' },
  6: { solid: '#15808F', pillBg: 'rgba(21,128,143,0.15)', text: '#126C79' },
}

// The ORIGINAL palette (navy · teal · plum · gold · olive · berry). Trips that ended
// before the colour change keep it, so their scorecards and leaderboards look the way
// the group remembers them.
export const LEGACY_TEAM_COLORS = {
  1: { solid: '#1B3F6E', pillBg: 'rgba(27,63,110,0.15)', text: '#1B3F6E' },
  2: { solid: '#0F6E56', pillBg: 'rgba(15,110,86,0.15)', text: '#0F6E56' },
  3: { solid: '#7B4B94', pillBg: 'rgba(123,75,148,0.15)', text: '#7B4B94' },
  4: { solid: '#D4A017', pillBg: 'rgba(212,160,23,0.18)', text: '#8A6A00' },
  5: { solid: '#3C6E1F', pillBg: 'rgba(60,110,31,0.15)', text: '#3C6E1F' },
  6: { solid: '#8A4A6E', pillBg: 'rgba(138,74,110,0.15)', text: '#8A4A6E' },
}

// The day the new palette went live. A trip that ENDED before this keeps the old
// colours; every other trip (including ones that end later) uses TEAM_COLORS.
export const TEAM_COLORS_CHANGED_ON = '2026-10-27'

// Which palette a trip uses: 'legacy' or 'current'. The ONE rule for this.
export function paletteForTrip(trip) {
  return trip?.end_date && trip.end_date < TEAM_COLORS_CHANGED_ON ? 'legacy' : 'current'
}

// The palette in use right now — set by the trip screen when a trip opens
// (setTeamPalette), read by teamColor() and the CSS variables below.
let activePalette = TEAM_COLORS

export function teamColor(index) {
  return activePalette[index] || activePalette[1]
}

// Switch the active palette ('legacy' | 'current') and republish the CSS variables.
// Safe to call on every render — it only does work when the palette changes.
export function setTeamPalette(name) {
  const next = name === 'legacy' ? LEGACY_TEAM_COLORS : TEAM_COLORS
  if (next === activePalette) return
  activePalette = next
  applyTeamColorVars()
}

// Publish the solid team colours as CSS custom properties (--team-1 … --team-6) so
// stylesheet rules paint team-coloured elements from the SAME palette above instead of
// hardcoding hexes. Call once at app start (main.jsx), before first paint.
export function applyTeamColorVars(root) {
  const el = root || (typeof document !== 'undefined' ? document.documentElement : null)
  if (!el) return
  for (const [index, c] of Object.entries(activePalette)) {
    el.style.setProperty(`--team-${index}`, c.solid)
  }
}

// The 1-based colour index for a team — prefer the stored color_index, fall back to
// team_index, then 1. Colour is always derived from the index, never the name.
export function colorIndexOf(team) {
  return team?.color_index ?? team?.team_index ?? 1
}

// Inline style for a coloured team pill/badge, by index.
export function teamPillStyle(index) {
  const c = teamColor(index)
  return { background: c.pillBg, color: c.text }
}

// Display name shown everywhere: the team's name if set, otherwise "Team {index}".
export function getTeamDisplayName(team) {
  if (!team) return ''
  return team.name || `Team ${team.team_index ?? '?'}`
}

// True when a display name is an auto-generated fallback ("Team 1", "Team ?")
// rather than a custom name. Used for grammar/formatting decisions: a default
// name is a singular subject (takes "leads", and needs a dash before a score so
// its trailing digit doesn't run into the score); a custom name is treated as a
// plural collective noun ("Grandmas lead …", "the Broncos lead …").
export function isDefaultTeamName(name) {
  return /^Team (?:\d+|\?)$/.test(String(name || '').trim())
}
