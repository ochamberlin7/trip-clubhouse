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

// Practice rounds never count toward tournament aggregations.
export function isTournamentRound(round) {
  return !round.round_type || round.round_type === 'tournament'
}

// Parse a display tee time ("7:45 AM") into minutes from midnight; null → 0.
export function parseTeeTimeToMinutes(str) {
  if (!str) return 0
  const m = String(str).match(/(\d+):(\d+)\s*(AM|PM)/i)
  if (!m) return 0
  let h = Number(m[1]); const min = Number(m[2]); const ap = m[3].toUpperCase()
  if (ap === 'PM' && h !== 12) h += 12
  if (ap === 'AM' && h === 12) h = 0
  return h * 60 + min
}

// A round is complete when every player assigned to a pairing for it has all
// 18 holes scored. `assignedByRound`: roundId -> Set(trip_player_id);
// `holesByRoundPlayer`: `${roundId}:${tpId}` -> Set(hole).
export function isRoundComplete(roundId, assignedByRound, holesByRoundPlayer) {
  const assigned = assignedByRound[roundId]
  if (!assigned || assigned.size === 0) return false
  for (const tp of assigned) {
    const holes = holesByRoundPlayer[`${roundId}:${tp}`]
    if (!holes || holes.size < 18) return false
  }
  return true
}

// The round currently being played today: started (within 30 min of tee_time_1)
// and not yet complete. If several are active, prefer the most recently started.
export function getActiveRound(rounds, ctx) {
  const now = new Date()
  const todayISO = now.toISOString().split('T')[0]
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  let best = null
  for (const r of rounds.filter(r => r.date === todayISO)) {
    if (isRoundComplete(r.id, ctx.assignedByRound, ctx.holesByRoundPlayer)) continue
    const tee = parseTeeTimeToMinutes(r.tee_time_1)
    if (nowMinutes >= tee - 30 && (!best || tee > best.tee)) best = { round: r, tee }
  }
  return best?.round || null
}

// Raw course handicap: handicap_index * (slope / 113), rounded.
export function courseHandicap(handicapIndex, slopeRating) {
  const hi = Number(handicapIndex) || 0
  const slope = Number(slopeRating) || 113
  return Math.round(hi * (slope / 113))
}

// Strokes on a hole given a PLAYING handicap (low-ball allowance already
// applied). Allows extra strokes for high handicaps: a 2nd at 18+SI, a 3rd
// at 36+SI.
export function strokesOnHole(playingHandicap, strokeIndex) {
  const ph = Number(playingHandicap) || 0
  if (ph <= 0 || strokeIndex == null) return 0
  let strokes = ph >= strokeIndex ? 1 : 0
  if (ph >= 18 + strokeIndex) strokes += 1
  if (ph >= 36 + strokeIndex) strokes += 1
  return strokes
}

