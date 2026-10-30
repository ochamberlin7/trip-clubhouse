// What the side-by-side (Ryder Cup style) Leaderboard says — pure, so it's tested.
// The numbers themselves come from teamStandings (scoring.js); this only words them.
import { getTeamDisplayName, isDefaultTeamName } from './teamColors.js'
import { formatVsPar } from './scoring.js'

// 3 → "3", 1.5 → "1½", 0.5 → "½" (Standard Match Play halves, Ryder Cup style).
export function fmtPoints(x) {
  if (x == null || Number.isNaN(x)) return '—'
  if (Number.isInteger(x)) return String(x)
  const whole = Math.floor(x)
  if (Math.abs(x - whole - 0.5) < 1e-9) return whole === 0 ? '½' : `${whole}½`
  return x.toFixed(1)
}

// A team total / round score in the trip's format: stroke play is net to par
// ("E", "+3", "-2"); every other format is points ("12", "1½").
export function fmtTotal(format, x) {
  if (x == null || Number.isNaN(x)) return '—'
  return format === 'stroke_play' ? formatVsPar(x) : fmtPoints(x)
}

// Has this team's cell for a round been played at all?
function cellPlayed(format, c) {
  if (!c) return false
  return format === 'standard_match_play' ? c.completed > 0 : c.scored > 0
}

// One team's score for one round: "—" until it's been played.
export function roundCell(format, c) {
  return cellPlayed(format, c) ? fmtTotal(format, c.pts) : '—'
}

// "Day 2" from the trip's start date (null when there are no dates).
export function dayLabel(round, tripStartDate) {
  if (!round?.date || !tripStartDate) return null
  const d = (Date.UTC(...round.date.split('-').map((n, i) => (i === 1 ? n - 1 : +n))) - Date.UTC(...tripStartDate.split('-').map((n, i) => (i === 1 ? n - 1 : +n)))) / 86400000
  return d >= 0 ? `Day ${Math.round(d) + 1}` : null
}

// The line under the blocks: "Bandits lead by 4 · 2 rounds left", "All square ·
// Final", "No scores yet" … `standings` = teamStandings result.
export function leadLine({ format, teams = [], standings, rounds = [] }) {
  if (!standings) return ''
  const anyPlayed = id => rounds.some(r => cellPlayed(format, standings.perRound.get(id)?.get(r.id)))
  const played = teams.some(t => anyPlayed(t.id))
  if (!played) return 'No scores yet'
  const left = rounds.filter(r => !teams.some(t => cellPlayed(format, standings.perRound.get(t.id)?.get(r.id)))).length
  const tail = left === 0 ? 'Final' : `${left} round${left === 1 ? '' : 's'} left`
  const ranked = standings.ranked.filter(r => teams.some(t => t.id === r.teamId))
  const top = ranked.filter(r => r.rank === 1)
  if (top.length > 1 || ranked.length < 2) return `${teams.length === 2 ? 'All square' : 'Tied for the lead'} · ${tail}`
  const leader = teams.find(t => t.id === top[0].teamId)
  const name = getTeamDisplayName(leader)
  const verb = isDefaultTeamName(name) ? (left === 0 ? 'wins' : 'leads') : (left === 0 ? 'win' : 'lead')
  // Stroke play: lowest wins, so the margin is the gap the other way round.
  const margin = fmtPoints(Math.abs(top[0].total - ranked.find(r => r.rank > 1).total))
  return `${name} ${verb} by ${margin} · ${tail}`
}
