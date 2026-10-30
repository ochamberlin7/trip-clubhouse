// Career page math (careerDetail.js). Run: `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCareerDetail } from './careerDetail.js'
import { buildCareer } from './careerStats.js'
import { computePlayerStats, courseHolesFromRounds } from './playerStats.js'

// Pars: front nine 4,4,3,5,4,4,3,5,4 (36) twice → par 72. Stroke index = hole number.
const PARS = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4]
const holesOf = n => PARS.slice(0, n).map((par, i) => ({ par, handicap: i + 1 }))
const round = (id, { n = 18, date = '2026-06-01', type = 'tournament', name = 'Pine Course' } = {}) =>
  ({ id, round_type: type, date, club_name: name, holes: holesOf(n), slope_rating: 113, course_rating: 72, par_total: 72 })

// Players: A = me (account U), B = partner (account P), C = opponent (account X), D = guest "Dan Smith".
// gross: { A: fn(hole, par) → score, ... } (default par for everyone). hcp: handicap index for A.
function trip(tripId, rounds, { gross = {}, start = '2026-06-01', hcp = 10, format = 'match_play', played = {} } = {}) {
  const players = [
    { id: `${tripId}A`, user_id: 'U', handicap_index: hcp, team_id: 'TA', first_name: 'Owen', last_name: 'C' },
    { id: `${tripId}B`, user_id: 'P', handicap_index: 0, team_id: 'TA', first_name: 'Ben', last_name: 'Cole' },
    { id: `${tripId}C`, user_id: 'X', handicap_index: 0, team_id: 'TB', first_name: 'Mike', last_name: 'Ross' },
    { id: `${tripId}D`, user_id: null, handicap_index: 0, team_id: 'TB', guest_name: 'Dan Smith' },
  ]
  const scores = []
  for (const r of rounds) for (const p of players) {
    const who = p.id.slice(-1)
    const upTo = played[who] ?? r.holes.length
    for (let h = 1; h <= upTo; h++) {
      const par = r.holes[h - 1].par
      scores.push({ round_id: r.id, trip_player_id: p.id, hole_number: h, gross_score: gross[who] ? gross[who](h, par) : par })
    }
  }
  const tour = rounds.filter(r => r.round_type === 'tournament')
  return {
    tripId, tripName: `Trip ${tripId}`, allowance: 100,
    trip: { id: tripId, name: `Trip ${tripId}`, start_date: start, end_date: start, format, team_mode: true },
    rounds, scores, playerRounds: [], tripPlayers: players, drinks: [],
    pairings: tour.map(r => ({ id: `p${r.id}`, round_id: r.id, pairing_number: 1, team1_id: 'TA', team2_id: 'TB' })),
    pairingPlayers: tour.flatMap(r => players.map((p, i) => ({ pairing_id: `p${r.id}`, trip_player_id: p.id, team_slot: i + 1 }))),
  }
}

test('totals match the Home career numbers, and holes count partial rounds', () => {
  const t1 = trip('T1', [round('R1')])
  const t2 = trip('T2', [round('R2', { n: 12 })], { played: { A: 7 } }) // 7 of 12 holes
  const d = buildCareerDetail([t1, t2], 'U')
  const home = buildCareer([t1, t2], 'U')
  assert.equal(d.totals.trips, home.trips)
  assert.equal(d.totals.rounds, home.rounds)
  assert.equal(d.totals.trips, 2)
  assert.equal(d.totals.rounds, 1)       // the 7-hole effort isn't a finished round
  assert.equal(d.totals.holes, 18 + 7)
})

test('score totals: ace, albatross and eagle are separate rows; ace also counts in its vs-par row', () => {
  // Hole 3 (par 3): ace. Hole 4 (par 5): 2 = albatross. Hole 8 (par 5): 3 = eagle.
  // Hole 1: birdie. Hole 2: bogey. Hole 5: double. Hole 6: triple. Rest par.
  const A = (h, par) => ({ 3: 1, 4: 2, 8: 3, 1: par - 1, 2: par + 1, 5: par + 2, 6: par + 3 })[h] ?? par
  const d = buildCareerDetail([trip('T1', [round('R1')], { gross: { A }, hcp: 0 })], 'U')
  const c = d.gross.counts
  assert.equal(c.aces, 1)
  assert.equal(c.albatrosses, 1)
  assert.equal(c.eagles, 2)               // the ace on a par 3 is an eagle too; the albatross is not
  assert.equal(c.birdies, 1)
  assert.equal(c.bogeys, 1)
  assert.equal(c.doubles, 1)
  assert.equal(c.triples, 1)
  assert.equal(c.albatrosses + c.eagles + c.birdies + c.pars + c.bogeys + c.doubles + c.triples, 18)
  assert.equal(d.net.counts.aces, 0)      // holes in one are gross only
})

test('Stats tab eagles still include albatrosses (unchanged)', () => {
  const A = (h, par) => (h === 4 ? 2 : par)
  const t = trip('T1', [round('R1')], { gross: { A } })
  const { stats } = computePlayerStats({ ...t, courseHoles: courseHolesFromRounds(t.rounds) }, 100)
  assert.equal(stats.get('T1A').gross.eagles, 1)
  assert.equal(stats.get('T1A').gross.albatrosses, 1)
})

