// Past trips from the old spreadsheets (pastTrips.js). Run: `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pastTripRows, pastFinish } from './pastTrips.js'
import { buildCareer, tripFinishes } from './careerStats.js'
import { buildCareerDetail } from './careerDetail.js'
import { buildGroupStats } from './groupStats.js'

const NOW = new Date('2026-11-06T12:00:00Z')
const TRIPS = [
  { id: 'W', group_id: 'g', name: 'Wisconsin 2022', start_date: '2022-08-11', end_date: '2022-08-15', format_label: 'Better ball Nassau', rounds: 5, courses: ['Erin Hills', 'Sand Valley'], result_kind: 'player', teams: [] },
  { id: 'K', group_id: 'g', name: 'Kiawah 2024', start_date: '2024-10-10', end_date: '2024-10-14', format_label: 'Team match play (points)', rounds: 5, courses: ['Ocean Course'], result_kind: 'team',
    teams: [{ index: 1, name: 'Wang Rails', points: 90, rank: 1 }, { index: 2, name: 'Scissor Sisters', points: 90, rank: 1 }] },
  { id: 'P', group_id: 'g', name: 'Prairie Club 2025', start_date: '2025-09-16', end_date: '2025-09-21', rounds: 6, courses: ['Wild Horse'], result_kind: 'team',
    teams: [{ index: 1, name: null, points: null, rank: 2 }, { index: 2, name: null, points: null, rank: 1 }] },
]
const PLAYERS = [
  { past_trip_id: 'W', user_id: 'J', name: 'Jeff Nelson', handicap_index: 15, team_index: null, rank: 1 },
  { past_trip_id: 'W', user_id: 'U', name: 'Owen Chamberlin', handicap_index: 9.9, team_index: null, rank: null },
  { past_trip_id: 'W', user_id: null, name: 'Tony Pacello', handicap_index: 6, team_index: null, rank: null },
  { past_trip_id: 'K', user_id: 'U', name: 'Owen Chamberlin', handicap_index: 9.8, team_index: 1 },
  { past_trip_id: 'K', user_id: 'J', name: 'Jeff Nelson', handicap_index: 14.4, team_index: 2 },
  { past_trip_id: 'K', user_id: null, name: 'Tony Pacello', handicap_index: 7.7, team_index: 2 },
  { past_trip_id: 'P', user_id: 'U', name: 'Owen Chamberlin', handicap_index: 9.3, team_index: 1 },
  { past_trip_id: 'P', user_id: 'J', name: 'Jeff Nelson', handicap_index: 13.4, team_index: 2 },
]
const rows = pastTripRows(TRIPS, PLAYERS)

test('past trips count as trips, rounds and holes (every past round was 18 holes)', () => {
  const c = buildCareer(rows, 'U')
  assert.equal(c.trips, 3)
  assert.equal(c.rounds, 16) // 5 + 5 + 6, matching each trip's card on the Trips tab
  assert.equal(c.holes, 16 * 18)
  assert.equal(buildCareer(rows, 'J').holes, 16 * 18) // everyone on the trips, not just you
})

test('finishes come from the recorded result', () => {
  const f = tripFinishes(rows, 'U', NOW)
  assert.equal(f.has('W'), false) // individual trip, Owen not ranked
  assert.equal(f.get('K'), 'Co-champion')
  assert.equal(f.get('P'), '2nd place')
  assert.equal(tripFinishes(rows, 'J', NOW).get('W'), 'Winner')
  assert.equal(tripFinishes(rows, 'J', NOW).get('P'), 'Champion')
})

test('career page: handicap at each past trip, trips won, no scoring numbers', () => {
  const d = buildCareerDetail(rows, 'U', NOW)
  assert.deepEqual(d.handicap.map(h => h.index), [9.9, 9.8, 9.3])
  assert.equal(d.totals.trips, 3)
  assert.equal(d.gross.average, null)
  assert.equal(d.competition.titles, 0) // a co-championship isn't an outright title
  assert.equal(d.trips[0].past, true)
  const j = buildCareerDetail(rows, 'J', NOW)
  assert.equal(j.competition.titles, 2) // Wisconsin winner + Prairie Club champion
  assert.equal(j.competition.finishes.find(f => f.tripId === 'K').pastFormat, 'Team match play (points)')
})

test('group page: past trips in history with their result; no-account players get no stats', () => {
  const g = buildGroupStats(rows, 'U', NOW)
  assert.deepEqual(g.members.map(m => m.name).sort(), ['Jeff Nelson', 'Owen Chamberlin'])
  assert.equal(g.totals.trips, 3)
  const k = g.trips.find(t => t.tripId === 'K')
  assert.equal(k.past, true)
  assert.equal(k.winner.label, 'Tied: Wang Rails & Scissor Sisters')
  assert.equal(k.players, 3) // Tony is still listed on the trip
  assert.deepEqual(k.standings.rows.map(r => r.total), [90, 90])
  assert.equal(g.trips.find(t => t.tripId === 'P').winner.label, 'Team 2')
  assert.equal(g.trips.find(t => t.tripId === 'W').winner.label, 'Jeff Nelson')
  assert.equal(g.hasMatchPlay, false) // past trips add no match-play boards
})

test('pastFinish is null when the sheet has no result for you', () => {
  const r = pastTripRows([{ ...TRIPS[1], teams: [] }], PLAYERS)[0]
  assert.equal(pastFinish(r, r.tripPlayers[0]), null)
})

test('group summary: each past course carries its city and state', () => {
  const r = pastTripRows([{ ...TRIPS[0], course_locations: ['Erin, WI', 'Nekoosa, WI'] }], PLAYERS)
  const g = buildGroupStats(r, 'U', NOW)
  assert.deepEqual(g.trips[0].coursePlaces, ['Erin, WI', 'Nekoosa, WI'])
  assert.equal(g.members.find(m => m.name === 'Jeff Nelson').detail.totals.holes, 5 * 18)
})
