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

// 'none' rounds are placeholders ("not decided yet") — hidden from scoring, the
// leaderboard, the live banner, the scoring round picker and tee times.
export function isNoneRound(round) {
  return round?.round_type === 'none'
}

// Display label for a trip's tournament format value. The legacy 'match_play'
// value (stored before the points/standard split) reads as Point Match Play.
export function tournamentFormatLabel(format) {
  switch (format) {
    case 'points_match_play':
    case 'match_play':
      return 'Point Match Play'
    case 'standard_match_play':
      return 'Standard Match Play'
    case 'stroke_play':
      return 'Stroke Play'
    default:
      return format ? format.replace(/_/g, ' ') : '—'
  }
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

// Net score for one hole: gross minus strokes given (stroke given when the hole's
// stroke index <= the player's playing handicap). The single source of truth for
// net used by every scorecard/match calculation — ScoringTab's on-screen nets,
// liveMatchTally (Points Match Play) and standardMatchTally (Standard Match Play)
// all go through here so they stay identical. Returns null when gross is missing.
export function netScore(gross, playingHandicap, strokeIndex) {
  if (gross == null) return null
  return gross - strokesOnHole(playingHandicap, strokeIndex)
}

// RAW (UNROUNDED) course handicap for a SPECIFIC tee — the WHS formula in full
// precision: handicap_index * (slope / 113) + (course_rating - par).
// slope defaults to neutral 113; the rating adjustment is dropped when rating or
// par is missing. Returns null when the index isn't a finite number.
// This unrounded value is the input to the Playing Handicap calc: per the
// official USGA/R&A rule the course handicap is rounded ONCE, at the Playing
// Handicap step (round(raw × allowance%)), NOT before the allowance is applied.
export function rawCourseHandicapForTee(handicapIndex, slope, rating, par) {
  const hi = Number(handicapIndex)
  if (!Number.isFinite(hi)) return null
  const sl = Number(slope) || 113
  const r = Number(rating)
  const p = Number(par)
  const ratingAdj = (Number.isFinite(r) && Number.isFinite(p)) ? (r - p) : 0
  return hi * (sl / 113) + ratingAdj
}

// The DISPLAYED Course Handicap: the raw value rounded to a whole number. Used
// for the Handicaps table's Course column (and net-double-bogey adjustments) —
// NOT as the input to the Playing Handicap calc (that uses the raw value above).
export function courseHandicapForTee(handicapIndex, slope, rating, par) {
  const raw = rawCourseHandicapForTee(handicapIndex, slope, rating, par)
  return raw == null ? null : Math.round(raw)
}

// Resolve the tee (slope / rating / par) a player is playing for a round.
// Priority: their player_rounds row → the round's default tee
// (slope_rating / course_rating / par_total, i.e. the commissioner-selected
// tee) → the first cached tee in round.tees → neutral defaults. So with no
// per-player tee set, the result matches the round's single round-level tee.
export function resolvePlayerTee(round, playerRoundRow) {
  // Course Handicap uses the "handicap par" (18-hole-equivalent) when a course
  // publishes one — it's course-wide (same across tees), so it overrides the
  // tee/row par used below. NULL → fall back to the actual par (par_total / hole
  // sum), so normal 18-hole courses are unchanged.
  const hcpPar = round?.handicap_par
  if (playerRoundRow && playerRoundRow.slope != null) {
    return { slope: playerRoundRow.slope, rating: playerRoundRow.rating, par: hcpPar ?? playerRoundRow.par }
  }
  const firstTee = Array.isArray(round?.tees) && round.tees.length ? round.tees[0] : null
  const holesPar = Array.isArray(round?.holes) && round.holes.length
    ? round.holes.reduce((sum, h) => sum + (h?.par || 0), 0)
    : null
  return {
    slope: round?.slope_rating ?? firstTee?.slope ?? 113,
    rating: round?.course_rating ?? firstTee?.rating ?? null,
    par: hcpPar ?? round?.par_total ?? firstTee?.par ?? holesPar,
  }
}

// WHS better-ball "shots given" for a group (pairing). Per the official USGA/R&A
// rule, each player's PLAYING handicap = round(RAW unrounded course handicap ×
// allowance/100) — the course handicap is rounded ONCE, HERE, from the full-
// precision value (NOT from a pre-rounded course handicap). This is the absolute
// figure shown in the Schedule & Courses PLAYING column. Shots given (strokes
// received, i.e. stroke dots) are that minus the LOWEST playing handicap in the
// group, so the lowest player plays off scratch (0) — keeping dots, net scores
// and the SHOTS OFF column all in agreement.
// `entries` is an array of { id, ch } where `ch` is the RAW unrounded course
// handicap (rawCourseHandicapForTee); null → 0. Returns Map id -> shots.
export function shotsGivenFromCourseHandicaps(entries, allowance = 100) {
  const playing = entries.map(e => ({ id: e.id, ph: e.ch == null ? null : Math.round(e.ch * (allowance / 100)) }))
  const valid = playing.filter(p => p.ph != null).map(p => p.ph)
  const min = valid.length ? Math.min(...valid) : 0
  const map = new Map()
  for (const p of playing) map.set(p.id, p.ph == null ? 0 : Math.max(0, p.ph - min))
  return map
}

// Display name for a trip player (guest name, else profile display name).
// Canonical display name for a trip player. The trip_players first_name/last_name
// are the source of truth (what the Players page edits); guest_name covers players
// without those set, and the linked account's profiles.display_name is the last
// resort. Same precedence ScoringTab.loadPlayers() uses, so every surface agrees.
// NOTE: callers MUST select first_name, last_name (and guest_name) from
// trip_players, or edited names won't show.
export function playerName(tp, profileMap = {}) {
  if (!tp) return 'Unknown'
  const full = [tp.first_name, tp.last_name].filter(Boolean).join(' ')
  return full || tp.guest_name || profileMap[tp.user_id] || 'Unknown'
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
  { rounds, scores, courseHoles, pairings, pairingPlayers, tripPlayers, playerRounds = [] },
  includeRoundIds = null,
  allowance = 100
) {
  const hcpByPlayer = new Map(tripPlayers.map(p => [p.id, p.handicap_index]))
  const teamByPlayer = new Map(tripPlayers.map(p => [p.id, p.team_id]))
  const roundById = new Map(rounds.map(r => [r.id, r]))
  // Per-player tee per round: `${roundId}:${tpId}` -> player_rounds row.
  const teeRowByRoundPlayer = new Map()
  for (const pr of playerRounds) teeRowByRoundPlayer.set(`${pr.round_id}:${pr.trip_player_id}`, pr)

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

  // Low-ball playing handicaps per round (per pairing group + allowance), using
  // each player's individual tee (slope/rating/par) for their course handicap.
  const playingByRound = new Map() // roundId -> Map(tp -> playingHandicap)
  for (const r of rounds) {
    const round = roundById.get(r.id)
    const playing = new Map()
    for (const group of groupsForRound(r)) {
      const entries = group.map(tp => {
        const tee = resolvePlayerTee(round, teeRowByRoundPlayer.get(`${r.id}:${tp}`))
        return { id: tp, ch: rawCourseHandicapForTee(hcpByPlayer.get(tp), tee.slope, tee.rating, tee.par) }
      })
      const phMap = shotsGivenFromCourseHandicaps(entries, allowance)
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
// Works for any roster split per side (1v1, 1v2, 2v1, 2v2) — a side just needs at
// least one player. A hole counts once every present player on both sides has a
// gross score, matching what the on-screen scorecard shows.
//
// Inputs:
//   round          : the round row (uses round.holes[].par/.handicap and slope_rating)
//   pairings       : [{ id, round_id, pairing_number }] (any rounds; filtered here)
//   pairingPlayers : [{ pairing_id, trip_player_id, team_slot }]
//   scoresMap      : `${roundId}:${tpId}:${hole}` -> gross_score
//   hcpByPlayer    : Map or object trip_player_id -> handicap_index
//   allowance      : handicap allowance % (default 100)
//   teeRowMap      : `${roundId}:${tpId}` -> player_rounds row (per-player tee);
//                    missing entries fall back to the round's default tee
//
// Returns an array sorted by pairing_number, each:
//   { pairingNumber, t1pts, t2pts, holesScored, totalHoles, complete }
export function liveMatchTally(round, pairings, pairingPlayers, scoresMap, hcpByPlayer, allowance = 100, teeRowMap = {}) {
  if (!round) return []
  const holes = Array.isArray(round.holes) ? round.holes : null
  const totalHoles = holes?.length || 18
  const getHcp = (tp) => (hcpByPlayer instanceof Map ? hcpByPlayer.get(tp) : hcpByPlayer?.[tp])
  const getTeeRow = (tp) => (teeRowMap instanceof Map ? teeRowMap.get(`${round.id}:${tp}`) : teeRowMap?.[`${round.id}:${tp}`])

  const roundPairings = pairings
    .filter(p => p.round_id === round.id)
    .sort((a, b) => a.pairing_number - b.pairing_number)

  return roundPairings.map(pairing => {
    // slot (1..4) -> trip_player_id
    const slotMap = {}
    pairingPlayers
      .filter(pp => pp.pairing_id === pairing.id)
      .forEach(pp => { slotMap[pp.team_slot] = pp.trip_player_id })

    // Slots 1 & 2 are Team 1, slots 3 & 4 are Team 2. Support any roster size per
    // side (1v1, 1v2, 2v1, 2v2) — a side just needs at least one player.
    const t1Players = [slotMap[1], slotMap[2]].filter(Boolean)
    const t2Players = [slotMap[3], slotMap[4]].filter(Boolean)
    const hasMatch = t1Players.length > 0 && t2Players.length > 0

    let t1pts = 0, t2pts = 0, holesScored = 0
    if (hasMatch) {
      // Shots given per player (WHS better ball): playing HCP minus the pairing's
      // lowest — the same value the scorecard stroke dots use, so net matches dots.
      const entries = [...t1Players, ...t2Players].map(id => {
        const tee = resolvePlayerTee(round, getTeeRow(id))
        return { id, ch: rawCourseHandicapForTee(getHcp(id), tee.slope, tee.rating, tee.par) }
      })
      const playing = shotsGivenFromCourseHandicaps(entries, allowance)

      const net = (tp, hole) =>
        netScore(scoresMap[`${round.id}:${tp}:${hole}`], playing.get(tp) ?? 0, holes?.[hole - 1]?.handicap)

      for (let hole = 1; hole <= totalHoles; hole++) {
        // Best (lowest) net per side; a hole counts once every present player on
        // both sides has a gross. Lower net wins the hole, equal nets halve it.
        const t1 = t1Players.map(tp => net(tp, hole))
        const t2 = t2Players.map(tp => net(tp, hole))
        if (t1.some(n => n == null) || t2.some(n => n == null)) continue
        holesScored++
        const b1 = Math.min(...t1), b2 = Math.min(...t2)
        if (b1 < b2) t1pts++
        else if (b2 < b1) t2pts++
      }
    }

    // thru = holes where at least one of the pairing's players has a gross
    // (distinct from holesScored, which needs every present player scored).
    const all = [...t1Players, ...t2Players]
    let thru = 0
    for (let hole = 1; hole <= totalHoles; hole++) {
      if (all.some(id => scoresMap[`${round.id}:${id}:${hole}`] != null)) thru++
    }

    return {
      pairingNumber: pairing.pairing_number,
      // Real teams on each side (slots 1&2 = team1_id, slots 3&4 = team2_id), so
      // the leaderboard can attribute t1pts/t2pts to the actual teams instead of
      // assuming pairing side 1 is always teams[0]. Null on legacy/unbackfilled rows.
      team1_id: pairing.team1_id ?? null,
      team2_id: pairing.team2_id ?? null,
      t1pts,
      t2pts,
      thru,
      hasMatch,
      holesScored,
      totalHoles,
      complete: holesScored === totalHoles,
    }
  })
}

// Stroke index for a hole object, tolerant of the field name (round.holes uses
// `.handicap`; course_holes uses `.stroke_index`).
function strokeIndexOfHole(h) {
  if (h == null) return null
  return h.handicap ?? h.strokeIndex ?? h.stroke_index ?? null
}

// "wins" vs "win" — plural team names ("Buckeyes") read "Buckeyes win 3&2",
// singular ("Team 1") reads "Team 1 wins 3&2".
function winsWord(name) {
  return /s$/i.test((name || '').trim()) ? 'win' : 'wins'
}

// Traditional (Standard) match-play tally for one better-ball match.
//
// Rules: per hole take each team's best (lowest) net; the lower team net wins the
// hole (+1 to the running lead), equal nets halve (no change). Running lead is a
// signed integer from Team 1's perspective (+ = Team 1 up, − = Team 2 up). The
// match closes once a team's lead exceeds the holes remaining; a team that leads
// by exactly the holes remaining is "dormie". Net uses the shared netScore()
// helper (same playing HCP + stroke-index logic as ScoringTab's on-screen nets).
//
// Inputs:
//   holes   : array ordered by hole number (index 0 = hole 1); stroke index read
//             from .handicap / .strokeIndex / .stroke_index. Length = total holes.
//   players : [{ id, team, playingHandicap, grossByHole }]
//             team is 1|2 (or 'T1'|'T2'); grossByHole is an object/Map hole→gross
//             (missing hole = not yet scored).
//   teams   : { team1Name, team2Name } — actual display names (getTeamDisplayName).
//
// Returns:
//   { totalHoles, hasMatch,
//     results: [{ hole, winner:'T1'|'T2'|'halve'|null, lead, statusShort, leader:'T1'|'T2'|null, closed }],
//     status,        // overall string, e.g. "AS", "Buckeyes 2UP", "Team 1 Dormie 2", "Buckeyes win 3&2"
//     statusShort,   // overall short, e.g. "AS", "2UP", "Dormie 2", "3&2", "1UP"
//     leader, closed, closedAtHole, winner, finalMargin }
export function standardMatchTally(holes, players = [], teams = {}) {
  const list = Array.isArray(holes) ? holes : []
  const totalHoles = list.length || 18
  const team1Name = teams.team1Name || 'Team 1'
  const team2Name = teams.team2Name || 'Team 2'
  const nameOf = side => (side === 'T1' ? team1Name : team2Name)

  const onTeam = (p, n) => p.team === n || p.team === `T${n}`
  const t1 = players.filter(p => onTeam(p, 1))
  const t2 = players.filter(p => onTeam(p, 2))
  const hasMatch = t1.length > 0 && t2.length > 0

  const grossOf = (p, hole) => {
    const g = p.grossByHole instanceof Map ? p.grossByHole.get(hole) : p.grossByHole?.[hole]
    return g == null ? null : g
  }
  const bestNet = (side, hole) => {
    const si = strokeIndexOfHole(list[hole - 1])
    const nets = side.map(p => netScore(grossOf(p, hole), p.playingHandicap ?? 0, si))
    if (!nets.length || nets.some(n => n == null)) return null // hole not fully scored
    return Math.min(...nets)
  }

  const results = []
  let lead = 0            // + = Team 1 up
  let closed = false
  let closedAtHole = null
  let winner = null       // 'T1' | 'T2'
  let finalMargin = ''    // "3&2" | "1UP"

  for (let hole = 1; hole <= totalHoles; hole++) {
    const holesRemaining = totalHoles - hole // holes left AFTER this one

    if (closed) {
      // Match already decided — remaining holes carry the final result.
      results.push({ hole, winner: null, lead, statusShort: finalMargin, leader: winner, closed: true })
      continue
    }
    if (!hasMatch) {
      results.push({ hole, winner: null, lead, statusShort: null, leader: null, closed: false })
      continue
    }

    const b1 = bestNet(t1, hole)
    const b2 = bestNet(t2, hole)
    if (b1 == null || b2 == null) {
      results.push({ hole, winner: null, lead, statusShort: null, leader: null, closed: false })
      continue
    }

    let holeWinner = 'halve'
    if (b1 < b2) { lead += 1; holeWinner = 'T1' }
    else if (b2 < b1) { lead -= 1; holeWinner = 'T2' }

    const absLead = Math.abs(lead)
    const leader = lead > 0 ? 'T1' : lead < 0 ? 'T2' : null

    if (absLead > holesRemaining) {
      // Closed out: lead cannot be caught.
      closed = true
      closedAtHole = hole
      winner = leader
      finalMargin = holesRemaining === 0 ? `${absLead}UP` : `${absLead}&${holesRemaining}`
      results.push({ hole, winner: holeWinner, lead, statusShort: finalMargin, leader, closed: true })
      continue
    }

    let statusShort
    if (absLead === 0) statusShort = 'AS'
    else if (holesRemaining > 0 && absLead === holesRemaining) statusShort = `Dormie ${absLead}`
    else statusShort = `${absLead}UP`
    results.push({ hole, winner: holeWinner, lead, statusShort, leader, closed: false })
  }

  // Overall = the last hole that produced a real status (scored or closeout).
  const lastWithStatus = [...results].reverse().find(r => r.statusShort != null)
  let status = null
  let statusShort = null
  let overallLeader = null
  if (hasMatch && lastWithStatus) {
    statusShort = lastWithStatus.statusShort
    overallLeader = closed ? winner : lastWithStatus.leader
    if (closed) {
      status = `${nameOf(winner)} ${winsWord(nameOf(winner))} ${finalMargin}`
    } else if (statusShort === 'AS') {
      status = 'AS'
    } else {
      status = `${nameOf(overallLeader)} ${statusShort}` // "Buckeyes 2UP" / "Team 1 Dormie 2"
    }
  }

  return {
    totalHoles,
    hasMatch,
    results,
    status,
    statusShort,
    leader: overallLeader,
    closed,
    closedAtHole,
    winner,
    finalMargin,
  }
}

// Per-pairing Standard Match Play status for a round — mirrors liveMatchTally's
// signature and low-ball playing-handicap setup, but returns traditional
// match-play status (via standardMatchTally) instead of hole-point counts. Used
// by the live banner and the leaderboard so both share identical net/stroke math.
//
// Each returned row:
//   { pairingNumber, thru, totalHoles, hasMatch, complete, closed,
//     result: 'T1'|'T2'|'halve'|null,  // final match result; null until complete
//     leader: 'T1'|'T2'|null, statusShort, finalMargin, winner, lead }
//   thru     = holes with at least one gross entered by the pairing.
//   complete = match closed (decided) OR every hole fully scored.
export function liveStandardMatchTally(round, pairings, pairingPlayers, scoresMap, hcpByPlayer, allowance = 100, teeRowMap = {}) {
  if (!round) return []
  const holes = Array.isArray(round.holes) ? round.holes : null
  const totalHoles = holes?.length || 18
  const getHcp = (tp) => (hcpByPlayer instanceof Map ? hcpByPlayer.get(tp) : hcpByPlayer?.[tp])
  const getTeeRow = (tp) => (teeRowMap instanceof Map ? teeRowMap.get(`${round.id}:${tp}`) : teeRowMap?.[`${round.id}:${tp}`])

  const roundPairings = pairings
    .filter(p => p.round_id === round.id)
    .sort((a, b) => a.pairing_number - b.pairing_number)

  return roundPairings.map(pairing => {
    const slotMap = {}
    pairingPlayers.filter(pp => pp.pairing_id === pairing.id).forEach(pp => { slotMap[pp.team_slot] = pp.trip_player_id })
    const t1Players = [slotMap[1], slotMap[2]].filter(Boolean)
    const t2Players = [slotMap[3], slotMap[4]].filter(Boolean)
    const all = [...t1Players, ...t2Players]
    const hasMatch = t1Players.length > 0 && t2Players.length > 0

    // Shots given per player (WHS better ball): playing HCP minus the pairing's
    // lowest — the same value the scorecard stroke dots use, so net matches dots.
    const entries = all.map(id => {
      const tee = resolvePlayerTee(round, getTeeRow(id))
      return { id, ch: rawCourseHandicapForTee(getHcp(id), tee.slope, tee.rating, tee.par) }
    })
    const playing = shotsGivenFromCourseHandicaps(entries, allowance)

    const grossFor = id => {
      const o = {}
      for (let h = 1; h <= totalHoles; h++) { const g = scoresMap[`${round.id}:${id}:${h}`]; if (g != null) o[h] = g }
      return o
    }
    const players = [
      ...t1Players.map(id => ({ id, team: 1, playingHandicap: playing.get(id) ?? 0, grossByHole: grossFor(id) })),
      ...t2Players.map(id => ({ id, team: 2, playingHandicap: playing.get(id) ?? 0, grossByHole: grossFor(id) })),
    ]

    const tally = standardMatchTally(holes || [], players, {})

    // thru = holes where at least one of the pairing's players has a gross.
    let thru = 0
    for (let h = 1; h <= totalHoles; h++) {
      if (all.some(id => scoresMap[`${round.id}:${id}:${h}`] != null)) thru++
    }

    const lastLead = tally.results[totalHoles - 1]?.lead ?? 0
    const fullyScored = tally.results.every(r => r.statusShort != null)
    const complete = hasMatch && (tally.closed || fullyScored)
    let result = null
    if (complete) {
      if (tally.closed) result = tally.winner
      else result = lastLead > 0 ? 'T1' : lastLead < 0 ? 'T2' : 'halve'
    }

    return {
      pairingNumber: pairing.pairing_number,
      // Real teams on each side (slots 1&2 = team1_id, slots 3&4 = team2_id) so the
      // leaderboard attributes a 'T1'/'T2' result to the actual team, not teams[0]/[1].
      team1_id: pairing.team1_id ?? null,
      team2_id: pairing.team2_id ?? null,
      thru,
      totalHoles,
      hasMatch,
      complete,
      closed: tally.closed,
      result,
      leader: tally.leader,
      statusShort: tally.statusShort,
      finalMargin: tally.finalMargin,
      winner: tally.winner,
      lead: lastLead,
    }
  })
}

// Per-player count of holes they PERSONALLY won across all Standard Match Play
// rounds. The winning SIDE per hole is determined by standardMatchTally
// (identical net/stroke math to the live banner/leaderboard — halved and
// not-yet-fully-scored holes count for nobody, and holes after a match is closed
// out aren't contested). But the hole is credited only to the winning side's
// best-net player(s) — the one whose net won it, or BOTH if the teammates tie
// for the side's best net — NOT to both players unconditionally (which
// over-counted). This is the same low-ball attribution as matchPlayPointsByPlayer.
// Takes the same data bundle as analyzeScoring. Returns Map(trip_player_id -> holesWon).
export function standardHolesWonByPlayer(
  { rounds, scores, courseHoles, pairings, pairingPlayers, tripPlayers, playerRounds = [] },
  allowance = 100
) {
  const hcpByPlayer = new Map(tripPlayers.map(p => [p.id, p.handicap_index]))
  const roundById = new Map(rounds.map(r => [r.id, r]))
  const teeRowByRoundPlayer = new Map()
  for (const pr of playerRounds) teeRowByRoundPlayer.set(`${pr.round_id}:${pr.trip_player_id}`, pr)

  // Holes per round (ordered 1..N) from course_holes, for strokeIndexOfHole().
  const holesByRound = new Map() // roundId -> [{ hole_number, stroke_index, par }]
  for (const ch of courseHoles) {
    if (!holesByRound.has(ch.round_id)) holesByRound.set(ch.round_id, [])
    holesByRound.get(ch.round_id).push(ch)
  }
  for (const arr of holesByRound.values()) arr.sort((a, b) => a.hole_number - b.hole_number)

  // Gross lookup: `${roundId}:${tpId}:${hole}` -> gross.
  const scoreMap = {}
  for (const s of scores) if (s.gross_score != null) scoreMap[`${s.round_id}:${s.trip_player_id}:${s.hole_number}`] = s.gross_score

  const pairingsByRound = new Map()
  for (const pr of pairings) {
    if (!pairingsByRound.has(pr.round_id)) pairingsByRound.set(pr.round_id, [])
    pairingsByRound.get(pr.round_id).push(pr)
  }
  const ppByPairing = new Map()
  for (const pp of pairingPlayers) {
    if (!ppByPairing.has(pp.pairing_id)) ppByPairing.set(pp.pairing_id, [])
    ppByPairing.get(pp.pairing_id).push(pp)
  }

  const holesWon = new Map()
  const credit = (tp) => holesWon.set(tp, (holesWon.get(tp) || 0) + 1)

  for (const r of rounds) {
    if (!isTournamentRound(r)) continue // practice/none rounds never count
    const round = roundById.get(r.id)
    const holes = holesByRound.get(r.id) || (Array.isArray(round?.holes) ? round.holes : [])
    if (!holes.length) continue
    const totalHoles = holes.length

    for (const pairing of (pairingsByRound.get(r.id) || [])) {
      const slotMap = {}
      for (const pp of (ppByPairing.get(pairing.id) || [])) slotMap[pp.team_slot] = pp.trip_player_id
      const t1Players = [slotMap[1], slotMap[2]].filter(Boolean)
      const t2Players = [slotMap[3], slotMap[4]].filter(Boolean)
      if (!t1Players.length || !t2Players.length) continue // need both sides for a match
      const all = [...t1Players, ...t2Players]

      // Low-ball playing handicaps (per-player tee), identical to liveStandardMatchTally.
      const entries = all.map(id => {
        const tee = resolvePlayerTee(round, teeRowByRoundPlayer.get(`${r.id}:${id}`))
        return { id, ch: rawCourseHandicapForTee(hcpByPlayer.get(id), tee.slope, tee.rating, tee.par) }
      })
      const playing = shotsGivenFromCourseHandicaps(entries, allowance)
      const grossFor = id => {
        const o = {}
        for (let h = 1; h <= totalHoles; h++) { const g = scoreMap[`${r.id}:${id}:${h}`]; if (g != null) o[h] = g }
        return o
      }
      const players = [
        ...t1Players.map(id => ({ id, team: 1, playingHandicap: playing.get(id) ?? 0, grossByHole: grossFor(id) })),
        ...t2Players.map(id => ({ id, team: 2, playingHandicap: playing.get(id) ?? 0, grossByHole: grossFor(id) })),
      ]

      const tally = standardMatchTally(holes, players, {})
      // Credit the hole only to the winning side's best-net player(s) (both if
      // teammates tie for low), not to both teammates unconditionally.
      const bestNetWinners = (side, holeNumber) => {
        const si = strokeIndexOfHole(holes[holeNumber - 1])
        let best = Infinity, winners = []
        for (const id of side) {
          const g = scoreMap[`${r.id}:${id}:${holeNumber}`]
          if (g == null) continue
          const n = g - strokesOnHole(playing.get(id) ?? 0, si)
          if (n < best) { best = n; winners = [id] }
          else if (n === best) winners.push(id)
        }
        return winners
      }
      for (const res of tally.results) {
        if (res.winner === 'T1') bestNetWinners(t1Players, res.hole).forEach(credit)
        else if (res.winner === 'T2') bestNetWinners(t2Players, res.hole).forEach(credit)
      }
    }
  }
  return holesWon
}

// Per-player Point Match Play points, computed hole-by-hole across every
// tournament round (partial rounds count their decided holes — mirrors
// standardHolesWonByPlayer, and unlike analyzeScoring it does NOT wait for a
// full 18-hole round). Within each 2-vs-2 pairing, on each hole:
//   • each side's best (lowest) net is taken over its players who have a score
//     (net = gross − strokesOnHole(low-ball playing handicap, hole's SI));
//   • the side with the strictly-lower best net wins the hole; an equal best net
//     is a halve; a side with no score yet leaves the hole undecided;
//   • a point is credited to each player on the winning side whose OWN net equals
//     that side's best (so both teammates score when tied for low).
// Practice / none rounds never count. Takes the same data bundle as
// analyzeScoring. Returns Map(trip_player_id -> points).
export function matchPlayPointsByPlayer(
  { rounds, scores, courseHoles, pairings, pairingPlayers, tripPlayers, playerRounds = [] },
  allowance = 100
) {
  const hcpByPlayer = new Map(tripPlayers.map(p => [p.id, p.handicap_index]))
  const roundById = new Map(rounds.map(r => [r.id, r]))
  const teeRowByRoundPlayer = new Map()
  for (const pr of playerRounds) teeRowByRoundPlayer.set(`${pr.round_id}:${pr.trip_player_id}`, pr)

  // Holes per round (ordered), for stroke index per hole.
  const holesByRound = new Map() // roundId -> [{ hole_number, stroke_index }]
  for (const ch of courseHoles) {
    if (!holesByRound.has(ch.round_id)) holesByRound.set(ch.round_id, [])
    holesByRound.get(ch.round_id).push(ch)
  }
  for (const arr of holesByRound.values()) arr.sort((a, b) => a.hole_number - b.hole_number)

  const scoreMap = {}
  for (const s of scores) if (s.gross_score != null) scoreMap[`${s.round_id}:${s.trip_player_id}:${s.hole_number}`] = s.gross_score

  const pairingsByRound = new Map()
  for (const pr of pairings) {
    if (!pairingsByRound.has(pr.round_id)) pairingsByRound.set(pr.round_id, [])
    pairingsByRound.get(pr.round_id).push(pr)
  }
  const ppByPairing = new Map()
  for (const pp of pairingPlayers) {
    if (!ppByPairing.has(pp.pairing_id)) ppByPairing.set(pp.pairing_id, [])
    ppByPairing.get(pp.pairing_id).push(pp)
  }

  const points = new Map()
  const credit = tp => points.set(tp, (points.get(tp) || 0) + 1)

  for (const r of rounds) {
    if (!isTournamentRound(r)) continue
    const round = roundById.get(r.id)
    const holes = holesByRound.get(r.id)
      || (Array.isArray(round?.holes) ? round.holes.map((h, i) => ({ hole_number: i + 1, stroke_index: h?.stroke_index ?? h?.handicap })) : [])
    if (!holes.length) continue

    for (const pairing of (pairingsByRound.get(r.id) || [])) {
      const slotMap = {}
      for (const pp of (ppByPairing.get(pairing.id) || [])) slotMap[pp.team_slot] = pp.trip_player_id
      const t1 = [slotMap[1], slotMap[2]].filter(Boolean)
      const t2 = [slotMap[3], slotMap[4]].filter(Boolean)
      if (!t1.length || !t2.length) continue // need both sides for a match

      // Low-ball playing handicaps (per-player tee), identical to the scorecard.
      const entries = [...t1, ...t2].map(id => {
        const tee = resolvePlayerTee(round, teeRowByRoundPlayer.get(`${r.id}:${id}`))
        return { id, ch: rawCourseHandicapForTee(hcpByPlayer.get(id), tee.slope, tee.rating, tee.par) }
      })
      const playing = shotsGivenFromCourseHandicaps(entries, allowance)

      // Best (lowest) net for a side + the players who own it; scored=false when
      // nobody on the side has a score on this hole yet.
      const sideBest = (side, hole, si) => {
        let best = Infinity, winners = []
        for (const id of side) {
          const g = scoreMap[`${r.id}:${id}:${hole}`]
          if (g == null) continue
          const n = g - strokesOnHole(playing.get(id) ?? 0, si)
          if (n < best) { best = n; winners = [id] }
          else if (n === best) winners.push(id)
        }
        return { best, winners, scored: winners.length > 0 }
      }

      for (const h of holes) {
        const hole = h.hole_number
        const si = h.stroke_index ?? h.handicap
        const a = sideBest(t1, hole, si)
        const b = sideBest(t2, hole, si)
        if (!a.scored || !b.scored) continue // hole not yet decided
        if (a.best < b.best) a.winners.forEach(credit)
        else if (b.best < a.best) b.winners.forEach(credit)
        // equal best net → halved, no points
      }
    }
  }
  return points
}

// Per-player "on fire" stats across all rounds — matches the scorecard's fire
// display: a hole is flagged once a player has 3+ CONSECUTIVE net par-or-better
// holes (the 3rd hole onward is lit, never retroactively holes 1–2). Net uses the
// pairing's low-ball shots given (same as the scorecard's dots/nets); a net
// bogey-or-worse breaks the run, an unscored hole pauses it (not flagged, but the
// underlying run isn't reset). Returns Map(tpId -> { maxStreak, fireHolesTotal }):
//   • maxStreak       = longest consecutive run of FLAGGED holes in any single
//                       round (streaks never carry between rounds)
//   • fireHolesTotal  = total flagged holes summed across every round
// Takes the same data bundle as analyzeScoring.
export function fireStatsByPlayer(
  { rounds, scores, courseHoles, pairings, pairingPlayers, tripPlayers, playerRounds = [] },
  allowance = 100
) {
  const hcpByPlayer = new Map(tripPlayers.map(p => [p.id, p.handicap_index]))
  const roundById = new Map(rounds.map(r => [r.id, r]))
  const teeRowByRoundPlayer = new Map()
  for (const pr of playerRounds) teeRowByRoundPlayer.set(`${pr.round_id}:${pr.trip_player_id}`, pr)

  const holesByRound = new Map() // roundId -> [{ hole_number, stroke_index, par }]
  for (const ch of courseHoles) {
    if (!holesByRound.has(ch.round_id)) holesByRound.set(ch.round_id, [])
    holesByRound.get(ch.round_id).push(ch)
  }
  for (const arr of holesByRound.values()) arr.sort((a, b) => a.hole_number - b.hole_number)

  const scoreMap = {}
  for (const s of scores) if (s.gross_score != null) scoreMap[`${s.round_id}:${s.trip_player_id}:${s.hole_number}`] = s.gross_score

  const pairingsByRound = new Map()
  for (const pr of pairings) {
    if (!pairingsByRound.has(pr.round_id)) pairingsByRound.set(pr.round_id, [])
    pairingsByRound.get(pr.round_id).push(pr)
  }
  const ppByPairing = new Map()
  for (const pp of pairingPlayers) {
    if (!ppByPairing.has(pp.pairing_id)) ppByPairing.set(pp.pairing_id, [])
    ppByPairing.get(pp.pairing_id).push(pp)
  }

  const stats = new Map()
  const ensure = tp => { let s = stats.get(tp); if (!s) { s = { maxStreak: 0, fireHolesTotal: 0 }; stats.set(tp, s) } return s }

  for (const r of rounds) {
    const round = roundById.get(r.id)
    const holes = holesByRound.get(r.id)
      || (Array.isArray(round?.holes) ? round.holes.map((h, i) => ({ hole_number: i + 1, stroke_index: h?.stroke_index ?? h?.handicap, par: h?.par })) : [])
    if (!holes.length) continue

    for (const pairing of (pairingsByRound.get(r.id) || [])) {
      const ids = (ppByPairing.get(pairing.id) || []).map(pp => pp.trip_player_id).filter(Boolean)
      if (!ids.length) continue
      // Low-ball playing handicaps for this pairing (per-player tee), identical to the scorecard.
      const entries = ids.map(id => {
        const tee = resolvePlayerTee(round, teeRowByRoundPlayer.get(`${r.id}:${id}`))
        return { id, ch: rawCourseHandicapForTee(hcpByPlayer.get(id), tee.slope, tee.rating, tee.par) }
      })
      const playing = shotsGivenFromCourseHandicaps(entries, allowance)

      for (const id of ids) {
        // Build the fire boolean array for this player/round (scorecard logic).
        const fire = new Array(holes.length).fill(false)
        let streak = 0
        for (let i = 0; i < holes.length; i++) {
          const h = holes[i]
          const g = scoreMap[`${r.id}:${id}:${h.hole_number}`]
          if (g == null) continue // unscored → pause (not flagged; run not reset)
          const par = h.par
          if (par == null) continue
          const net = g - strokesOnHole(playing.get(id) ?? 0, strokeIndexOfHole(h))
          if (net <= par) { streak++; if (streak >= 3) fire[i] = true }
          else streak = 0
        }
        // Aggregate: total flagged holes + longest consecutive flagged run this round.
        const s = ensure(id)
        let run = 0, best = 0, count = 0
        for (const f of fire) { if (f) { count++; run++; if (run > best) best = run } else run = 0 }
        s.fireHolesTotal += count
        if (best > s.maxStreak) s.maxStreak = best
      }
    }
  }
  return stats
}