// Low-ball handicap allowance for a group of players:
//   playing = round((courseHandicap - minCourseHandicap) * allowance/100)
// `players` is an array of { id, handicap_index }. Returns Map id -> playing.
export function computePlayingHandicaps(players, slopeRating, allowance = 100) {
  const chs = players.map(p => courseHandicap(p.handicap_index, slopeRating))
  const min = chs.length ? Math.min(...chs) : 0
  const map = new Map()
  players.forEach((p, i) => map.set(p.id, Math.round((chs[i] - min) * (allowance / 100))))
  return map
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
  includeRoundIds = null,
  allowance = 100
) {
  const hcpByPlayer = new Map(tripPlayers.map(p => [p.id, p.handicap_index]))
  const teamByPlayer = new Map(tripPlayers.map(p => [p.id, p.team_id]))
  const slopeByRound = new Map(rounds.map(r => [r.id, r.slope_rating]))

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

  // Players in each pairing group for a round (fallback: all round players).
  const groupsForRound = (r) => {
    const prs = pairingsByRound.get(r.id) || []
    return prs.length
      ? prs.map(pr => playersByPairing.get(pr.id) || [])
      : [[...(roundPlayers.get(r.id) || [])]]
  }

  // Low-ball playing handicaps per round (per pairing group + allowance).
  const playingByRound = new Map() // roundId -> Map(tp -> playingHandicap)
  for (const r of rounds) {
    const playing = new Map()
    for (const group of groupsForRound(r)) {
      const objs = group.map(tp => ({ id: tp, handicap_index: hcpByPlayer.get(tp) }))
      const phMap = computePlayingHandicaps(objs, slopeByRound.get(r.id), allowance)
      for (const [tp, ph] of phMap) playing.set(tp, ph)
    }
    playingByRound.set(r.id, playing)
  }

  const net = (roundId, tp, hole) => {
    const gross = scoreMap.get(`${roundId}:${tp}:${hole}`)
    if (gross == null) return null
    const si = holeInfo.get(`${roundId}:${hole}`)?.stroke_index
    const ph = playingByRound.get(roundId)?.get(tp) ?? 0
    return gross - strokesOnHole(ph, si)
  }

  const holeWinsByTeam = new Map()
  const pointsByPlayer = new Map()
  const vsParByPlayer = new Map()

  // Practice rounds save scores but never count in points/standings/best-net.
  const toProcess = rounds.filter(
    r => completeRoundIds.has(r.id) && isTournamentRound(r) && (!includeRoundIds || includeRoundIds.has(r.id))
  )

  for (const r of toProcess) {
    const groups = groupsForRound(r)

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

// Live better-ball match-play tally for one round, one row per pairing.
// Slots 1 & 2 are Team 1, slots 3 & 4 are Team 2 (mirrors ScoringTab's SLOT_TEAM).
// Mirrors ScoringTab's holeResult math: low-ball playing handicaps within each
// pairing, best net per side, the hole goes to the lower net (equal nets halve).
// Only holes where all four slots are filled AND every player has a gross score
// count — this matches what the on-screen scorecard shows.
//
// Inputs:
//   round          : the round row (uses round.holes[].par/.handicap and slope_rating)
//   pairings       : [{ id, round_id, pairing_number }] (any rounds; filtered here)
//   pairingPlayers : [{ pairing_id, trip_player_id, team_slot }]
//   scoresMap      : `${roundId}:${tpId}:${hole}` -> gross_score
//   hcpByPlayer    : Map or object trip_player_id -> handicap_index
//   allowance      : handicap allowance % (default 100)
//
// Returns an array sorted by pairing_number, each:
//   { pairingNumber, t1pts, t2pts, holesScored, totalHoles, complete }
export function liveMatchTally(round, pairings, pairingPlayers, scoresMap, hcpByPlayer, allowance = 100) {
  if (!round) return []
  const holes = Array.isArray(round.holes) ? round.holes : null
  const totalHoles = holes?.length || 18
  const getHcp = (tp) => (hcpByPlayer instanceof Map ? hcpByPlayer.get(tp) : hcpByPlayer?.[tp])

  const roundPairings = pairings
    .filter(p => p.round_id === round.id)
    .sort((a, b) => a.pairing_number - b.pairing_number)

  return roundPairings.map(pairing => {
    // slot (1..4) -> trip_player_id
    const slotMap = {}
    pairingPlayers
      .filter(pp => pp.pairing_id === pairing.id)
      .forEach(pp => { slotMap[pp.team_slot] = pp.trip_player_id })

    const filled = [1, 2, 3, 4].map(s => slotMap[s])
    const allFilled = filled.every(Boolean)

    let t1pts = 0, t2pts = 0, holesScored = 0
    if (allFilled) {
      // Low-ball playing handicaps for the four players in this pairing.
      const objs = filled.map(id => ({ id, handicap_index: getHcp(id) }))
      const playing = computePlayingHandicaps(objs, round.slope_rating, allowance)

      const net = (tp, hole) => {
        const gross = scoresMap[`${round.id}:${tp}:${hole}`]
        if (gross == null) return null
        return gross - strokesOnHole(playing.get(tp) ?? 0, holes?.[hole - 1]?.handicap)
      }

      for (let hole = 1; hole <= totalHoles; hole++) {
        const t1 = [slotMap[1], slotMap[2]].map(tp => net(tp, hole))
        const t2 = [slotMap[3], slotMap[4]].map(tp => net(tp, hole))
        if (t1.some(n => n == null) || t2.some(n => n == null)) continue
        holesScored++
        const b1 = Math.min(...t1), b2 = Math.min(...t2)
        if (b1 < b2) t1pts++
        else if (b2 < b1) t2pts++
      }
    }

    return {
      pairingNumber: pairing.pairing_number,
      t1pts,
      t2pts,
      holesScored,
      totalHoles,
      complete: holesScored === totalHoles,
    }
  })
}
