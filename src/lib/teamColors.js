// Canonical team colours, keyed by team index (1-4). The team NAME can change, but
// the colour is fixed to the index. Use these for every team colour in the app —
// player-card pills, the score-entry modal badge, leaderboard headers, etc.
//   1 = navy blue, 2 = teal green, 3 = brown/orange, 4 = purple.
export const TEAM_COLORS = {
  1: { solid: '#1B3F6E', pillBg: 'rgba(27,63,110,0.15)', text: '#1B3F6E' },
  2: { solid: '#1E8A6E', pillBg: 'rgba(30,138,110,0.15)', text: '#1E8A6E' },
  3: { solid: '#8B4513', pillBg: 'rgba(139,69,19,0.15)', text: '#8B4513' },
  4: { solid: '#6B21A8', pillBg: 'rgba(107,33,168,0.15)', text: '#6B21A8' },
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
