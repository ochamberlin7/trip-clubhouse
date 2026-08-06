// Canonical team colours, keyed by team index. The team NAME can change, but the
// colour is fixed to the index. Used for every team colour in the app —
// player-card pills, the score-entry modal badge, leaderboard headers, etc.
//
// Palette is coordinated around the app's navy: every colour is muted with a
// cool undertone (no warm brown/orange sitting among the cool chrome). The UI
// supports up to 4 teams today; 5-6 are provided so the palette covers growth.
//   1 navy · 2 teal · 3 plum · 4 olive · 5 steel-blue · 6 berry.
export const TEAM_COLORS = {
  1: { solid: '#1B3F6E', pillBg: 'rgba(27,63,110,0.15)', text: '#1B3F6E' },
  2: { solid: '#0F6E56', pillBg: 'rgba(15,110,86,0.15)', text: '#0F6E56' },
  3: { solid: '#7B4B94', pillBg: 'rgba(123,75,148,0.15)', text: '#7B4B94' },
  4: { solid: '#3C6E1F', pillBg: 'rgba(60,110,31,0.15)', text: '#3C6E1F' },
  5: { solid: '#2E6E8E', pillBg: 'rgba(46,110,142,0.15)', text: '#2E6E8E' },
  6: { solid: '#8A4A6E', pillBg: 'rgba(138,74,110,0.15)', text: '#8A4A6E' },
}

export function teamColor(index) {
  return TEAM_COLORS[index] || TEAM_COLORS[1]
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
