// Group stats page — everyone's numbers across every trip a group has taken.
// A group is the tradition (it can hold many trips, with some, all or none of
// the same people over the years). Each member's numbers come from the SAME
// buildCareerDetail as the Career page, limited to this group's trips, so the two
// pages can never disagree. This file only lists the members, ranks them, and
// picks out records and trip winners. Pure; tested in Node.
import { buildCareerDetail, personKey, FORMAT_NAMES } from './careerDetail.js'
import { rankRows } from './statRanks.js'
import { tripTimeStatus } from './myTrips.js'
import { getTeamDisplayName } from './teamColors.js'
import {
  playerName, tripGameType, isIndividualGameType, teamStandingsFromRows,
  individualStandings, roundCourseName, isNoneRound,
} from './scoring.js'

// A real person on a trip (not an empty "Player TBD" spot).
const isPerson = tp => !!(tp.user_id || tp.claimed_user_id || tp.first_name || tp.last_name || tp.guest_name)

// The trip's main format key, as the Career page names them.
function formatOf(trip) {
  const gt = tripGameType(trip)
  if (gt === 'match') return trip?.format === 'standard_match_play' ? 'standard' : 'points'
  return gt
}

function teamFormatName(trip, hasTeams) {
  const f = formatOf(trip)
  if (!f) return 'No tournament'
  return (f === 'stableford' || f === 'stroke') && hasTeams ? `Team ${FORMAT_NAMES[f]}` : FORMAT_NAMES[f]
}

// Who won a finished trip: a team ("Team Ben", with its players) or a player.
// null while the trip isn't over, has no tournament, or nothing was scored.
export function tripWinner(t, now = new Date()) {
  const gt = tripGameType(t.trip)
  if (!gt || tripTimeStatus(t.trip, now) !== 'past') return null
  const players = (t.tripPlayers || []).filter(isPerson)
  const teams = t.teams || []
  const teamIds = [...new Set(players.map(p => p.team_id).filter(Boolean))]
  if (teamIds.length) {
    const st = teamStandingsFromRows({ format: t.trip.format, ...t, teamIds })
    if (st.lowWins ? !st.anyScored : !st.ranked.some(r => r.total > 0)) return null
    const top = st.ranked.filter(r => r.rank === 1)
    const names = top.map(r => getTeamDisplayName(teams.find(tm => tm.id === r.teamId) || { team_index: '?' }))
    return {
      kind: 'team',
      tied: top.length > 1,
      label: top.length > 1 ? `Tied: ${names.join(' & ')}` : names[0],
      players: players.filter(p => top.some(r => r.teamId === p.team_id)).map(p => playerName(p)),
    }
  }
  if (isIndividualGameType(gt)) {
    const scoresMap = {}, teeRowMap = {}, hcpByPlayer = {}
    for (const sc of t.scores || []) if (sc.gross_score != null) scoresMap[`${sc.round_id}:${sc.trip_player_id}:${sc.hole_number}`] = sc.gross_score
    for (const pr of t.playerRounds || []) teeRowMap[`${pr.round_id}:${pr.trip_player_id}`] = pr
    for (const p of players) hcpByPlayer[p.id] = p.handicap_index
    const { ranked } = individualStandings({ gameType: gt, rounds: t.rounds || [], playerIds: players.map(p => p.id), scoresMap, hcpByPlayer, teeRowMap, allowance: t.allowance ?? 100 })
    const top = ranked.filter(r => r.rank === 1)
    if (!top.length) return null
    const names = top.map(r => playerName(players.find(p => p.id === r.id)))
    return { kind: 'player', tied: top.length > 1, label: top.length > 1 ? `Tied: ${names.join(' & ')}` : names[0], players: names }
  }
  return null
}

