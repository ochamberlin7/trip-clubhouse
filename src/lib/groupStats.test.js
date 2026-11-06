// Group stats (groupStats.js). Run: `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildGroupStats, rankLeaderboard, rivalsOf, tripWinner, tripResult } from './groupStats.js'
import { buildCareerDetail } from './careerDetail.js'

const PARS = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4]
const round = (id, date, name = 'Pine') => ({ id, round_type: 'tournament', date, club_name: name, holes: PARS.map((par, i) => ({ par, handicap: i + 1 })), slope_rating: 113, course_rating: 72, par_total: 72 })

// 4 players: Owen (U), Ben (P), Mike (X), Dan (guest, by name). Team A = Owen+Ben vs B.
// gross: { A|B|C|D: (hole, par) => score }; extra: more players (e.g. an empty spot).
function trip(id, start, { gross = {}, format = 'points_match_play', end = start, extra = [] } = {}) {
  const players = [
    { id: `${id}A`, user_id: 'U', handicap_index: 0, team_id: `${id}TA`, first_name: 'Owen', last_name: 'C' },
    { id: `${id}B`, user_id: 'P', handicap_index: 0, team_id: `${id}TA`, first_name: 'Ben', last_name: 'Cole' },
    { id: `${id}C`, user_id: 'X', handicap_index: 0, team_id: `${id}TB`, first_name: 'Mike', last_name: 'Ross' },
    { id: `${id}D`, user_id: null, handicap_index: 0, team_id: `${id}TB`, guest_name: 'Dan Smith' },
    ...extra,
  ]
  const r = round(`${id}R`, start)
  const scores = []
  for (const p of players.slice(0, 4)) {
    const who = p.id.slice(-1)
    r.holes.forEach((h, i) => scores.push({ round_id: r.id, trip_player_id: p.id, hole_number: i + 1, gross_score: gross[who] ? gross[who](i + 1, h.par) : h.par }))
  }
  return {
    tripId: id, tripName: `Trip ${id}`, allowance: 100,
    trip: { id, name: `Trip ${id}`, start_date: start, end_date: end, format, team_mode: true },
    rounds: [r], scores, playerRounds: [], drinks: [], tripPlayers: players,
    teams: [{ id: `${id}TA`, trip_id: id, name: 'Team Owen', team_index: 1 }, { id: `${id}TB`, trip_id: id, name: null, team_index: 2 }],
    pairings: [{ id: `p${id}`, round_id: r.id, team1_id: `${id}TA`, team2_id: `${id}TB` }],
    pairingPlayers: players.slice(0, 4).map((p, i) => ({ pairing_id: `p${id}`, trip_player_id: p.id, team_slot: i + 1 })),
  }
}
const NOW = new Date('2027-12-31T12:00:00Z')

test('members are matched across trips (account, or name for guests); empty spots are skipped', () => {
  const g = buildGroupStats([
    trip('T1', '2026-06-01'),
    trip('T2', '2027-06-01', { extra: [{ id: 'T2E', user_id: null, handicap_index: null, team_id: null }] }),
  ], 'U', NOW)
  assert.deepEqual(g.members.map(m => m.name), ['Ben Cole', 'Dan Smith', 'Mike Ross', 'Owen C'])
  assert.equal(g.members.find(m => m.name === 'Dan Smith').detail.totals.trips, 2)
  assert.equal(g.viewerKey, 'u:U')
  assert.equal(g.totals.trips, 2)
  assert.equal(g.totals.players, 4)
  assert.equal(g.totals.firstYear, '2026')
  assert.equal(g.totals.lastYear, '2027')
})

test('each member\'s numbers equal their Career page numbers for these trips', () => {
  const trips = [trip('T1', '2026-06-01', { gross: { A: (h, p) => p - 1 } }), trip('T2', '2027-06-01')]
  const g = buildGroupStats(trips, 'U', NOW)
  const owen = g.members.find(m => m.key === 'u:U')
  assert.deepEqual(owen.detail.totals, buildCareerDetail(trips, 'U', NOW).totals)
  assert.equal(owen.detail.gross.counts.birdies, 18)
})

test('trip history: winners of finished trips, newest first; none for an upcoming trip', () => {
  const g = buildGroupStats([
    trip('T1', '2026-06-01', { gross: { A: (h, p) => p - 1 } }),   // Owen birdies everything → Team Owen wins
    trip('T2', '2028-06-01'),                                        // still to come
  ], 'U', NOW)
  assert.deepEqual(g.trips.map(t => t.tripId), ['T2', 'T1'])
  assert.equal(g.trips[0].winner, null)
  assert.equal(g.trips[0].status, 'upcoming')
  assert.deepEqual(g.trips[1].winner, { kind: 'team', tied: false, label: 'Team Owen', players: ['Owen C', 'Ben Cole'] })
  assert.equal(g.trips[1].format, 'Point Match Play')
})

