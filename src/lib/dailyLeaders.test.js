// Daily Leaders: per-day pages + category leaders. Run: `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDailyLeaders, leadersOf, LEADER_CATEGORIES } from './dailyLeaders.js'
import { analyzeScoring } from './scoring.js'
import { courseHolesFromRounds } from './playerStats.js'

// 18 par-4 holes, stroke index 1..18, neutral tee (CH = index).
const HOLES18 = Array.from({ length: 18 }, (_, i) => ({ par: 4, handicap: i + 1 }))
const round = (id, date, extra = {}) => ({ id, date, round_type: 'tournament', holes: HOLES18, slope_rating: 113, course_rating: 72, par_total: 72, club_name: `Club ${id}`, ...extra })

// T1 = A,B (slots 1&2) · T2 = C,D (slots 3&4). C gets a stroke on every hole (index 18).
const tripPlayers = [
  { id: 'A', handicap_index: 0, team_id: 'TA' },
  { id: 'B', handicap_index: 0, team_id: 'TA' },
  { id: 'C', handicap_index: 18, team_id: 'TB' },
  { id: 'D', handicap_index: 0, team_id: 'TB' },
]
const pairingFor = rid => ({ id: `p-${rid}`, round_id: rid, pairing_number: 1, team1_id: 'TA', team2_id: 'TB' })
const ppFor = rid => ['A', 'B', 'C', 'D'].map((tp, i) => ({ pairing_id: `p-${rid}`, trip_player_id: tp, team_slot: i + 1 }))

// Gross per hole: A birdies 1–2 then pars (70) · B all pars (72) · C all bogeys (90, net 72)
// · D birdie on 1 then bogeys (88).
const grossOf = (tp, hole) => ({
  A: hole <= 2 ? 3 : 4,
  B: 4,
  C: 5,
  D: hole === 1 ? 3 : 5,
}[tp])
function fullScores(rid, holes = 18) {
  const out = []
  for (const tp of ['A', 'B', 'C', 'D']) for (let h = 1; h <= holes; h++) out.push({ round_id: rid, trip_player_id: tp, hole_number: h, gross_score: grossOf(tp, h) })
  return out
}

function data({ rounds, scores, drinks = [] }) {
  return {
    rounds, scores, drinks, tripPlayers, playerRounds: [],
    pairings: rounds.map(r => pairingFor(r.id)),
    pairingPlayers: rounds.flatMap(r => ppFor(r.id)),
  }
}
const leader = (day, key) => day.leaders.find(l => l.key === key).leader

test('one page per day with a completed round; incomplete / unscored / placeholder days skipped', () => {
  const rounds = [
    round('RP', '2026-11-04', { round_type: 'practice' }),     // practice counts (flagged)
    round('R1', '2026-11-05'),
    round('R2', '2026-11-06'),                                 // only 9 holes in → not complete
    round('R3', '2026-11-07'),                                 // no scores
    round('RN', '2026-11-08', { round_type: 'none' }),         // "not decided yet" placeholder
  ]
  const scores = [...fullScores('RP'), ...fullScores('R1'), ...fullScores('R2', 9), ...fullScores('RN')]
  const days = buildDailyLeaders(data({ rounds, scores }), { tripStartDate: '2026-11-05' })
  assert.deepEqual(days.map(d => d.date), ['2026-11-04', '2026-11-05'])
  assert.equal(days[0].dayNumber, null)        // practice day before the trip starts → shown by date
  assert.equal(days[0].practice, 'all')
  assert.equal(days[1].dayNumber, 1)
  assert.equal(days[1].practice, null)
  assert.equal(days[1].roundCount, 1)
  assert.equal(days[1].courseName, 'Club R1')
  assert.deepEqual(days[1].leaders.map(l => l.key), LEADER_CATEGORIES.map(c => c.key))
})

test('practice day: stroke stats count, Most Points is empty (practice is not a match)', () => {
  const [day] = buildDailyLeaders(data({ rounds: [round('RP', '2026-11-04', { round_type: 'practice' })], scores: fullScores('RP') }))
  assert.equal(day.practice, 'all')
  assert.equal(leader(day, 'points'), null)
  assert.deepEqual(leader(day, 'birdiesGross'), { value: 2, ids: ['A'] })
  assert.deepEqual(leader(day, 'bestNet').ids, ['A'])
  assert.deepEqual(leader(day, 'worstGross'), { value: 90, ids: ['C'] })
})

test('a day mixing practice and tournament rounds is flagged "some"', () => {
  const rounds = [round('R1', '2026-11-05'), round('RP', '2026-11-05', { round_type: 'practice' })]
  const [day] = buildDailyLeaders(data({ rounds, scores: [...fullScores('R1'), ...fullScores('RP')] }))
  assert.equal(day.practice, 'some')
  assert.equal(day.roundCount, 2)
  assert.deepEqual(leader(day, 'points'), { value: 1, ids: ['A'] }) // points from the tournament round only
})

