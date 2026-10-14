// Canonical team colours, keyed by team index — the SINGLE source of truth. The team
// NAME can change, but the colour is fixed to the index. Used for every team colour in
// the app (player pills, score-entry modal badge, leaderboard/pairing headers, live
// banner, scorecard badges & totals). Stylesheet rules read these via CSS variables
// published by applyTeamColorVars(); never hardcode a team hex anywhere else.
//
//   1 red · 2 blue · 3 green · 4 purple · 5 amber · 6 teal (5-6 cover future growth).
//
// Every `solid` is dark enough to carry WHITE text as a header fill AND to read as text
// on the app's white/light surfaces (all ≥ ~4.5:1 on white). `pillBg` is the same hue
// at low alpha for light pills; `text` is the hue at text weight for those pills. Team
// colours are only ever painted on light backgrounds in the app, so on-navy contrast
// is not required.
export const TEAM_COLORS = {
  1: { solid: '#C62828', pillBg: 'rgba(198,40,40,0.15)', text: '#B02222' },
  2: { solid: '#1C64A6', pillBg: 'rgba(28,100,166,0.15)', text: '#1A5B96' },
  3: { solid: '#1E7A46', pillBg: 'rgba(30,122,70,0.15)', text: '#1B6E3F' },
  4: { solid: '#7A3F9E', pillBg: 'rgba(122,63,158,0.15)', text: '#6E3890' },
  5: { solid: '#B5720E', pillBg: 'rgba(181,114,14,0.18)', text: '#8A5609' },
  6: { solid: '#15808F', pillBg: 'rgba(21,128,143,0.15)', text: '#126C79' },
}

export function teamColor(index) {
  return TEAM_COLORS[index] || TEAM_COLORS[1]
}

// Publish the solid team colours as CSS custom properties (--team-1 … --team-6) so
// stylesheet rules paint team-coloured elements from the SAME palette above instead of
// hardcoding hexes. Call once at app start (main.jsx), before first paint.
export function applyTeamColorVars(root) {
  const el = root || (typeof document !== 'undefined' ? document.documentElement : null)
  if (!el) return
  for (const [index, c] of Object.entries(TEAM_COLORS)) {
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
