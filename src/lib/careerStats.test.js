// Career stats across trips + trip status helpers. Run: `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCareer } from './careerStats.js'
import { tripTimeStatus, daysUntilTrip, splitTrips, restoreDaysLeft } from './myTrips.js'

const HOLES = n => Array.from({ length: n }, (_, i) => ({ par: 4, handicap: i + 1 }))
const round = (id, holes = 18) => ({ id, round_type: 'tournament', holes: HOLES(holes), slope_rating: 113, course_rating: 72, par_total: 4 * holes })
// 2v2 trip where "me" (account U) is player A on team TA.
function trip(tripId, rid, { holes = 18, aGross = 4, playedHoles = holes } = {}) {
  const players = [
    { id: `${tripId}A`, user_id: 'U', claimed_user_id: 'U', handicap_index: 0, team_id: 'TA' },
    { id: `${tripId}B`, user_id: null, claimed_user_id: null, handicap_index: 0, team_id: 'TA' },
    { id: `${tripId}C`, user_id: 'X', claimed_user_id: 'X', handicap_index: 0, team_id: 'TB' },
    { id: `${tripId}D`, user_id: null, claimed_user_id: null, handicap_index: 0, team_id: 'TB' },
  ]
  const scores = []
  for (const p of players) for (let h = 1; h <= (p.id.endsWith('A') ? playedHoles : holes); h++) {
    scores.push({ round_id: rid, trip_player_id: p.id, hole_number: h, gross_score: p.id.endsWith('A') ? aGross : 5 })
  }
  return {
    tripId, allowance: 100, rounds: [round(rid, holes)], scores, playerRounds: [], tripPlayers: players,
    pairings: [{ id: `p${rid}`, round_id: rid, pairing_number: 1, team1_id: 'TA', team2_id: 'TB' }],
    pairingPlayers: players.map((p, i) => ({ pairing_id: `p${rid}`, trip_player_id: p.id, team_slot: i + 1 })),
  }
}

test('career sums trips, rounds and points; best round is the lowest gross 18', () => {
  const c = buildCareer([trip('T1', 'R1', { aGross: 4 }), trip('T2', 'R2', { aGross: 3 })], 'U')
  assert.equal(c.trips, 2)
  assert.equal(c.rounds, 2)
  assert.equal(c.points, 36)      // A wins every hole of both rounds
  assert.equal(c.bestRound, 54)   // 18 × 3
})

test('a 12-hole round counts as a round but not toward best 18-hole round', () => {
  const c = buildCareer([trip('T1', 'R1', { holes: 12 })], 'U')
  assert.equal(c.rounds, 1)
  assert.equal(c.bestRound, null)
})

test('unfinished round is not a round played; trips with no scores do not count', () => {
  const unfinished = buildCareer([trip('T1', 'R1', { playedHoles: 9 })], 'U')
  assert.equal(unfinished.trips, 1)
  assert.equal(unfinished.rounds, 0)
  assert.equal(unfinished.holes, 9)  // holes played still count the unfinished round
  const notMe = buildCareer([trip('T1', 'R1')], 'NOBODY')
  assert.deepEqual(notMe, { trips: 0, rounds: 0, holes: 0, points: 0, bestRound: null })
})

const T = (id, s, e, tz = 'America/Phoenix') => ({ id, start_date: s, end_date: e, time_zone: tz })
const at = iso => new Date(`${iso}T19:00:00Z`)

test('trip status, days until, and the live / upcoming / past split', () => {
  assert.equal(tripTimeStatus(T('a', '2027-03-12', '2027-03-15'), at('2027-03-01')), 'upcoming')
  assert.equal(tripTimeStatus(T('a', '2027-03-12', '2027-03-15'), at('2027-03-13')), 'live')
  assert.equal(tripTimeStatus(T('a', '2027-03-12', '2027-03-15'), at('2027-03-16')), 'past')
  assert.equal(tripTimeStatus({ id: 'nodates' }, at('2027-03-16')), 'upcoming')
  assert.equal(daysUntilTrip(T('a', '2027-03-12', '2027-03-15'), at('2027-03-01')), 11)
  const { live, upcoming, past } = splitTrips([
    T('old', '2026-05-01', '2026-05-04'), T('next', '2027-03-12', '2027-03-15'),
    T('later', '2027-10-01', '2027-10-04'), T('older', '2025-05-01', '2025-05-04'), T('now', '2026-10-26', '2026-10-28'),
  ], at('2026-10-27'))
  assert.deepEqual(live.map(t => t.id), ['now'])
  assert.deepEqual(upcoming.map(t => t.id), ['next', 'later'])
  assert.deepEqual(past.map(t => t.id), ['old', 'older'])
})

test('restoreDaysLeft: 30-day window, never negative', () => {
  const now = new Date('2026-10-27T12:00:00Z')
  assert.equal(restoreDaysLeft('2026-10-27T09:00:00Z', now), 30)
  assert.equal(restoreDaysLeft('2026-10-19T12:00:00Z', now), 22)
  assert.equal(restoreDaysLeft('2026-09-01T12:00:00Z', now), 0)
  assert.equal(restoreDaysLeft(null, now), null)
})