test('scoring average, best / worst, par averages and front / back', () => {
  // Round 1: bogey every hole (90). Round 2: par every hole (72), back nine bogeys on par 3s.
  const r1 = round('R1', { date: '2026-06-01', name: 'North' }), r2 = round('R2', { date: '2026-06-02', name: 'South' })
  const A = (h, par) => par + 1
  const t = trip('T1', [r1, r2], { gross: { A }, hcp: 0 })
  t.scores = t.scores.map(s => (s.trip_player_id === 'T1A' && s.round_id === 'R2' ? { ...s, gross_score: PARS[s.hole_number - 1] + (s.hole_number > 9 && PARS[s.hole_number - 1] === 3 ? 1 : 0) } : s))
  const d = buildCareerDetail([t], 'U')
  assert.equal(d.gross.roundsCounted, 2)
  assert.equal(d.gross.best.total, 74)
  assert.equal(d.gross.best.course, 'South')
  assert.equal(d.gross.worst.total, 90)
  assert.equal(d.gross.average, 82)
  // Par 3s: 4 per round. R1 all +1 (4 holes), R2 front par (2) back +1 (2) → 6 over 8 holes.
  assert.equal(d.gross.byPar[3].vsPar, 6 / 8)
  assert.equal(d.gross.byPar[4].vsPar, 10 / 20)
  assert.equal(d.gross.front, (45 + 36) / 2)
  assert.equal(d.gross.back, (45 + 38) / 2)
})

test('bounce-back: par or better right after a bogey or worse', () => {
  // Holes 1 bogey, 2 par (bounce), 3 bogey, 4 bogey (miss, and a new chance), 5 birdie (bounce).
  const A = (h, par) => ({ 1: par + 1, 2: par, 3: par + 1, 4: par + 1, 5: par - 1 })[h] ?? par
  const d = buildCareerDetail([trip('T1', [round('R1')], { gross: { A }, hcp: 0 })], 'U')
  assert.equal(d.gross.bounceChances, 3)
  assert.equal(d.gross.bounceBack, 2 / 3)
})

test('hardest holes = stroke index 1–6', () => {
  const A = (h, par) => (h <= 6 ? par + 2 : par)
  const d = buildCareerDetail([trip('T1', [round('R1')], { gross: { A }, hcp: 0 })], 'U')
  assert.equal(d.gross.hardest, 2)
})

test('net uses the scorecard strokes: off the low in the pairing', () => {
  // A plays off 6 vs scratch partners → a stroke on SI 1–6. Bogeys there are net pars.
  const A = (h, par) => (h <= 6 ? par + 1 : par)
  const d = buildCareerDetail([trip('T1', [round('R1')], { gross: { A }, hcp: 6 })], 'U')
  assert.equal(d.gross.best.total, 78)
  assert.equal(d.net.best.total, 72)
  assert.equal(d.net.counts.pars, 18)
})

test('match record, best partner and nemesis follow the account across trips', () => {
  // Trip 1: A birdies everything → A/B beat C/D. Trip 2: C birdies everything → loss.
  const t1 = trip('T1', [round('R1')], { gross: { A: (h, p) => p - 1 }, hcp: 0 })
  const t2 = trip('T2', [round('R2')], { gross: { C: (h, p) => p - 1 }, hcp: 0, start: '2027-06-01' })
  const d = buildCareerDetail([t1, t2], 'U')
  assert.deepEqual(d.match.record, { w: 1, l: 1, h: 0 })
  assert.equal(d.match.points, 18)
  assert.equal(d.match.matchRounds, 2)
  const ben = d.match.partners.find(p => p.name === 'Ben Cole')
  assert.deepEqual([ben.w, ben.l, ben.matches], [1, 1, 2])  // same account on both trips → one row
  assert.equal(d.match.opponents.length, 2)                 // Mike (account) + Dan (guest, by name)
  assert.equal(d.match.opponents.find(p => p.name === 'Dan Smith').matches, 2)
})

test('unfinished matches are left out of the record', () => {
  const d = buildCareerDetail([trip('T1', [round('R1')], { played: { C: 10 } })], 'U')
  assert.deepEqual(d.match.record, { w: 0, l: 0, h: 0 })
})

test('handicap trend runs oldest to newest; trip list newest first', () => {
  const d = buildCareerDetail([
    trip('T2', [round('R2')], { start: '2025-05-01', hcp: 12.4 }),
    trip('T1', [round('R1')], { start: '2023-05-01', hcp: 14.2 }),
  ], 'U')
  assert.deepEqual(d.handicap.map(h => h.index), [14.2, 12.4])
  assert.deepEqual(d.trips.map(t => t.tripId), ['T2', 'T1'])
  assert.equal(d.trips[0].rounds, 1)
  assert.equal(d.trips[0].average, 72)
})

test('practice rounds count for scoring but have no match', () => {
  const d = buildCareerDetail([trip('T1', [round('R1', { type: 'practice' })], { hcp: 0 })], 'U')
  assert.equal(d.gross.roundsCounted, 1)
  assert.equal(d.match.matchRounds, 0)
  assert.equal(d.trips[0].roundsList[0].practice, true)
})

test('a player who never scored has an empty career', () => {
  const t = trip('T1', [round('R1')])
  t.scores = t.scores.filter(s => s.trip_player_id !== 'T1A')
  const d = buildCareerDetail([t], 'U')
  assert.equal(d.totals.trips, 0)
  assert.equal(d.gross.average, null)
  assert.equal(d.trips.length, 0)
})
