import { analyzeScoring, playerName } from './scoring'
import { getTeamDisplayName } from './teamColors'

// Tournament purse: the losing team (fewer match-play holes won across completed
// rounds) pays the purse, split evenly among that team's players.
// A tie splits the bill across everyone. Standings reuse analyzeScoring's
// holeWinsByTeam (the same best-ball, complete-tournament-round math the
// leaderboard uses), so the purse always agrees with the standings shown
// elsewhere; an in-progress round doesn't count until it's complete.

// "$640", "$1,640", "$213.33" — thousands separators; drop a whole-dollar .00.
export function formatMoney(n) {
  const v = Number(n) || 0
  const whole = Number.isInteger(v)
  return v.toLocaleString('en-US', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })
}

// Pure standings → purse breakdown. Expects exactly two teams (the app's model).
//   teams:          [{ id, name, team_index, color_index }]
//   tripPlayers:    [{ id, team_id, name }]   (name already resolved)
//   holeWinsByTeam: Map(team_id -> holesWon)
//   amount:         purse amount (number; 0/empty = not set)
export function computePurse({ teams = [], tripPlayers = [], holeWinsByTeam = new Map(), amount = 0 }) {
  if (teams.length !== 2) return { valid: false }

  const rowFor = t => ({
    id: t.id,
    name: getTeamDisplayName(t),
    holesWon: holeWinsByTeam.get(t.id) || 0,
    players: tripPlayers.filter(p => p.team_id === t.id).sort((a, b) => (a.name || '').localeCompare(b.name || '')),
  })
  const [a, b] = [rowFor(teams[0]), rowFor(teams[1])]

  const tied = a.holesWon === b.holesWon
  const losing = tied ? null : (a.holesWon < b.holesWon ? a : b)
  const splitPlayers = tied ? [...a.players, ...b.players] : (losing?.players || [])
  const splitCount = splitPlayers.length
  const amt = Number(amount) || 0
  const perShare = amt > 0 && splitCount > 0 ? amt / splitCount : 0

  return {
    valid: true,
    tied,
    teamA: a,
    teamB: b,
    losingTeamId: losing?.id || null,
    losingTeamName: losing?.name || null,
    splitPlayers: splitPlayers.map(p => ({ id: p.id, name: p.name })),
    splitCount,
    perShare,
    amount: amt,
  }
}

// Fetch everything needed to compute purse standings for a trip. Returns the raw
// pieces (callers pass `amount` into computePurse). `hasStandings` is true once a
// tournament round is complete; `hasRounds` is true if any tournament round exists.
export async function loadPurseStandings(supabase, tripId, allowance = 100) {
  const { data: rounds } = await supabase
    .from('rounds').select('id, date, holes, round_type, course_name, club_name, handicap_allowance').eq('trip_id', tripId)
  const roundIds = (rounds || []).map(r => r.id)

  const [teamsRes, tpRes] = await Promise.all([
    supabase.from('teams').select('id, name, team_index, color_index').eq('trip_id', tripId).order('team_index'),
    supabase.from('trip_players').select('id, user_id, first_name, last_name, guest_name, team_id, handicap_index').eq('trip_id', tripId),
  ])
  const teams = teamsRes.data || []
  const rawPlayers = tpRes.data || []

  const userIds = rawPlayers.map(p => p.user_id).filter(Boolean)
  const profileMap = {}
  if (userIds.length) {
    const { data: profs } = await supabase.from('profiles').select('id, display_name').in('id', userIds)
    if (profs) profs.forEach(p => { profileMap[p.id] = p.display_name })
  }
  const tripPlayers = rawPlayers.map(p => ({ ...p, name: playerName(p, profileMap) }))

  if (roundIds.length === 0) {
    return { teams, tripPlayers, holeWinsByTeam: new Map(), hasStandings: false, hasRounds: false }
  }

  const [scoresRes, pairingsRes, prRes] = await Promise.all([
    supabase.from('scores').select('round_id, hole_number, trip_player_id, gross_score').in('round_id', roundIds),
    supabase.from('pairings').select('id, round_id, pairing_number').in('round_id', roundIds),
    supabase.from('player_rounds').select('trip_player_id, round_id, tee_name, slope, rating, par').in('round_id', roundIds),
  ])
  const pairings = pairingsRes.data || []
  const pairingIds = pairings.map(p => p.id)
  let pairingPlayers = []
  if (pairingIds.length) {
    const ppRes = await supabase.from('pairing_players').select('id, pairing_id, trip_player_id, team_slot').in('pairing_id', pairingIds)
    pairingPlayers = ppRes.data || []
  }

  // Par + stroke index come from each round's holes JSON (course_holes is unused).
  const courseHoles = []
  for (const r of (rounds || [])) {
    if (!Array.isArray(r.holes)) continue
    r.holes.forEach((h, i) => courseHoles.push({
      round_id: r.id, hole_number: i + 1,
      par: h?.par ?? null,
      stroke_index: h?.stroke_index ?? h?.handicap ?? null,
    }))
  }

  const bundle = { rounds, scores: scoresRes.data || [], courseHoles, pairings, pairingPlayers, tripPlayers, playerRounds: prRes.data || [] }
  const { completeRoundIds, holeWinsByTeam } = analyzeScoring(bundle, null, allowance)

  return {
    teams,
    tripPlayers,
    holeWinsByTeam,
    hasStandings: completeRoundIds.size > 0,
    hasRounds: (rounds || []).some(r => r.round_type !== 'none'),
  }
}