test('Best Net on a tournament day equals the shared analyzeScoring net vs par', () => {
  const rounds = [round('R1', '2026-11-05')]
  const d = data({ rounds, scores: fullScores('R1') })
  const { vsParByPlayer } = analyzeScoring({ ...d, courseHoles: courseHolesFromRounds(rounds) }, new Set(['R1']), 100)
  const [day] = buildDailyLeaders(d)
  const best = Math.min(...vsParByPlayer.values())
  assert.equal(leader(day, 'bestNet').value, best)
  assert.deepEqual(leader(day, 'bestNet').ids, [...vsParByPlayer].filter(([, v]) => v === best).map(([id]) => id))
})

test('category leaders (gross and net tracked separately)', () => {
  const drinks = [
    { round_id: 'R1', trip_player_id: 'C', count: 2 },
    { round_id: 'R1', trip_player_id: 'D', count: 1 },
    { round_id: 'R1', trip_player_id: 'D', count: 1 },
  ]
  const [day] = buildDailyLeaders(data({ rounds: [round('R1', '2026-11-05')], scores: fullScores('R1'), drinks }))
  assert.deepEqual(leader(day, 'points'), { value: 1, ids: ['A'] })   // A wins hole 2; the rest halve on net
  assert.deepEqual(leader(day, 'bestNet').ids, ['A'])
  // Holes 1 and 3–18 halve on net. T1: A & B tie on 3–18 (no credit); hole 1 A alone (3 vs B 4).
  // T2: C's net 4 alone on 3–18 (D 5) → 16; hole 1 D alone (3 vs C 4). Hole 2 T1 won.
  assert.deepEqual(leader(day, 'defended'), { value: 16, ids: ['C'] })
  assert.deepEqual(leader(day, 'birdiesGross'), { value: 2, ids: ['A'] })
  assert.deepEqual(leader(day, 'birdiesNet'), { value: 2, ids: ['A'] })
  assert.deepEqual(leader(day, 'parsGross'), { value: 18, ids: ['B'] })
  assert.deepEqual(leader(day, 'parsNet'), { value: 18, ids: ['B', 'C'] }) // C's bogeys are net pars
  assert.deepEqual(leader(day, 'worstGross'), { value: 90, ids: ['C'] })
  assert.deepEqual(leader(day, 'worstNet'), { value: 88, ids: ['D'] })
  assert.deepEqual(leader(day, 'drinks'), { value: 2, ids: ['C', 'D'] })  // tie → both
})

test('two complete rounds on one day combine; a later day gets its own page', () => {
  const rounds = [round('R1', '2026-11-05'), round('R1b', '2026-11-05'), round('R2', '2026-11-06')]
  const scores = [...fullScores('R1'), ...fullScores('R1b'), ...fullScores('R2')]
  const days = buildDailyLeaders(data({ rounds, scores }), { tripStartDate: '2026-11-05' })
  assert.deepEqual(days.map(d => [d.date, d.dayNumber, d.roundCount]), [['2026-11-05', 1, 2], ['2026-11-06', 2, 1]])
  assert.equal(days[0].courseName, null) // two rounds → no single course name
  assert.deepEqual(leader(days[0], 'birdiesGross'), { value: 4, ids: ['A'] })
  assert.deepEqual(leader(days[0], 'worstGross'), { value: 90, ids: ['C'] }) // worst SINGLE round, not the day total
})

test('drinks count every round that day, even one still in progress', () => {
  const rounds = [round('R1', '2026-11-05'), round('R1b', '2026-11-05')]
  const scores = [...fullScores('R1'), ...fullScores('R1b', 5)]
  const drinks = [{ round_id: 'R1b', trip_player_id: 'B', count: 3 }]
  const [day] = buildDailyLeaders(data({ rounds, scores, drinks }))
  assert.equal(day.roundCount, 1)
  assert.deepEqual(leader(day, 'drinks'), { value: 3, ids: ['B'] })
})

test('leadersOf: ties, lower-is-better, zero means nobody, nulls ignored', () => {
  const m = new Map([['a', 2], ['b', 2], ['c', null], ['d', 1]])
  assert.deepEqual(leadersOf(m, { hi: true }), { value: 2, ids: ['a', 'b'] })
  assert.deepEqual(leadersOf(m, { hi: false }), { value: 1, ids: ['d'] })
  assert.equal(leadersOf(new Map([['a', 0], ['b', 0]]), { hi: true, zeroIsNone: true }), null)
  assert.equal(leadersOf(new Map([['a', null]]), { hi: true }), null)
})

test('no rounds / no completed rounds → no pages', () => {
  assert.deepEqual(buildDailyLeaders(data({ rounds: [], scores: [] })), [])
  assert.deepEqual(buildDailyLeaders(data({ rounds: [round('R1', '2026-11-05')], scores: fullScores('R1', 17) })), [])
})
