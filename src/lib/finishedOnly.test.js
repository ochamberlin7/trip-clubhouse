// Stats count finished trips and finished rounds only (finishedOnly in careerStats.js).
// Run: `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { finishedOnly, buildCareer, tripFinishes } from './careerStats.js'
import { buildCareerDetail } from './careerDetail.js'
import { buildGroupStats } from './groupStats.js'

const PARS = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4]
const round = (id, date) => ({ id, round_type: 'tournament', date, club_name: `Course ${id}`, holes: PARS.map((par, i) => ({ par, handicap: i + 1 })), slope_rating: 113, course_rating: 72, par_total: 72 })
// Owen (U) + Ben (B) vs Mike (M) + Dan (D). holesFor(player, roundIdx) = holes scored.
function trip(id, start, end, holesFor = () => 18, nRounds = 2) {
  const players = [['U', 'Owen', 'A'], ['B', 'Ben', 'A'], ['M', 'Mike', 'B'], ['D', 'Dan', 'B']]
    .map(([u, f, tm]) => ({ id: `${id}${u}`, user_id: u, first_name: f, last_name: 'X', handicap_index: 0, team_id: `${id}${tm}` }))
  const rounds = Array.from({ length: nRounds }, (_, i) => round(`${id}R${i}`, start))
  const scores = []
  rounds.forEach((r, ri) => players.forEach(p => {
    const n = holesFor(p.user_id, ri)
    for (let h = 1; h <= n; h++) scores.push({ round_id: r.id, trip_player_id: p.id, hole_number: h, gross_score: p.team_id.endsWith('A') ? PARS[h - 1] - 1 : PARS[h - 1] })
  }))
  return {
    tripId: id, tripName: `Trip ${id}`, allowance: 100,
    trip: { id, name: `Trip ${id}`, start_date: start, end_date: end, format: 'points_match_play', team_mode: true },
    rounds, scores, playerRounds: [], drinks: [], tripPlayers: players,
    teams: [{ id: `${id}A`, trip_id: id, name: 'Team Owen', team_index: 1 }, { id: `${id}B`, trip_id: id, name: null, team_index: 2 }],
    pairings: rounds.map(r => ({ id: `p${r.id}`, round_id: r.id, team1_id: `${id}A`, team2_id: `${id}B` })),
    pairingPlayers: rounds.flatMap(r => players.map((p, i) => ({ pairing_id: `p${r.id}`, trip_player_id: p.id, team_slot: i + 1 }))),
  }
}
const NOW = new Date('2026-11-06T18:00:00Z')

test('upcoming and in-progress trips drop out; finished ones stay', () => {
  const rows = [trip('P', '2026-06-01', '2026-06-04'), trip('L', '2026-11-05', '2026-11-08'), trip('F', '2027-05-01', '2027-05-04', () => 0)]
  assert.deepEqual(finishedOnly(rows, NOW).map(t => t.tripId), ['P'])
  assert.equal(buildCareer(finishedOnly(rows, NOW), 'U').trips, 1)
})

test("a player's unfinished round adds nothing: no holes, no birdies, no round", () => {
  // Owen quit round 2 after 9 holes.
  const t = trip('P', '2026-06-01', '2026-06-04', (u, ri) => (u === 'U' && ri === 1 ? 9 : 18))
  const all = buildCareer([t], 'U')
  const done = buildCareer(finishedOnly([t], NOW), 'U')
  assert.equal(all.holes, 27)
  assert.equal(done.holes, 18)
  assert.equal(done.rounds, 1)
  const d = buildCareerDetail(finishedOnly([t], NOW), 'U', NOW)
  assert.equal(d.gross.counts.birdies, 18) // every finished hole was a birdie; the 9 extra are gone
})

test('trip results still use every score (match the Leaderboard)', () => {
  const t = trip('P', '2026-06-01', '2026-06-04', (u, ri) => (ri === 1 && u === 'U' ? 9 : 18))
  assert.equal(tripFinishes(finishedOnly([t], NOW), 'U', NOW).get('P'), tripFinishes([t], 'U', NOW).get('P'))
  const g = buildGroupStats(finishedOnly([t], NOW), 'U', NOW)
  assert.equal(g.trips[0].winner.label, 'Team Owen')
})

test('group history: only finished trips, and only rounds someone finished', () => {
  const rows = [trip('P', '2026-06-01', '2026-06-04', (u, ri) => (ri === 2 ? 0 : 18), 3), trip('F', '2027-05-01', '2027-05-04', () => 0)]
  const g = buildGroupStats(finishedOnly(rows, NOW), 'U', NOW)
  assert.deepEqual(g.trips.map(t => t.tripId), ['P'])
  assert.equal(g.trips[0].rounds, 2)
  assert.equal(g.trips[0].courses.length, 2) // the unplayed round's course isn't listed
  assert.equal(g.totals.trips, 1)
})
