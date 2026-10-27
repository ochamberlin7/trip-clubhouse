// Per-player trip stats — the ONE calculation behind the Stats tab tiles and the
// Home "Daily Leaders" card. Pass the rounds you want (the whole trip, or one
// day's completed rounds) plus the trip's rows. Pure; unit-testable in Node.
//
//   • primary: net best-ball match-play points (matchPlayPointsByPlayer).
//   • defended: Points Defended — halved holes saved alone (pointsDefendedByPlayer).
//   • gross / net: eagles, birdies, pars, pars-or-better, bogeys, doubles,
//     triples+, best and worst round — tracked independently per mode. Net uses
//     the scorecard's off-the-low match shots, so net birdies agree with the dots.
//   • best / worst round: complete 18-hole rounds only.
//   • vsPar: total strokes vs par over every scored hole that has a par (per mode).
import {
  matchPlayPointsByPlayer, pointsDefendedByPlayer, fireStatsByPlayer, resolvePlayerTee, rawCourseHandicapForTee, strokesOnHole, effectiveAllowance, shotsGivenFromCourseHandicaps,
} from './scoring.js'

// Off-low (match-play) shots per player per round, grouped by pairing — identical
// to the scorecard/match logic (shotsGivenFromCourseHandicaps): each player's
// playing handicap MINUS the pairing group's lowest, so the low player plays off
// scratch (0). Falls back to a single group of everyone who scored the round when
// no pairings exist. Returns Map(roundId -> Map(tripPlayerId -> shots)).
// { round_id, hole_number, par, stroke_index } rows from each round's holes JSON
// (index i = hole i+1). The course_holes table is never populated, so this is the
// source the scorecard, Stats and Daily Leaders all read.
export function courseHolesFromRounds(rounds = []) {
  const out = []
  for (const r of rounds) {
    if (!Array.isArray(r.holes)) continue
    r.holes.forEach((h, i) => out.push({
      round_id: r.id,
      hole_number: i + 1,
      par: h?.par ?? null,
      stroke_index: h?.stroke_index ?? h?.handicap ?? h?.strokeIndex ?? null,
    }))
  }
  return out
}

function offLowShotsByRound(rounds, { roundById, pairingsByRound, playersByPairing, scores, teeRowByRP, hcpById }, allowance) {
  const byRound = new Map()
  for (const r of rounds) {
    const round = roundById.get(r.id)
    const prs = pairingsByRound.get(r.id) || []
    let groups
    if (prs.length) {
      groups = prs.map(pr => playersByPairing.get(pr.id) || [])
    } else {
      const set = new Set()
      for (const s of scores) if (s.round_id === r.id && s.gross_score != null) set.add(s.trip_player_id)
      groups = [[...set]]
    }
    const shots = new Map()
    for (const group of groups) {
      const entries = group.map(tp => {
        const tee = resolvePlayerTee(round, teeRowByRP.get(`${r.id}:${tp}`))
        return { id: tp, ch: rawCourseHandicapForTee(hcpById.get(tp), tee.slope, tee.rating, tee.par) }
      })
      const m = shotsGivenFromCourseHandicaps(entries, effectiveAllowance(round, allowance))
      for (const [tp, v] of m) shots.set(tp, v)
    }
    byRound.set(r.id, shots)
  }
  return byRound
}

