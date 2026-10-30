// Career stats — one player's numbers added up across every trip they've played.
// Each trip runs through the SAME computePlayerStats as the Stats tab (no second
// copy of the math); this file only groups the rows by trip and sums the results.
// A player is matched across trips by their account (user_id / claimed_user_id),
// so a guest slot that was never claimed can't count toward anyone's career.
import { computePlayerStats, courseHolesFromRounds } from './playerStats.js'
import { roundHoleCount, teamStandingsFromRows, finishLabel } from './scoring.js'
import { tripTimeStatus } from './myTrips.js'

// perTrip: [{ tripId, rounds, scores, pairings, pairingPlayers, tripPlayers, playerRounds, allowance }]
// userId:  the account whose career this is.
// Returns { trips, rounds, holes, points, bestRound } — holes = every hole with a
// gross score (partial and 12-hole rounds count); bestRound is the lowest gross
// 18-hole total (null if none).
export function buildCareer(perTrip = [], userId) {
  const out = { trips: 0, rounds: 0, holes: 0, points: 0, bestRound: null }
  for (const t of perTrip) {
    const me = (t.tripPlayers || []).find(p => p.user_id === userId || p.claimed_user_id === userId)
    if (!me) continue
    const myScores = (t.scores || []).filter(s => s.trip_player_id === me.id && s.gross_score != null)
    if (!myScores.length) continue // signed up but never played → not a trip played yet
    out.trips++
    out.holes += myScores.length

    // Rounds played: every hole of the round scored.
    const holesByRound = new Map()
    for (const s of myScores) holesByRound.set(s.round_id, (holesByRound.get(s.round_id) || 0) + 1)
    for (const r of t.rounds || []) {
      const n = holesByRound.get(r.id) || 0
      if (n > 0 && n >= roundHoleCount(r)) out.rounds++
    }

    const { stats } = computePlayerStats({ ...t, courseHoles: courseHolesFromRounds(t.rounds || []), drinks: [] }, t.allowance ?? 100)
    const mine = stats.get(me.id)
    if (!mine) continue
    out.points += mine.primary || 0
    const best = mine.gross?.bestRound
    if (best != null && (out.bestRound == null || best < out.bestRound)) out.bestRound = best
  }
  return out
}

// Your team's finish on each finished team trip — "Champion", "2nd place", … —
// from the shared teamStandings (same math as the Leaderboard). Returns
// Map(tripId → label); trips with no teams, no team for you, or still going are skipped.
export function tripFinishes(perTrip = [], userId, now = new Date()) {
  const out = new Map()
  for (const t of perTrip) {
    if (!t.trip?.team_mode || tripTimeStatus(t.trip, now) !== 'past') continue
    const me = (t.tripPlayers || []).find(p => p.user_id === userId || p.claimed_user_id === userId)
    if (!me?.team_id) continue
    const st = teamStandingsFromRows({ format: t.trip.format, ...t })
    const { ranked } = st
    // Nothing scored → no finish yet. Stroke play totals can be 0 or below par, so
    // it asks "was anything played"; the other formats keep the points check.
    if (st.lowWins ? !st.anyScored : !ranked.some(r => r.total > 0)) continue
    const label = finishLabel(ranked, me.team_id)
    if (label) out.set(t.tripId, label)
  }
  return out
}

// Loads every trip's scoring rows in one batch and groups them per trip, ready
// for buildCareer and computeBadges (badges.js). `trips` = the player's trips ({ id, ... }); allowance comes
// from each trip row.
// Every row of a query, in pages. Supabase caps one request at 1,000 rows by
// default, and career data spans every trip's scores, so one request could come
// back short (missing badges / stats). The first page also asks for the total;
// any further pages are fetched in parallel. `build` returns a fresh query with a
// stable order each call.
const PAGE = 1000
export async function selectAllRows(build) {
  const first = await build({ count: 'exact' }).range(0, PAGE - 1)
  if (first.error) return first
  const rows = first.data || []
  const total = first.count ?? rows.length
  if (rows.length >= total || rows.length < PAGE) return { data: rows, error: null }
  const pages = []
  for (let from = rows.length; from < total; from += PAGE) pages.push(build().range(from, from + PAGE - 1))
  const rest = await Promise.all(pages)
  const err = rest.find(r => r.error)
  if (err) return { data: rows, error: err.error }
  return { data: rows.concat(...rest.map(r => r.data || [])), error: null }
}

export async function loadCareerData(client, tripIds = []) {
  if (!tripIds.length) return []
  const [tripsRes, roundsRes, playersRes] = await Promise.all([
    client.from('trips').select('id, name, start_date, end_date, time_zone, handicap_allowance, format, team_mode').in('id', tripIds),
    client.from('rounds').select('*').in('trip_id', tripIds),
    client.from('trip_players').select('id, trip_id, user_id, claimed_user_id, handicap_index, team_id, first_name, last_name, guest_name').in('trip_id', tripIds),
  ])
  const rounds = roundsRes.data || []
  const roundIds = rounds.map(r => r.id)
  let scores = [], pairings = [], playerRounds = [], pairingPlayers = [], drinks = []
  if (roundIds.length) {
    const [sc, pr, prr, dr] = await Promise.all([
      selectAllRows(opts => client.from('scores').select('round_id, hole_number, trip_player_id, gross_score', opts).in('round_id', roundIds)
        .order('round_id').order('trip_player_id').order('hole_number')),
      client.from('pairings').select('id, round_id, pairing_number, team1_id, team2_id').in('round_id', roundIds),
      client.from('player_rounds').select('trip_player_id, round_id, tee_name, slope, rating, par').in('round_id', roundIds),
      client.from('drinks').select('round_id, trip_player_id, count').in('round_id', roundIds),
    ])
    scores = sc.data || []; pairings = pr.data || []; playerRounds = prr.data || []; drinks = dr.data || []
    const pairIds = pairings.map(p => p.id)
    if (pairIds.length) {
      const pp = await client.from('pairing_players').select('id, pairing_id, trip_player_id, team_slot').in('pairing_id', pairIds)
      pairingPlayers = pp.data || []
    }
  }
  const tripById = new Map((tripsRes.data || []).map(t => [t.id, t]))
  const tripOfRound = new Map(rounds.map(r => [r.id, r.trip_id]))
  const pairingTrip = new Map(pairings.map(p => [p.id, tripOfRound.get(p.round_id)]))
  return tripIds.map(id => ({
    tripId: id,
    tripName: tripById.get(id)?.name || '',
    trip: tripById.get(id) || null,
    allowance: tripById.get(id)?.handicap_allowance ?? 100,
    rounds: rounds.filter(r => r.trip_id === id),
    scores: scores.filter(s => tripOfRound.get(s.round_id) === id),
    pairings: pairings.filter(p => tripOfRound.get(p.round_id) === id),
    pairingPlayers: pairingPlayers.filter(pp => pairingTrip.get(pp.pairing_id) === id),
    playerRounds: playerRounds.filter(pr => tripOfRound.get(pr.round_id) === id),
    drinks: drinks.filter(d => tripOfRound.get(d.round_id) === id),
    tripPlayers: (playersRes.data || []).filter(p => p.trip_id === id),
  }))
}
