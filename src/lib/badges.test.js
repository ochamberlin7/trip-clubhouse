// Badge rules. Run: `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeBadges, BADGES } from './badges.js'
import { tripFinishes } from './careerStats.js'

const HOLES = Array.from({ length: 18 }, (_, i) => ({ par: 4, handicap: i + 1 }))
const round = (id, date, extra = {}) => ({ id, date, round_type: 'tournament', holes: HOLES, slope_rating: 113, course_rating: 72, par_total: 72, club_name: 'Test GC', ...extra })
// T1 = A (me, account U) + B · T2 = C + D. All scratch.
const players = [
  { id: 'A', user_id: 'U', claimed_user_id: 'U', handicap_index: 0, team_id: 'TA' },
  { id: 'B', user_id: null, claimed_user_id: null, handicap_index: 0, team_id: 'TA' },
  { id: 'C', user_id: null, claimed_user_id: null, handicap_index: 0, team_id: 'TB' },
  { id: 'D', user_id: null, claimed_user_id: null, handicap_index: 0, team_id: 'TB' },
]
function trip({ rounds, gross, drinks = [], start = '2026-10-01', end = '2026-10-03' }) {
  const scores = []
  for (const r of rounds) for (const p of players) for (let h = 1; h <= 18; h++) {
    scores.push({ round_id: r.id, trip_player_id: p.id, hole_number: h, gross_score: gross(p.id, h, r.id) })
  }
  return {
    tripId: 'T', tripName: 'Test Trip', trip: { start_date: start, end_date: end, time_zone: 'America/Phoenix' }, allowance: 100,
    rounds, scores, drinks, playerRounds: [], tripPlayers: players,
    pairings: rounds.map(r => ({ id: `p${r.id}`, round_id: r.id, pairing_number: 1, team1_id: 'TA', team2_id: 'TB' })),
    pairingPlayers: rounds.flatMap(r => players.map((p, i) => ({ pairing_id: `p${r.id}`, trip_player_id: p.id, team_slot: i + 1 }))),
  }
}
const NOW = new Date('2026-10-27T19:00:00Z')
const got = (m, id) => m.get(id)

test('catalog: every badge has a group, name, mark and description', () => {
  for (const b of BADGES) assert.ok(b.group && b.name && b.mark && b.desc, b.id)
})

test('scoring badges are gross: birdies, back-to-back, pars, bogey-free, broke 80, eagle, ace', () => {
  // A: ace on 1 (par 4 → also an eagle), birdies 2–6, pars 7–18 → 65.
  const gross = (p, h) => (p === 'A' ? (h === 1 ? 1 : h <= 6 ? 3 : 4) : 5)
  const m = computeBadges([trip({ rounds: [round('R1', '2026-10-01')], gross })], 'U', NOW)
  for (const id of ['hat_trick', 'birdie_bonanza', 'back_to_back', 'par_machine', 'par_train', 'double_bogey_free', 'bogey_free', 'broke_100', 'broke_90', 'broke_80', 'broke_70', 'eagle', 'hole_in_one']) {
    assert.equal(got(m, id).earned, true, id)
  }
  assert.equal(got(m, 'snowman').earned, false)
})

test('roast and daily badges: snowman, wooden spoon, thirsty, low gross/net, most points', () => {
  // A shoots 8 on hole 1 and 5s elsewhere (93); B 4s (72); C/D 5s (90).
  const gross = (p, h) => (p === 'A' ? (h === 1 ? 8 : 5) : p === 'B' ? 4 : 5)
  const drinks = [{ round_id: 'R1', trip_player_id: 'A', count: 4 }]
  const m = computeBadges([trip({ rounds: [round('R1', '2026-10-01')], gross, drinks })], 'U', NOW)
  assert.equal(got(m, 'snowman').earned, true)
  assert.equal(got(m, 'wooden_spoon').earned, true)
  assert.equal(got(m, 'thirsty').earned, true)
  assert.equal(got(m, 'low_gross_day').earned, false) // B was low
  assert.equal(got(m, 'broke_100').earned, true)
  assert.equal(got(m, 'broke_90').earned, false)
})

test('practice rounds count for scoring badges', () => {
  const gross = (p, h) => (p === 'A' ? (h <= 3 ? 3 : 4) : 5)
  const m = computeBadges([trip({ rounds: [round('RP', '2026-10-01', { round_type: 'practice' })], gross })], 'U', NOW)
  assert.equal(got(m, 'hat_trick').earned, true)
})

test('Warrior / Workhorse: per day and per trip, only when you lead your team', () => {
  // Hole 1: A 3, B 4 vs C 3, D 5 → halved, A sole best on T1 → A defends.
  // Holes 2–18: A 4, B 5 vs C 5, D 5 → T1 wins, A alone credited → A most points.
  const gross = (p, h) => ({ A: h === 1 ? 3 : 4, B: h === 1 ? 4 : 5, C: h === 1 ? 3 : 5, D: 5 })[p]
  const m = computeBadges([trip({ rounds: [round('R1', '2026-10-01')], gross })], 'U', NOW)
  for (const id of ['warrior_day', 'warrior_trip', 'workhorse_day', 'workhorse_trip']) assert.equal(got(m, id).earned, true, id)
  // Trip still going → no trip-level badges yet, day ones still count.
  const live = computeBadges([trip({ rounds: [round('R1', '2026-10-26')], gross, start: '2026-10-26', end: '2026-10-29' })], 'U', NOW)
  assert.equal(got(live, 'warrior_day').earned, true)
  assert.equal(got(live, 'warrior_trip').earned, false)
  assert.equal(got(live, 'first_trip').earned, false)
})

