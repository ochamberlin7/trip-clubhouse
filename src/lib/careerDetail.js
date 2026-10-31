// Career page — one player's full numbers across every trip they've played.
// Reuses the shared math instead of copying it:
//   • totals (trips / rounds / holes) and points → buildCareer (same as Home)
//   • score counts (aces … triples), points, defended → computePlayerStats per trip
//   • net strokes → netShotsByRound (the scorecard dots / Leaderboard strokes)
//   • match results → matchPairingOutcomes (the scorecard / Leaderboard decisions)
//   • Stableford / stroke play rounds → strokeRoundResult (the Leaderboard's math)
//   • finishes → tripFinishes (teams) + individualFinishes (individual formats)
// Net on this page always uses your FULL playing handicap (Owen, 2026-10-30), so
// "net" means the same on match-play, Stableford and stroke play trips. (A
// match-play trip's own Stats tab still uses shots off the low.)
// What's new here is only adding things up: scoring averages, par-3/4/5 averages,
// front/back nine, hardest holes, bounce-backs, the handicap trend, match records
// with each partner and opponent, Stableford and stroke play summaries, and the
// trip-by-trip list. Pure; tested in Node.
import { computePlayerStats, courseHolesFromRounds, netShotsByRound } from './playerStats.js'
import { buildCareer, tripFinishes, individualFinishes } from './careerStats.js'
import {
  strokesOnHole, matchPairingOutcomes, tripGameType, isIndividualGameType,
  roundHoleCount, roundCourseName, isPracticeRound, playerName, leaderboardRounds, strokeRoundResult,
} from './scoring.js'

const COUNT_KEYS = ['aces', 'albatrosses', 'eagles', 'birdies', 'pars', 'bogeys', 'doubles', 'triples']
const HARDEST = 6 // stroke index 1–6

const avg = (sum, n) => (n ? sum / n : null)
const meOf = (t, userId) => (t.tripPlayers || []).find(p => p.user_id === userId || p.claimed_user_id === userId)

function emptyMode() {
  return {
    counts: Object.fromEntries(COUNT_KEYS.map(k => [k, 0])),
    rounds: [],                         // complete 18-hole totals [{ total, front, back, tripName, course, date }]
    byPar: { 3: { sum: 0, vsPar: 0, n: 0 }, 4: { sum: 0, vsPar: 0, n: 0 }, 5: { sum: 0, vsPar: 0, n: 0 } },
    hard: { vsPar: 0, n: 0 },           // stroke index 1–6
    bounce: { chances: 0, made: 0 },    // par or better on the hole after a bogey or worse
  }
}

function finishMode(m) {
  const totals = m.rounds.map(r => r.total)
  const best = m.rounds.reduce((b, r) => (b == null || r.total < b.total ? r : b), null)
  const worst = m.rounds.reduce((w, r) => (w == null || r.total > w.total ? r : w), null)
  const par = k => ({ avg: avg(m.byPar[k].sum, m.byPar[k].n), vsPar: avg(m.byPar[k].vsPar, m.byPar[k].n), holes: m.byPar[k].n })
  return {
    counts: m.counts,
    roundsCounted: totals.length,
    average: avg(totals.reduce((a, b) => a + b, 0), totals.length),
    best, worst,
    byPar: { 3: par(3), 4: par(4), 5: par(5) },
    front: avg(m.rounds.reduce((a, r) => a + r.front, 0), m.rounds.length),
    back: avg(m.rounds.reduce((a, r) => a + r.back, 0), m.rounds.length),
    hardest: avg(m.hard.vsPar, m.hard.n),
    bounceBack: m.bounce.chances ? m.bounce.made / m.bounce.chances : null,
    bounceChances: m.bounce.chances,
  }
}

// One person across trips: their account if they have one, else their name
// (guest slots on different trips can't be linked any other way).
// The Competition tab's formats, in pill order.
export const FORMAT_KEYS = ['standard', 'points', 'stableford', 'stroke']
export const FORMAT_NAMES = { standard: 'Standard Match Play', points: 'Point Match Play', stableford: 'Stableford', stroke: 'Stroke Play' }
function formatKey(trip, gameType) {
  if (gameType === 'match') return trip?.format === 'standard_match_play' ? 'standard' : 'points'
  return gameType === 'stableford' || gameType === 'stroke' ? gameType : null
}