test('a tied trip says so; an unnamed winning team reads "Team 2"', () => {
  const tied = trip('T1', '2026-06-01')                       // everyone pars → all square
  assert.equal(tripWinner(tied, NOW)?.tied ?? null, null)     // 0 points each: nothing decided
  const t2 = trip('T2', '2026-06-01', { gross: { C: (h, p) => p - 1 } })
  assert.equal(tripWinner(t2, NOW).label, 'Team 2')
})

test('leaderboards rank everyone; ties share a rank; lower is better for averages', () => {
  const g = buildGroupStats([trip('T1', '2026-06-01', { gross: { A: (h, p) => p - 1, C: (h, p) => p + 1 } })], 'U', NOW)
  const avg = rankLeaderboard(g, 'avg')
  assert.deepEqual(avg.map(r => [r.member.name, r.v, r.rank]), [['Owen C', 54, 1], ['Ben Cole', 72, 2], ['Dan Smith', 72, 2], ['Mike Ross', 90, 4]])
  const titles = rankLeaderboard(g, 'titles')
  assert.equal(titles[0].v, 1) // Owen and Ben won the trip
  assert.deepEqual(titles.filter(r => r.v === 1).map(r => r.member.name), ['Ben Cole', 'Owen C'])
  const best = rankLeaderboard(g, 'best')
  assert.equal(best[0].where.course, 'Pine')
})

test('records: the best of each, everyone who holds it, and where', () => {
  const g = buildGroupStats([
    trip('T1', '2026-06-01', { gross: { A: (h, p) => (h <= 4 ? p - 1 : p) } }),
    trip('T2', '2027-06-01', { gross: { B: (h, p) => (h <= 4 ? p - 1 : p) } }),
  ], 'U', NOW)
  const low = g.records.find(r => r.id === 'lowGross').rec
  assert.equal(low.v, 68)
  assert.deepEqual(low.holders.map(h => [h.name, h.where.tripName]), [['Ben Cole', 'Trip T2'], ['Owen C', 'Trip T1']])
  assert.equal(g.records.find(r => r.id === 'birdiesRound').rec.v, 4)
  assert.equal(g.records.some(r => r.id === 'stablefordRound'), false) // nobody played Stableford
})

test('rivals combine Standard and Point Match Play records', () => {
  const g = buildGroupStats([
    trip('T1', '2026-06-01', { gross: { A: (h, p) => p - 1 }, format: 'standard_match_play' }),
    trip('T2', '2027-06-01', { gross: { C: (h, p) => p - 1 } }),
  ], 'U', NOW)
  const { partners, opponents } = rivalsOf(g.members.find(m => m.key === 'u:U'))
  assert.deepEqual(partners.map(p => [p.name, p.w, p.t, p.l]), [['Ben Cole', 1, 0, 1]])
  assert.deepEqual(opponents.map(p => p.matches), [2, 2])
})

test('trip summary: dates, place, rounds, players, teams and the final score', () => {
  const t = trip('T1', '2026-06-01', { gross: { A: (h, p) => (h <= 3 ? p - 1 : p) }, end: '2026-06-03' })
  t.rounds[0].location_city = 'Arcadia'; t.rounds[0].location_state = 'MI'
  const g = buildGroupStats([t], 'U', NOW)
  const c = g.trips[0]
  assert.deepEqual([c.startDate, c.endDate], ['2026-06-01', '2026-06-03'])
  assert.deepEqual(c.location, ['Arcadia, MI'])
  assert.deepEqual(c.roundList.map(r => [r.course, r.played]), [['Pine', true]])
  assert.deepEqual(c.playerNames, ['Ben Cole', 'Dan Smith', 'Mike Ross', 'Owen C'])
  assert.deepEqual(c.teams.map(tm => [tm.name, tm.players]), [['Team Owen', ['Owen C', 'Ben Cole']], ['Team 2', ['Mike Ross', 'Dan Smith']]])
  assert.equal(c.standings.kind, 'team')
  assert.equal(c.standings.unit, 'points')
  assert.deepEqual(c.standings.rows.map(r => [r.name, r.total, r.rank]), [['Team Owen', 3, 1], ['Team 2', 0, 2]])
})

test('standings show while a trip is going, but no winner until it is over', () => {
  const live = trip('T1', '2027-12-30', { gross: { A: (h, p) => p - 1 }, end: '2028-01-02' })
  const r = tripResult(live, NOW)
  assert.equal(r.standings.rows[0].name, 'Team Owen')
  assert.equal(r.winner, null)
})

test('individual Stableford: players ranked by points, winner named', () => {
  const t = trip('T1', '2026-06-01', { format: 'stableford', gross: { B: (h, p) => p - 1 } })
  t.tripPlayers.forEach(p => { p.team_id = null })
  const r = tripResult(t, NOW)
  assert.equal(r.standings.kind, 'player')
  assert.equal(r.standings.rows[0].name, 'Ben Cole')
  assert.equal(r.standings.rows[0].total, 54)
  assert.equal(r.winner.label, 'Ben Cole')
})