test('badges are earned once (first time kept); milestones tier up; no Champion without teams', () => {
  const gross = (p, h) => (p === 'A' ? (h <= 3 ? 3 : 4) : 5)
  const rs = Array.from({ length: 10 }, (_, i) => round(`R${i}`, `2026-10-0${(i % 3) + 1}`))
  const m = computeBadges([trip({ rounds: rs, gross })], 'U', NOW)
  assert.equal(got(m, 'hat_trick').count, 1)                 // once, however many times it happened
  assert.equal(got(m, 'hat_trick').events.length, 1)
  assert.equal(got(m, 'hat_trick').events[0].date, '2026-10-01') // the first time
  assert.equal(got(m, 'rounds').count, 10)
  assert.equal(got(m, 'rounds').tier, 0)        // bronze at 10
  assert.equal(got(m, 'first_trip').earned, true)
  assert.equal(got(m, 'trip_veteran').earned, false) // needs 3 trips
  assert.equal(got(m, 'champion').earned, false)
})

test('nothing earned for someone who is not on the trip', () => {
  const m = computeBadges([trip({ rounds: [round('R1', '2026-10-01')], gross: () => 3 })], 'NOBODY', NOW)
  assert.equal([...m.values()].some(v => v.earned), false)
})

test('Champion + past-trip finish come from the shared team standings', () => {
  // T1 (A + B) wins holes 2–18 → T1 champion; my team is TA.
  const gross = (p, h) => ({ A: h === 1 ? 3 : 4, B: h === 1 ? 4 : 5, C: h === 1 ? 3 : 5, D: 5 })[p]
  const t = trip({ rounds: [round('R1', '2026-10-01')], gross })
  t.trip = { ...t.trip, team_mode: true, format: 'point_match_play' }
  assert.equal(tripFinishes([t], 'U', NOW).get('T'), 'Champion')
  assert.equal(computeBadges([t], 'U', NOW).get('champion').earned, true)
  // Same trip seen by a player on the other team → 2nd place, no badge.
  const other = { ...t, tripPlayers: t.tripPlayers.map(p => (p.id === 'C' ? { ...p, user_id: 'X', claimed_user_id: 'X' } : p)) }
  assert.equal(tripFinishes([other], 'X', NOW).get('T'), '2nd place')
  assert.equal(computeBadges([other], 'X', NOW).get('champion').earned, false)
  // Trip still going → no finish yet.
  const live = { ...t, trip: { ...t.trip, start_date: '2026-10-26', end_date: '2026-10-29' } }
  assert.equal(tripFinishes([live], 'U', NOW).has('T'), false)
})

test('a tie for first is not a Champion', () => {
  // Both teams win the same number of holes → tied for first.
  const gross = (p, h) => ({ A: h % 2 ? 3 : 5, B: 5, C: h % 2 ? 5 : 3, D: 5 })[p]
  const t = trip({ rounds: [round('R1', '2026-10-01', { holes: HOLES.slice(0, 18) })], gross })
  t.trip = { ...t.trip, team_mode: true, format: 'point_match_play' }
  assert.equal(tripFinishes([t], 'U', NOW).get('T'), 'Co-champion')
  assert.equal(computeBadges([t], 'U', NOW).get('champion').earned, false)
})

test('Broke-N medallions read 90s / 80s / 70s / 60s', () => {
  const marks = Object.fromEntries(BADGES.filter(b => b.id.startsWith('broke_')).map(b => [b.id, b.mark]))
  assert.deepEqual(marks, { broke_100: '90s', broke_90: '80s', broke_80: '70s', broke_70: '60s' })
})

test('Double-Bogey-Free: a full round with bogeys is fine, one double (or a missing hole) is not', () => {
  const bogeys = (p, h) => (p === 'A' ? (h % 2 ? 5 : 4) : 5)               // bogeys + pars, no doubles
  let m = computeBadges([trip({ rounds: [round('R1', '2026-10-01')], gross: bogeys })], 'U', NOW)
  assert.equal(got(m, 'double_bogey_free').earned, true)
  assert.equal(got(m, 'bogey_free').earned, false)
  const oneDouble = (p, h) => (p === 'A' ? (h === 9 ? 6 : 5) : 5)
  m = computeBadges([trip({ rounds: [round('R1', '2026-10-01')], gross: oneDouble })], 'U', NOW)
  assert.equal(got(m, 'double_bogey_free').earned, false)
  const unfinished = (p, h) => (p === 'A' && h === 18 ? null : 4)            // 17 holes only
  m = computeBadges([trip({ rounds: [round('R1', '2026-10-01')], gross: unfinished })], 'U', NOW)
  assert.equal(got(m, 'double_bogey_free').earned, false)
})