// 1 for "Champion" / "Co-champion" / "Winner", else the number in "2nd place",
// "Tied for 3rd", "3rd of 8". null when there's no finish.
export function finishRank(label) {
  if (!label) return null
  if (/^(Champion|Co-champion|Winner)$/.test(label)) return 1
  const m = label.match(/(\d+)(st|nd|rd|th)/)
  return m ? Number(m[1]) : null
}

function personKey(tp) {
  const acct = tp.user_id || tp.claimed_user_id
  return acct ? `u:${acct}` : `n:${playerName(tp).toLowerCase()}`
}

// perTrip: rows from loadCareerData. Returns everything the Career page shows.
export function buildCareerDetail(perTrip = [], userId, now = new Date()) {
  const base = buildCareer(perTrip, userId)
  const finishes = new Map([...tripFinishes(perTrip, userId, now), ...individualFinishes(perTrip, userId, now)])
  const gross = emptyMode(), net = emptyMode()
  const handicap = []
  const trips = []
  const sf = { trips: 0, points: 0, rounds: [] }   // Stableford: complete counting rounds
  const sp = { trips: 0, rounds: [] }              // stroke play: complete counting rounds
  // Match play, kept apart per format (Standard vs Point). Records are win / tie / loss.
  const newMatch = () => ({ trips: 0, points: 0, defended: 0, rounds: new Set(), record: { w: 0, t: 0, l: 0 }, partners: new Map(), opponents: new Map(), bestRound: null })
  const mp = { standard: newMatch(), points: newMatch() }
  const bump = (map, tp, res) => {
    const k = personKey(tp)
    const e = map.get(k) || { key: k, name: playerName(tp), w: 0, t: 0, l: 0, matches: 0 }
    e[res]++; e.matches++
    map.set(k, e)
  }

  for (const t of perTrip) {
    const me = meOf(t, userId)
    if (!me) continue
    const myScores = (t.scores || []).filter(s => s.trip_player_id === me.id && s.gross_score != null)
    if (!myScores.length) continue

    const gameType = tripGameType(t.trip)
    const fmt = formatKey(t.trip, gameType)
    const courseHoles = courseHolesFromRounds(t.rounds || [])
    const bundle = { ...t, courseHoles, drinks: [] }
    const allowance = t.allowance ?? 100

    // Score counts, points and defended: the Stats tab's own numbers for this trip.
    const mine = computePlayerStats(bundle, allowance, { gameType, fullHandicapNet: true }).stats.get(me.id)
    if (mine) {
      for (const k of COUNT_KEYS) {
        // computePlayerStats' eagles include albatrosses; the Career table lists them apart.
        const g = k === 'eagles' ? mine.gross.eagles - mine.gross.albatrosses : mine.gross[k]
        const n = k === 'eagles' ? mine.net.eagles - mine.net.albatrosses : mine.net[k]
        gross.counts[k] += g || 0
        if (k !== 'aces') net.counts[k] += n || 0
      }
      if (mp[fmt]) {
        mp[fmt].points += mine.primary || 0     // Standard: holes won; Point: points won
        mp[fmt].defended += mine.defended || 0
      }
    }

    if (me.handicap_index != null && me.handicap_index !== '') {
      handicap.push({ tripId: t.tripId, tripName: t.tripName, date: t.trip?.start_date || null, index: Number(me.handicap_index) })
    }

    // Hole by hole, in order, for averages / bounce-backs / round totals.
    const shots = netShotsByRound(t, allowance, { fullHandicap: true })
    const gByKey = new Map(myScores.map(s => [`${s.round_id}:${s.hole_number}`, s.gross_score]))
    const roundsList = []
    const sortedRounds = [...(t.rounds || [])].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
    for (const r of sortedRounds) {
      const holes = courseHoles.filter(h => h.round_id === r.id).sort((a, b) => a.hole_number - b.hole_number)
      const ph = shots.get(r.id)?.get(me.id) ?? 0
      let scored = 0, gTot = 0, nTot = 0, gFront = 0, gBack = 0, nFront = 0, nBack = 0
      const prev = { g: null, n: null }
      for (const h of holes) {
        const g = gByKey.get(`${r.id}:${h.hole_number}`)
        if (g == null) { prev.g = null; prev.n = null; continue }
        const n = g - strokesOnHole(ph, h.stroke_index)
        scored++; gTot += g; nTot += n
        if (h.hole_number <= 9) { gFront += g; nFront += n } else { gBack += g; nBack += n }
        if (h.par == null) { prev.g = null; prev.n = null; continue }
        for (const [m, v, key] of [[gross, g, 'g'], [net, n, 'n']]) {
          const diff = v - h.par
          const slot = m.byPar[h.par]
          if (slot) { slot.sum += v; slot.vsPar += diff; slot.n++ }
          if (h.stroke_index != null && h.stroke_index <= HARDEST) { m.hard.vsPar += diff; m.hard.n++ }
          if (prev[key] != null && prev[key] >= 1) { m.bounce.chances++; if (diff <= 0) m.bounce.made++ }
          prev[key] = diff
        }
      }
      if (!scored) continue
      const holeCount = roundHoleCount(r)
      const complete18 = holes.length === 18 && scored === 18
      const where = { tripName: t.tripName, course: roundCourseName(r), date: r.date || null }
      if (complete18) {
        gross.rounds.push({ total: gTot, front: gFront, back: gBack, ...where })
        net.rounds.push({ total: nTot, front: nFront, back: nBack, ...where })
      }
      roundsList.push({ roundId: r.id, ...where, gross: gTot, net: nTot, holesScored: scored, holeCount, complete: scored >= holeCount, practice: isPracticeRound(r) })
    }

    // Stableford / stroke play: the Leaderboard's own round results (counting rounds only).
    let tripStableford = null, tripNetToPar = null
    if (isIndividualGameType(gameType)) {
      const scoresMap = {}, teeRowMap = {}, hcpByPlayer = { [me.id]: me.handicap_index }
      for (const sc of myScores) scoresMap[`${sc.round_id}:${me.id}:${sc.hole_number}`] = sc.gross_score
      for (const pr of t.playerRounds || []) if (pr.trip_player_id === me.id) teeRowMap[`${pr.round_id}:${me.id}`] = pr
      const target = gameType === 'stableford' ? sf : sp
      target.trips++
      for (const r of leaderboardRounds(t.rounds || [])) {
        const res = strokeRoundResult({ round: r, playerId: me.id, scoresMap, hcpByPlayer, teeRowMap, allowance })
        if (!res) continue
        const where = { tripName: t.tripName, course: roundCourseName(r), date: r.date || null, holes: res.totalHoles }
        if (gameType === 'stableford') {
          sf.points += res.points
          tripStableford = (tripStableford || 0) + res.points
          if (res.complete) sf.rounds.push({ points: res.points, ...where })
        } else if (res.netToPar != null) {
          tripNetToPar = (tripNetToPar || 0) + res.netToPar
          if (res.complete) sp.rounds.push({ netToPar: res.netToPar, net: res.net, ...where })
        }
      }
    }

    // Match records: finished matches only (every hole decided); the side that won
    // more holes wins. A Point Match Play round's best = your points in one full match.
    if (mp[fmt]) {
      const M = mp[fmt]
      M.trips++
      const byId = new Map((t.tripPlayers || []).map(p => [p.id, p]))
      const roundById = new Map((t.rounds || []).map(r => [r.id, r]))
      for (const { roundId, t1, t2, outcomes } of matchPairingOutcomes(bundle, allowance)) {
        const side = t1.includes(me.id) ? 1 : t2.includes(me.id) ? 2 : 0
        if (!side) continue
        if (outcomes.some(o => o.winner != null)) M.rounds.add(roundId)
        if (!outcomes.length || outcomes.some(o => o.winner == null)) continue
        const won1 = outcomes.filter(o => o.winner === 'T1').length
        const won2 = outcomes.filter(o => o.winner === 'T2').length
        const mineW = side === 1 ? won1 : won2, theirW = side === 1 ? won2 : won1
        const res = mineW > theirW ? 'w' : mineW < theirW ? 'l' : 't'
        M.record[res]++
        const mates = side === 1 ? t1 : t2, opps = side === 1 ? t2 : t1
        for (const id of mates) if (id !== me.id && byId.get(id)) bump(M.partners, byId.get(id), res)
        for (const id of opps) if (byId.get(id)) bump(M.opponents, byId.get(id), res)
        const myPts = outcomes.filter(o => (side === 1 ? o.winner === 'T1' && o.t1Winners.includes(me.id) : o.winner === 'T2' && o.t2Winners.includes(me.id))).length
        if (M.bestRound == null || myPts > M.bestRound.points) {
          const r = roundById.get(roundId)
          M.bestRound = { points: myPts, tripName: t.tripName, course: roundCourseName(r), date: r?.date || null }
        }
      }
    }

    const tripGross18 = roundsList.filter(r => r.holeCount === 18 && r.holesScored === 18).map(r => r.gross)
    trips.push({
      tripId: t.tripId,
      name: t.tripName,
      startDate: t.trip?.start_date || null,
      finish: finishes.get(t.tripId) || null,
      rounds: roundsList.filter(r => r.complete).length,
      average: avg(tripGross18.reduce((a, b) => a + b, 0), tripGross18.length),
      best: tripGross18.length ? Math.min(...tripGross18) : null,
      points: mp[fmt] ? (mine?.primary || 0) : null,
      stableford: tripStableford,
      netToPar: tripNetToPar,
      gameType,
      format: fmt,
      teams: !!me.team_id,
      roundsList,
    })
  }

  trips.sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')))
  handicap.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
  // Best partner: most wins, then best win share. Nemesis: the opponent who beat you most.
  const byBest = (a, b) => b.w - a.w || (b.w - b.l) - (a.w - a.l) || a.name.localeCompare(b.name)
  const byWorst = (a, b) => b.l - a.l || (b.l - b.w) - (a.l - a.w) || a.name.localeCompare(b.name)

  // Finishes per format: best finish (with its trip, for the tap-to-see pop-up) and trips won.
  const finished = trips.filter(t => t.finish && t.format)
  const placeOf = fmt => {
    const list = finished.filter(t => t.format === fmt)
    const best = list.reduce((b, t) => (b == null || finishRank(t.finish) < finishRank(b.finish) ? t : b), null)
    return {
      bestFinish: best ? { label: best.finish, tripName: best.name, date: best.startDate } : null,
      won: list.filter(t => finishRank(t.finish) === 1 && !/^(Co-champion|Tied)/.test(t.finish)).length,
    }
  }
  const matchOut = fmt => {
    const M = mp[fmt]
    if (!M.trips) return null
    return {
      trips: M.trips,
      rounds: M.rounds.size,
      record: M.record,
      points: M.points,
      defended: M.defended,
      perRound: M.rounds.size ? M.points / M.rounds.size : null,
      matchPoints: M.record.w + M.record.t / 2,
      matches: M.record.w + M.record.t + M.record.l,
      bestRound: M.bestRound,
      partners: [...M.partners.values()].sort(byBest),
      opponents: [...M.opponents.values()].sort(byWorst),
      ...placeOf(fmt),
    }
  }
  const sum = (a, b) => ({ w: a.w + b.w, t: a.t + b.t, l: a.l + b.l })

  return {
    totals: { trips: base.trips, rounds: base.rounds, holes: base.holes },
    gross: finishMode(gross),
    net: finishMode(net),
    handicap,
    competition: {
      // Trips won: team titles plus outright individual wins. Top 3: any finish 1st–3rd.
      titles: finished.filter(t => t.finish === 'Champion' || t.finish === 'Winner').length,
      top3: finished.filter(t => finishRank(t.finish) <= 3).length,
      tournamentTrips: trips.filter(t => t.format).length,
      finishes: finished.map(t => ({ tripId: t.tripId, name: t.name, startDate: t.startDate, format: t.format, teams: t.teams, finish: t.finish })),
      record: sum(mp.standard.record, mp.points.record),
      formats: {
        standard: matchOut('standard'),
        points: matchOut('points'),
        // Stableford "played to handicap" = 2 points a hole (36 on 18 holes).
        stableford: sf.trips ? {
          trips: sf.trips,
          points: sf.points,
          rounds: sf.rounds.length,
          perRound: avg(sf.rounds.reduce((a, r) => a + r.points, 0), sf.rounds.length),
          best: sf.rounds.reduce((b, r) => (b == null || r.points > b.points ? r : b), null),
          toHandicap: sf.rounds.filter(r => r.points >= 2 * r.holes).length,
          ...placeOf('stableford'),
        } : null,
        stroke: sp.trips ? {
          trips: sp.trips,
          rounds: sp.rounds.length,
          netToPar: avg(sp.rounds.reduce((a, r) => a + r.netToPar, 0), sp.rounds.length),
          best: sp.rounds.reduce((b, r) => (b == null || r.netToPar < b.netToPar ? r : b), null),
          ...placeOf('stroke'),
        } : null,
      },
    },
    trips,
  }
}