export function computePlayerStats({ rounds, scores, pairings, pairingPlayers, tripPlayers, playerRounds, drinks }, allowance) {
  // Hole par + stroke index live on rounds.holes — a positional JSON array where
  // index i is hole i+1 (par via `.par`, stroke index via `.handicap`). This is
  // the SAME source the scorecard reads. The course_holes table is never
  // populated by any code, so building hole info from it (as this function used
  // to) left every round with no holes → the per-round loop skipped everything
  // and all 12 cards showed "No data yet". Derive the { round_id, hole_number,
  // par, stroke_index } shape the scoring helpers expect from rounds.holes.
  const courseHoles = courseHolesFromRounds(rounds)

  // Card 1 value (mode-independent). Identical net best-ball point calc for both
  // tournament types — Standard Match Play labels it "Holes Won", Point Match
  // Play "Points Won". Accrues hole-by-hole across all tournament rounds: on each
  // decided hole the winning side's best-net player(s) score (both when tied).
  const bundle = { rounds, scores, courseHoles, pairings, pairingPlayers, tripPlayers, playerRounds }
  const primaryByPlayer = matchPlayPointsByPlayer(bundle, allowance)
  const defendedByPlayer = pointsDefendedByPlayer(bundle, allowance)
  // Fire stats (mode-independent, net-based) — matches the scorecard's fire display.
  const fireByPlayer = fireStatsByPlayer(bundle, allowance)

  // Lookups.
  const roundById = new Map(rounds.map(r => [r.id, r]))
  const hcpById = new Map(tripPlayers.map(p => [p.id, p.handicap_index]))
  const teeRowByRP = new Map()
  for (const pr of playerRounds) teeRowByRP.set(`${pr.round_id}:${pr.trip_player_id}`, pr)
  const holeInfo = new Map() // `${roundId}:${hole}` -> { par, stroke_index }
  for (const ch of courseHoles) holeInfo.set(`${ch.round_id}:${ch.hole_number}`, ch)
  const holesByRound = new Map() // roundId -> sorted [hole]
  for (const ch of courseHoles) {
    const arr = holesByRound.get(ch.round_id) || []
    arr.push(ch.hole_number); holesByRound.set(ch.round_id, arr)
  }
  for (const arr of holesByRound.values()) arr.sort((a, b) => a - b)
  const scoreMap = new Map()
  for (const s of scores) if (s.gross_score != null) scoreMap.set(`${s.round_id}:${s.trip_player_id}:${s.hole_number}`, s.gross_score)

  // Pairing lookups → off-low match shots per round (same basis as the scorecard
  // dots), so the Net cards below strike Ben on SI 1-7 (off the low man), not on
  // his full 90% playing handicap.
  const playersByPairing = new Map()
  for (const pp of pairingPlayers) {
    if (!playersByPairing.has(pp.pairing_id)) playersByPairing.set(pp.pairing_id, [])
    playersByPairing.get(pp.pairing_id).push(pp.trip_player_id)
  }
  const pairingsByRound = new Map()
  for (const pr of pairings) {
    if (!pairingsByRound.has(pr.round_id)) pairingsByRound.set(pr.round_id, [])
    pairingsByRound.get(pr.round_id).push(pr)
  }
  const shotsByRound = offLowShotsByRound(rounds, { roundById, pairingsByRound, playersByPairing, scores, teeRowByRP, hcpById }, allowance)

  // Six vs-par categories + best/worst round, tracked separately for gross and
  // net (never derived from each other).
  const emptyMode = () => ({ eagles: 0, birdies: 0, pars: 0, parsOrBetter: 0, bogeys: 0, doubles: 0, triples: 0, bestRound: null, worstRound: null, vsPar: null })
  const blank = () => ({ primary: 0, defended: 0, fireStreak: 0, fireHolesTotal: 0, gross: emptyMode(), net: emptyMode() })
  const stats = new Map(tripPlayers.map(p => [p.id, blank()]))
  for (const [tp, v] of primaryByPlayer) { if (stats.has(tp)) stats.get(tp).primary = v }
  for (const [tp, v] of defendedByPlayer) { if (stats.has(tp)) stats.get(tp).defended = v }
  for (const [tp, f] of fireByPlayer) { if (stats.has(tp)) { stats.get(tp).fireStreak = f.maxStreak; stats.get(tp).fireHolesTotal = f.fireHolesTotal } }

  const bucket = (m, diff) => {
    if (diff <= -2) m.eagles++
    else if (diff === -1) m.birdies++
    else if (diff === 0) m.pars++
    else if (diff === 1) m.bogeys++
    else if (diff === 2) m.doubles++
    else if (diff >= 3) m.triples++
    if (diff <= 0) m.parsOrBetter++
  }
  const noteRound = (m, total) => {
    if (m.bestRound == null || total < m.bestRound) m.bestRound = total
    if (m.worstRound == null || total > m.worstRound) m.worstRound = total
  }

  let anyScore = false
  for (const r of rounds) {
    const holes = holesByRound.get(r.id)
    if (!holes || holes.length === 0) continue
    const is18 = holes.length === 18
    for (const tp of tripPlayers) {
      const st = stats.get(tp.id)
      const ph = shotsByRound.get(r.id)?.get(tp.id) ?? 0
      let scoredHoles = 0, grossTotal = 0, netTotal = 0
      for (const hole of holes) {
        const gross = scoreMap.get(`${r.id}:${tp.id}:${hole}`)
        if (gross == null) continue
        anyScore = true
        const info = holeInfo.get(`${r.id}:${hole}`)
        const net = gross - strokesOnHole(ph, info?.stroke_index)
        scoredHoles++; grossTotal += gross; netTotal += net
        const par = info?.par
        if (par == null) continue // can't bucket vs-par without a par (round totals still count)
        bucket(st.gross, gross - par)
        bucket(st.net, net - par)
        st.gross.vsPar = (st.gross.vsPar ?? 0) + (gross - par)
        st.net.vsPar = (st.net.vsPar ?? 0) + (net - par)
      }
      // Best/Worst: complete 18-hole rounds only (round has 18 holes AND the
      // player scored all 18). Gross and net totals recorded independently, so a
      // player's best gross round and best net round can be different rounds.
      if (is18 && scoredHoles === 18) {
        noteRound(st.gross, grossTotal)
        noteRound(st.net, netTotal)
      }
    }
  }

  // Drink totals: per-hole drinks + manual tally.
  const drinkByPlayer = new Map()
  for (const d of drinks) drinkByPlayer.set(d.trip_player_id, (drinkByPlayer.get(d.trip_player_id) || 0) + (d.count || 0))

  return { stats, drinkByPlayer, anyScore }
}