// The leaderboard categories. `gross` / `net` pairs show a Gross | Net switch.
// hi: higher is better. min: fewest rounds to be ranked (averages).
export const LEADERBOARDS = [
  { id: 'titles', label: 'Trips won', value: d => d.competition.titles },
  { id: 'avg', label: 'Scoring average', hi: false, fmt: 'one', gross: d => d.gross.average, net: d => d.net.average },
  { id: 'best', label: 'Best round', hi: false, gross: d => d.gross.best?.total ?? null, net: d => d.net.best?.total ?? null, whereG: d => d.gross.best, whereN: d => d.net.best },
  { id: 'birdies', label: 'Birdies', gross: d => d.gross.counts.birdies, net: d => d.net.counts.birdies },
  { id: 'eagles', label: 'Eagles', gross: d => d.gross.counts.eagles + d.gross.counts.albatrosses, net: d => d.net.counts.eagles + d.net.counts.albatrosses },
  { id: 'pars', label: 'Pars', gross: d => d.gross.counts.pars, net: d => d.net.counts.pars },
  { id: 'wins', label: 'Match wins', value: d => d.competition.record.w, onlyIf: g => g.hasMatchPlay },
  { id: 'points', label: 'Points won', value: d => d.competition.formats.points?.points ?? null, onlyIf: g => g.formats.has('points') },
  { id: 'stableford', label: 'Stableford points', value: d => d.competition.formats.stableford?.points ?? null, onlyIf: g => g.formats.has('stableford') },
  { id: 'trips', label: 'Trips played', value: d => d.totals.trips },
  { id: 'rounds', label: 'Rounds', value: d => d.totals.rounds },
  { id: 'holes', label: 'Holes played', value: d => d.totals.holes },
]

// Ranked rows for one category: [{ member, v, rank, where }]. `mode` 'gross' | 'net'.
export function rankLeaderboard(group, id, mode = 'gross') {
  const def = LEADERBOARDS.find(l => l.id === id)
  if (!def) return []
  const get = def.value || def[mode]
  const whereOf = mode === 'net' ? def.whereN : def.whereG
  const rows = rankRows(group.members, m => {
    const v = get(m.detail)
    return v == null ? null : v
  }, { hi: def.hi !== false, nameOf: m => m.name })
  return rows.map(r => ({ member: r.item, v: r.v, rank: r.rank, where: whereOf ? whereOf(r.item.detail) : null }))
}

// The single best value of something across members, with everyone who holds it.
function record(members, get, { hi = true } = {}) {
  let best = null, holders = []
  for (const m of members) {
    const got = get(m)
    if (!got || got.v == null) continue
    if (best == null || (hi ? got.v > best : got.v < best)) { best = got.v; holders = [{ name: m.name, key: m.key, where: got.where }] }
    else if (got.v === best) holders.push({ name: m.name, key: m.key, where: got.where })
  }
  return best == null ? null : { v: best, holders }
}

function bestRoundBy(d, pick, hi) {
  let best = null
  for (const t of d.trips) for (const r of t.roundsList) {
    if (!r.complete || r.holeCount !== 18) continue
    const v = pick(r)
    if (v == null) continue
    if (best == null || (hi ? v > best.v : v < best.v)) best = { v, where: r }
  }
  return best
}

