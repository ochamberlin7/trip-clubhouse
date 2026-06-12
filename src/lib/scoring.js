// Shared best-ball / net scoring logic for the Trip Clubhouse dashboard widgets.
//
// Live schema (verified against Supabase):
//   scores        : round_id, hole_number, trip_player_id, gross_score
//   course_holes  : round_id, hole_number, par, stroke_index
//   pairings      : id, round_id, pairing_number
//   pairing_players: id, pairing_id, trip_player_id
//   trip_players  : id, trip_id, user_id, guest_name, handicap_index, team_id
//   teams         : id, trip_id, name, color
//   profiles      : id, display_name

// Strokes a player receives on a hole given their (course) handicap and the
// hole's stroke index: one stroke if handicap >= stroke_index, a second on
// double-stroke holes (handicap >= 18 + stroke_index).
export function strokesGiven(handicap, strokeIndex) {
  const h = handicap ?? 0
  if (strokeIndex == null) return 0
  let s = 0
  if (h >= strokeIndex) s += 1
  if (h >= 18 + strokeIndex) s += 1
  return s
}

// Display name for a trip player (guest name, else profile display name).
export function playerName(tp, profileMap) {
  if (!tp) return 'Unknown'
  return tp.guest_name || profileMap[tp.user_id] || 'Unknown'
}

// Up-to-two-letter initials from a name.
export function initialsOf(name) {
  if (!name) return '—'
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

// First name only.
export function firstName(name) {
  if (!name) return ''
  return name.trim().split(/\s+/)[0]
}

// Core analyzer. Pass the raw rows for the rounds you care about plus the full
// trip_players list. `includeRoundIds` (a Set) restricts the win/points/par
// tallies to specific rounds; pass null to include every complete round.
//
// Returns:
//   completeRoundIds : Set of round ids where every round player has 18 scores
//   holeWinsByTeam   : Map teamId -> holes won
//   pointsByPlayer   : Map trip_player_id -> points
//   vsParByPlayer    : Map trip_player_id -> cumulative (net - par)
export function analyzeScoring(
  { rounds, scores, courseHoles, pairings, pairingPlayers, tripPlayers },
  includeRoundIds = null
) {
  const hcpByPlayer = new Map(tripPlayers.map(p => [p.id, p.handicap_index]))
  const teamByPlayer = new Map(tripPlayers.map(p => [p.id, p.team_id]))

  // course holes: `${roundId}:${hole}` -> { par, stroke_index }
  const holeInfo = new Map()
  for (const ch of courseHoles) holeInfo.set(`${ch.round_id}:${ch.hole_number}`, ch)

  // scores: `${roundId}:${tpId}:${hole}` -> gross ; and holes seen per player
  const scoreMap = new Map()
  const playerHoles = new Map() // `${roundId}:${tpId}` -> Set(hole)
  for (const s of scores) {
    if (s.gross_score == null) continue
    scoreMap.set(`${s.round_id}:${s.trip_player_id}:${s.hole_number}`, s.gross_score)
    const k = `${s.round_id}:${s.trip_player_id}`
    if (!playerHoles.has(k)) playerHoles.set(k, new Set())
    playerHoles.get(k).add(s.hole_number)
  }

  // pairing players: pairingId -> [tpId]
  const playersByPairing = new Map()
  for (const pp of pairingPlayers) {
    if (!playersByPairing.has(pp.pairing_id)) playersByPairing.set(pp.pairing_id, [])
    playersByPairing.get(pp.pairing_id).push(pp.trip_player_id)
  }
  // pairings: roundId -> [pairing]
  const pairingsByRound = new Map()
  for (const pr of pairings) {
    if (!pairingsByRound.has(pr.round_id)) pairingsByRound.set(pr.round_id, [])
    pairingsByRound.get(pr.round_id).push(pr)
  }

  // round players: from pairings, else fall back to distinct players in scores
  const roundPlayers = new Map()
  for (const r of rounds) {
    const set = new Set()
    const prs = pairingsByRound.get(r.id) || []
    if (prs.length) {
      for (const pr of prs) for (const tp of (playersByPairing.get(pr.id) || [])) set.add(tp)
    } else {
      for (const s of scores) if (s.round_id === r.id && s.gross_score != null) set.add(s.trip_player_id)
    }
    roundPlayers.set(r.id, set)
  }

  // completeness: every round player has 18 scored holes
  const completeRoundIds = new Set()
  for (const r of rounds) {
    const players = roundPlayers.get(r.id)
    if (!players || players.size === 0) continue
    let ok = true
    for (const tp of players) {
      const holes = playerHoles.get(`${r.id}:${tp}`)
      if (!holes || holes.size < 18) { ok = false; break }
    }
    if (ok) completeRoundIds.add(r.id)
  }

  const net = (roundId, tp, hole) => {
    const gross = scoreMap.get(`${roundId}:${tp}:${hole}`)
    if (gross == null) return null
    const si = holeInfo.get(`${roundId}:${hole}`)?.stroke_index
    return gross - strokesGiven(hcpByPlayer.get(tp), si)
  }

  const holeWinsByTeam = new Map()
  const pointsByPlayer = new Map()
  const vsParByPlayer = new Map()

  const toProcess = rounds.filter(
    r => completeRoundIds.has(r.id) && (!includeRoundIds || includeRoundIds.has(r.id))
  )

  for (const r of toProcess) {
    const prs = pairingsByRound.get(r.id) || []
    const groups = prs.length
      ? prs.map(pr => playersByPairing.get(pr.id) || [])
      : [[...(roundPlayers.get(r.id) || [])]]

    for (let hole = 1; hole <= 18; hole++) {
      const par = holeInfo.get(`${r.id}:${hole}`)?.par

      for (const groupPlayers of groups) {
        // best-ball net per team within this group
        const teamBest = new Map() // teamId -> { best, players: [{tp, net}] }
        for (const tp of groupPlayers) {
          const n = net(r.id, tp, hole)
          if (n == null) continue
          const team = teamByPlayer.get(tp)
          if (team == null) continue
          if (!teamBest.has(team)) teamBest.set(team, { best: Infinity, players: [] })
          const e = teamBest.get(team)
          if (n < e.best) { e.best = n; e.players = [{ tp, net: n }] }
          else if (n === e.best) e.players.push({ tp, net: n })
        }

        if (teamBest.size >= 2) {
          let winTeam = null, winBest = Infinity, tie = false
          for (const [team, e] of teamBest) {
            if (e.best < winBest) { winBest = e.best; winTeam = team; tie = false }
            else if (e.best === winBest) tie = true
          }
          if (!tie && winTeam != null) {
            holeWinsByTeam.set(winTeam, (holeWinsByTeam.get(winTeam) || 0) + 1)
            // a point to each winning-team player who had the team's best net
            for (const w of teamBest.get(winTeam).players) {
              pointsByPlayer.set(w.tp, (pointsByPlayer.get(w.tp) || 0) + 1)
            }
          }
        }
      }

      // cumulative net vs par for every round player
      if (par != null) {
        for (const tp of (roundPlayers.get(r.id) || [])) {
          const n = net(r.id, tp, hole)
          if (n == null) continue
          vsParByPlayer.set(tp, (vsParByPlayer.get(tp) || 0) + (n - par))
        }
      }
    }
  }

  return { completeRoundIds, holeWinsByTeam, pointsByPlayer, vsParByPlayer }
}

// Format a net-vs-par total: "E", "+3", "-2".
export function formatVsPar(value) {
  if (value === 0) return 'E'
  return value > 0 ? `+${value}` : `${value}`
}
