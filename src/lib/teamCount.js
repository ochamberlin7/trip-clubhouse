// Number of teams on a trip: one rule for the trip wizard (picking it) and
// Commissioner Tools (changing it later).
//
// • Choices are 2, 3 or 4 teams — only counts that split the roster evenly.
// • More teams: empty teams are added after the last one (Team 3, Team 4…), each
//   with the next colour. Players stay where they are.
// • Fewer teams: the highest-numbered teams are removed. Their players become
//   Unassigned (and lose captain), and any pairing side that pointed at a removed
//   team is cleared, so the commissioner re-assigns them on Players & Teams.
// • Locked once any score is entered (enforced by the change_team_count RPC).

export const MIN_TEAMS = 2
export const MAX_TEAMS = 4

// Team counts that split `playerCount` players into equal teams of 2+.
export function validTeamCounts(playerCount) {
  const n = Number(playerCount) || 0
  const counts = []
  for (let i = MIN_TEAMS; i <= Math.min(MAX_TEAMS, Math.floor(n / 2)); i++) {
    if (n % i === 0) counts.push(i)
  }
  return counts
}

// Choices to show: the valid ones, plus the current count so it's always shown.
export function teamCountChoices(playerCount, current) {
  const list = validTeamCounts(playerCount)
  if (current && !list.includes(current)) list.push(current)
  return list.sort((a, b) => a - b)
}

// Plan the change. teams: [{ id, team_index, name }], players: [{ id, team_id, name }].
// Returns { ok, error, add: [{ team_index, color_index }], removeTeams: [team],
//           unassignPlayers: [player] }.
export function planTeamCountChange({ teams = [], players = [], target }) {
  const sorted = teams.slice().sort((a, b) => (a.team_index ?? 0) - (b.team_index ?? 0))
  const current = sorted.length
  const empty = { ok: false, error: '', add: [], removeTeams: [], unassignPlayers: [] }
  if (!Number.isInteger(target) || target < MIN_TEAMS || target > MAX_TEAMS) {
    return { ...empty, error: `Pick ${MIN_TEAMS} to ${MAX_TEAMS} teams.` }
  }
  if (target === current) return { ...empty, error: 'That’s the current number of teams.' }

  if (target > current) {
    const last = sorted.reduce((m, t) => Math.max(m, t.team_index ?? 0), 0)
    const add = []
    for (let i = 1; i <= target - current; i++) add.push({ team_index: last + i, color_index: last + i })
    return { ...empty, ok: true, add }
  }

  const removeTeams = sorted.slice(target)
  const removeIds = new Set(removeTeams.map(t => t.id))
  const unassignPlayers = players.filter(p => p.team_id && removeIds.has(p.team_id))
  return { ...empty, ok: true, removeTeams, unassignPlayers }
}
