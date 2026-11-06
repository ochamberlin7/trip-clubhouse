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

// A trip's standings and winner, from the Leaderboard's own math:
//   standings: { kind: 'team' | 'player', lowWins, unit, rows: [{ name, total, rank, players? }] }
//              (null when nothing's been scored or there's no tournament)
//   winner:    the top team ("Team Ben", with its players) or player, once the trip
//              is over; null before that. Ties say "Tied: A & B".
// unit: 'points' (match play / Stableford: most wins), 'match points' (Standard
// Match Play), or 'net' (stroke play: net to par, lowest wins).
export function tripResult(t, now = new Date()) {
  const gt = tripGameType(t.trip)
  if (!gt) return { standings: null, winner: null }
  const over = tripTimeStatus(t.trip, now) === 'past'
  const players = (t.tripPlayers || []).filter(isPerson)
  const teams = t.teams || []
  const teamIds = [...new Set(players.map(p => p.team_id).filter(Boolean))]
  let standings = null
  let race = null
  const roundLabel = r => (r.date ? new Date(`${r.date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : 'Round')
  if (teamIds.length) {
    const st = teamStandingsFromRows({ format: t.trip.format, ...t, teamIds })
    race = raceFrom(st.rounds, st.ranked.map(r => {
      const tm = teams.find(x => x.id === r.teamId)
      return { id: r.teamId, name: getTeamDisplayName(tm || { team_index: '?' }), teamIndex: tm?.team_index ?? null, per: st.perRound.get(r.teamId), played: c => c && (c.scored > 0 || c.completed > 0), val: c => c?.pts ?? 0 }
    }), roundLabel, !!st.lowWins)
    if (st.lowWins ? st.anyScored : st.ranked.some(r => r.total > 0)) {
      standings = {
        kind: 'team',
        lowWins: !!st.lowWins,
        unit: st.lowWins ? 'net' : t.trip.format === 'standard_match_play' ? 'match points' : 'points',
        rows: st.ranked.map(r => ({
          id: r.teamId,
          name: getTeamDisplayName(teams.find(tm => tm.id === r.teamId) || { team_index: '?' }),
          total: r.total,
          rank: r.rank,
          players: players.filter(p => p.team_id === r.teamId).map(p => playerName(p)),
        })),
      }
    }
  } else if (isIndividualGameType(gt)) {
    const scoresMap = {}, teeRowMap = {}, hcpByPlayer = {}
    for (const sc of t.scores || []) if (sc.gross_score != null) scoresMap[`${sc.round_id}:${sc.trip_player_id}:${sc.hole_number}`] = sc.gross_score
    for (const pr of t.playerRounds || []) teeRowMap[`${pr.round_id}:${pr.trip_player_id}`] = pr
    for (const p of players) hcpByPlayer[p.id] = p.handicap_index
    const ist = individualStandings({ gameType: gt, rounds: t.rounds || [], playerIds: players.map(p => p.id), scoresMap, hcpByPlayer, teeRowMap, allowance: t.allowance ?? 100 })
    const { ranked } = ist
    const scored = ranked.filter(r => r.rank != null)
    race = raceFrom(ist.rounds, scored.map(r => {
      const p = players.find(x => x.id === r.id)
      return { id: r.id, key: personKey(p), name: playerName(p), per: ist.perRound.get(r.id), played: res => !!res, val: res => (res ? (gt === 'stroke' ? (res.netToPar ?? 0) : res.points) : 0) }
    }), roundLabel, gt === 'stroke')
    if (scored.length) {
      standings = {
        kind: 'player',
        lowWins: gt === 'stroke',
        unit: gt === 'stroke' ? 'net' : 'points',
        rows: scored.map(r => ({ id: r.id, name: playerName(players.find(p => p.id === r.id)), total: r.value, rank: r.rank })),
      }
    }
  }
  let winner = null
  if (over && standings) {
    const top = standings.rows.filter(r => r.rank === 1)
    const label = top.length > 1 ? `Tied: ${top.map(r => r.name).join(' & ')}` : top[0].name
    winner = standings.kind === 'team'
      ? { kind: 'team', tied: top.length > 1, label, players: top.flatMap(r => r.players) }
      : { kind: 'player', tied: top.length > 1, label, players: top.map(r => r.name) }
  }
  return { standings, winner, race: standings ? race : null }
}

// Running totals round by round for "How it was won": rounds up to the last one
// anyone played, one line per team / player (cumulative). lowWins: stroke play.
function raceFrom(rounds, entries, roundLabel, lowWins) {
  const ordered = [...rounds].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || (a.round_number || 0) - (b.round_number || 0))
  let last = -1
  ordered.forEach((r, i) => { if (entries.some(e => e.played(e.per?.get(r.id)))) last = i })
  if (last < 0) return null
  const used = ordered.slice(0, last + 1)
  const labels = used.map(roundLabel)
  const dupes = new Set(labels).size < labels.length // a 36-hole day: number the rounds instead
  return {
    lowWins,
    rounds: used.map((r, i) => ({ id: r.id, label: dupes ? `R${i + 1}` : labels[i] })),
    lines: entries.map(e => {
      let sum = 0
      return { id: e.id, key: e.key || null, name: e.name, teamIndex: e.teamIndex ?? null, values: used.map(r => (sum += e.val(e.per?.get(r.id)))) }
    }),
  }
}

// Who won a finished trip (see tripResult).
export function tripWinner(t, now = new Date()) {
  return tripResult(t, now).winner
}

// The leaderboard categories. Scoring ones are gross only (Owen 2026-11-06);
// match / Stableford ones are as the games were scored. hi: higher is better.
export const LEADERBOARDS = [
  { id: 'titles', label: 'Trips won', value: d => d.competition.titles },
  { id: 'avg', label: 'Scoring average', hi: false, fmt: 'one', value: d => d.gross.average },
  { id: 'best', label: 'Best round', hi: false, value: d => d.gross.best?.total ?? null, where: d => d.gross.best },
  { id: 'birdies', label: 'Birdies', value: d => d.gross.counts.birdies },
  { id: 'eagles', label: 'Eagles', value: d => d.gross.counts.eagles + d.gross.counts.albatrosses },
  { id: 'pars', label: 'Pars', value: d => d.gross.counts.pars },
  { id: 'wins', label: 'Match wins', value: d => d.competition.record.w, onlyIf: g => g.hasMatchPlay },
  { id: 'points', label: 'Points won', value: d => d.competition.formats.points?.points ?? null, onlyIf: g => g.formats.has('points') },
  { id: 'stableford', label: 'Stableford points', value: d => d.competition.formats.stableford?.points ?? null, onlyIf: g => g.formats.has('stableford') },
  { id: 'strokeNet', label: 'Stroke play net to par', hi: false, fmt: 'vsPar', note: 'per round, lowest first', value: d => d.competition.formats.stroke?.netToPar ?? null, onlyIf: g => g.formats.has('stroke') },
  { id: 'trips', label: 'Trips played', value: d => d.totals.trips },
  { id: 'rounds', label: 'Rounds', value: d => d.totals.rounds },
  { id: 'holes', label: 'Holes played', value: d => d.totals.holes },
]

// Ranked rows for one category: [{ member, v, rank, where }].
export function rankLeaderboard(group, id) {
  const def = LEADERBOARDS.find(l => l.id === id)
  if (!def) return []
  const whereOf = def.where
  const rows = rankRows(group.members, m => {
    const v = def.value(m.detail)
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
      const people = (t.tripPlayers || []).filter(isPerson)
      const { standings, winner, race } = tripResult(t, now)
      const sortedRounds = [...rounds].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || (a.round_number || 0) - (b.round_number || 0))
      return {
        tripId: t.tripId,
        name: t.tripName,
        startDate: t.trip.start_date || null,
        endDate: t.trip.end_date || null,
        status: tripTimeStatus(t.trip, now),
        format: teamFormatName(t.trip, hasTeams),
        players: people.length,
        // Rounds played; a trip that hasn't started shows the rounds on its schedule.
        rounds: playedRounds.length || (tripTimeStatus(t.trip, now) === 'upcoming' ? rounds.length : 0),
        playedRounds: playedRounds.length,
        courses: [...new Set(rounds.map(roundCourseName).filter(Boolean))],
        winner,
        // For the trip summary screen:
        location: [...new Set(rounds.map(r => [r.location_city, r.location_state].filter(Boolean).join(', ')).filter(Boolean))],
        roundList: sortedRounds.map(r => ({ id: r.id, date: r.date || null, course: roundCourseName(r) || 'Course TBD', practice: r.round_type === 'practice', played: scoredIds.has(r.id) })),
        playerNames: people.map(p => playerName(p)).sort((a, b) => a.localeCompare(b)),
        teams: hasTeams
          ? (t.teams || []).slice().sort((a, b) => (a.team_index || 0) - (b.team_index || 0))
            .map(tm => ({ id: tm.id, name: getTeamDisplayName(tm), teamIndex: tm.team_index ?? null, players: people.filter(p => p.team_id === tm.id).map(p => playerName(p)) }))
            .filter(tm => tm.players.length)
          : [],
        standings,
        race,
      }
    })
    .sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')))

  const allCourses = new Set(trips.flatMap(t => t.courses))
  const years = trips.map(t => t.startDate?.slice(0, 4)).filter(Boolean).sort()
  const formats = new Set(perTrip.map(t => formatOf(t.trip)).filter(Boolean))

  // Group records: who holds the best of each, with where (tap to see).
  const records = [
    { id: 'lowGross', label: 'Lowest round', note: 'gross, 18 holes', hi: false, rec: record(members, m => m.detail.gross.best && { v: m.detail.gross.best.total, where: m.detail.gross.best }, { hi: false }) },
    { id: 'birdiesRound', label: 'Most birdies in a round', note: 'gross', rec: record(members, m => bestRoundBy(m.detail, r => r.birdies, true)) },
    { id: 'pointsRound', label: 'Most points in a round', note: 'Point Match Play', rec: record(members, m => m.detail.competition.formats.points?.bestRound && { v: m.detail.competition.formats.points.bestRound.points, where: m.detail.competition.formats.points.bestRound }) },
    { id: 'stablefordRound', label: 'Best Stableford round', rec: record(members, m => m.detail.competition.formats.stableford?.best && { v: m.detail.competition.formats.stableford.best.points, where: m.detail.competition.formats.stableford.best }) },
    { id: 'strokeRound', label: 'Best stroke play round', note: 'net to par', fmt: 'vsPar', rec: record(members, m => m.detail.competition.formats.stroke?.best && { v: m.detail.competition.formats.stroke.best.netToPar, where: m.detail.competition.formats.stroke.best }, { hi: false }) },
    { id: 'titles', label: 'Most trips won', rec: record(members, m => m.detail.competition.titles > 0 && { v: m.detail.competition.titles }) },
    { id: 'birdies', label: 'Most birdies', note: 'gross, all trips', rec: record(members, m => m.detail.gross.counts.birdies > 0 && { v: m.detail.gross.counts.birdies }) },
    { id: 'holes', label: 'Most holes played', rec: record(members, m => ({ v: m.detail.totals.holes })) },
  ].filter(r => r.rec)

  return {
    totals: {
      trips: trips.length,
      rounds: trips.reduce((a, t) => a + t.playedRounds, 0),
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

// Head to head between every pair of members, as W–T–L from the row member's side.
//   mode 'matches': match play matches (both match formats, from rivalsOf).
//   mode 'rounds':  every full 18-hole round both played (any format, practice
//                   included): the lower NET score wins (full playing handicaps,
//                   so players of different abilities compare fairly); equal = tie.
// Returns { order: [member], cell(aKey, bKey) → { w, t, l } | null }.
export function headToHead(group, mode = 'rounds') {
  const order = [...group.members].sort((a, b) => (a.key === group.viewerKey ? -1 : b.key === group.viewerKey ? 1 : a.name.localeCompare(b.name)))
  const cells = new Map()
  const put = (a, b, rec) => cells.set(`${a}|${b}`, rec)
  if (mode === 'matches') {
    for (const m of order) for (const o of rivalsOf(m).opponents) put(m.key, o.key, { w: o.w, t: o.t, l: o.l })
  } else {
    const byMember = new Map(order.map(m => [m.key, new Map((m.detail.net.rounds || []).map(r => [r.roundId, r.total]))]))
    for (const a of order) for (const b of order) {
      if (a.key === b.key) continue
      const ra = byMember.get(a.key), rb = byMember.get(b.key)
      const rec = { w: 0, t: 0, l: 0 }
      for (const [id, va] of ra) { const vb = rb.get(id); if (vb == null) continue; if (va < vb) rec.w++; else if (va > vb) rec.l++; else rec.t++ }
      if (rec.w + rec.t + rec.l) put(a.key, b.key, rec)
    }
  }
  return { order, cell: (a, b) => cells.get(`${a}|${b}`) || null }
}

// One member's gross average on each of the group's trips (null when absent),
// trips oldest first — "You vs the crowd".
export function averagesByTrip(group) {
  const trips = [...group.trips].filter(t => t.status !== 'upcoming').reverse()
  return {
    trips: trips.map(t => ({ id: t.tripId, name: t.name, year: t.startDate?.slice(0, 4) || '' })),
    lines: group.members.map(m => ({
      key: m.key, name: m.name,
      values: trips.map(t => m.detail.trips.find(x => x.tripId === t.tripId)?.average ?? null),
    })),
  }
}