// perTrip: loadCareerData rows for the group's trips. viewerUserId: highlights you.
export function buildGroupStats(perTrip = [], viewerUserId = null, now = new Date()) {
  // Everyone who's been on one of the group's trips, matched across trips by
  // account (or by name for guests), like the Career page.
  const people = new Map()
  for (const t of perTrip) {
    for (const tp of t.tripPlayers || []) {
      if (!isPerson(tp)) continue
      const key = personKey(tp)
      if (!people.has(key)) people.set(key, { key, name: playerName(tp), accountId: tp.claimed_user_id || tp.user_id || null })
    }
  }
  const members = [...people.values()]
    .map(p => ({ ...p, detail: buildCareerDetail(perTrip, tp => isPerson(tp) && personKey(tp) === p.key, now) }))
    .filter(m => m.detail.totals.trips > 0)
    .sort((a, b) => a.name.localeCompare(b.name))
  const viewer = viewerUserId ? members.find(m => m.accountId === viewerUserId || m.key === `u:${viewerUserId}`) : null

  // Trip history, newest first.
  const trips = perTrip
    .filter(t => t.trip)
    .map(t => {
      const rounds = (t.rounds || []).filter(r => !isNoneRound(r))
      const scoredIds = new Set((t.scores || []).filter(s => s.gross_score != null).map(s => s.round_id))
      const playedRounds = rounds.filter(r => scoredIds.has(r.id))
      const hasTeams = (t.tripPlayers || []).some(p => p.team_id)
      return {
        tripId: t.tripId,
        name: t.tripName,
        startDate: t.trip.start_date || null,
        endDate: t.trip.end_date || null,
        status: tripTimeStatus(t.trip, now),
        format: teamFormatName(t.trip, hasTeams),
        players: (t.tripPlayers || []).filter(isPerson).length,
        rounds: playedRounds.length,
        courses: [...new Set(rounds.map(roundCourseName).filter(Boolean))],
        winner: tripWinner(t, now),
      }
    })
    .sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')))

  const allCourses = new Set(trips.flatMap(t => t.courses))
  const years = trips.map(t => t.startDate?.slice(0, 4)).filter(Boolean).sort()
  const formats = new Set(perTrip.map(t => formatOf(t.trip)).filter(Boolean))

  // Group records: who holds the best of each, with where (tap to see).
  const records = [
    { id: 'lowGross', label: 'Lowest round', note: 'gross, 18 holes', hi: false, rec: record(members, m => m.detail.gross.best && { v: m.detail.gross.best.total, where: m.detail.gross.best }, { hi: false }) },
    { id: 'lowNet', label: 'Lowest net round', note: '18 holes', hi: false, rec: record(members, m => m.detail.net.best && { v: m.detail.net.best.total, where: m.detail.net.best }, { hi: false }) },
    { id: 'birdiesRound', label: 'Most birdies in a round', note: 'gross', rec: record(members, m => bestRoundBy(m.detail, r => r.birdies, true)) },
    { id: 'pointsRound', label: 'Most points in a round', note: 'Point Match Play', rec: record(members, m => m.detail.competition.formats.points?.bestRound && { v: m.detail.competition.formats.points.bestRound.points, where: m.detail.competition.formats.points.bestRound }) },
    { id: 'stablefordRound', label: 'Best Stableford round', rec: record(members, m => m.detail.competition.formats.stableford?.best && { v: m.detail.competition.formats.stableford.best.points, where: m.detail.competition.formats.stableford.best }) },
    { id: 'titles', label: 'Most trips won', rec: record(members, m => m.detail.competition.titles > 0 && { v: m.detail.competition.titles }) },
    { id: 'birdies', label: 'Most birdies', note: 'gross, all trips', rec: record(members, m => m.detail.gross.counts.birdies > 0 && { v: m.detail.gross.counts.birdies }) },
    { id: 'holes', label: 'Most holes played', rec: record(members, m => ({ v: m.detail.totals.holes })) },
  ].filter(r => r.rec)

  return {
    totals: {
      trips: trips.length,
      rounds: trips.reduce((a, t) => a + t.rounds, 0),
      players: members.length,
      courses: allCourses.size,
      firstYear: years[0] || null,
      lastYear: years[years.length - 1] || null,
    },
    members,
    viewerKey: viewer?.key || null,
    trips,
    records,
    formats,
    hasMatchPlay: formats.has('standard') || formats.has('points'),
  }
}

// One member's partners and opponents across both match play formats, combined.
export function rivalsOf(member) {
  const merge = lists => {
    const byKey = new Map()
    for (const p of lists.flat()) {
      const e = byKey.get(p.key) || { key: p.key, name: p.name, w: 0, t: 0, l: 0, matches: 0 }
      e.w += p.w; e.t += p.t; e.l += p.l; e.matches += p.matches
      byKey.set(p.key, e)
    }
    return [...byKey.values()]
  }
  const f = member?.detail?.competition?.formats || {}
  const partners = merge([f.standard?.partners || [], f.points?.partners || []])
    .sort((a, b) => b.w - a.w || (b.w - b.l) - (a.w - a.l) || a.name.localeCompare(b.name))
  const opponents = merge([f.standard?.opponents || [], f.points?.opponents || []])
    .sort((a, b) => b.l - a.l || (b.l - b.w) - (a.l - a.w) || a.name.localeCompare(b.name))
  return { partners, opponents }
}

