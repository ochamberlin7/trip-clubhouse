// Shared team standings (Leaderboard, Champion badge, past-trip finishes). Run: `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { teamStandings, teamStandingsFromRows, finishLabel, leaderboardRounds } from './scoring.js'

const HOLES3 = [{ par: 4, handicap: 1 }, { par: 4, handicap: 2 }, { par: 4, handicap: 3 }]
const R = (id, extra = {}) => ({ id, round_type: 'tournament', holes: HOLES3, number_of_holes: 3, slope_rating: 113, course_rating: 72, par_total: 72, ...extra })
const pairing = rid => ({ id: `p${rid}`, round_id: rid, pairing_number: 1, team1_id: 'TA', team2_id: 'TB' })
const pp = rid => ['A', 'B', 'C', 'D'].map((tp, i) => ({ pairing_id: `p${rid}`, trip_player_id: tp, team_slot: i + 1 }))
const HCP = { A: 0, B: 0, C: 0, D: 0 }
function scoresMapOf(rid, spec) {
  const m = {}
  spec.forEach((h, i) => { for (const [p, g] of Object.entries(h)) m[`${rid}:${p}:${i + 1}`] = g })
  return m
}
// R1: T1 wins hole 1, T2 wins hole 2, hole 3 halved. R2: T1 wins all three.
const SPEC1 = [{ A: 4, B: 5, C: 5, D: 6 }, { A: 5, B: 5, C: 4, D: 5 }, { A: 4, B: 4, C: 5, D: 4 }]
const SPEC2 = [{ A: 3, B: 5, C: 5, D: 5 }, { A: 3, B: 5, C: 5, D: 5 }, { A: 3, B: 5, C: 5, D: 5 }]
const rounds = [R('R1'), R('R2'), R('RP', { round_type: 'practice' }), R('RN', { round_type: 'none' })]
const base = {
  rounds, pairings: ['R1', 'R2'].map(pairing), pairingPlayers: ['R1', 'R2'].flatMap(pp),
  scoresMap: { ...scoresMapOf('R1', SPEC1), ...scoresMapOf('R2', SPEC2) }, hcpByPlayer: HCP, teeRowMap: {}, teamIds: ['TA', 'TB'],
}

test('leaderboard rounds skip practice, none and no-scoring rounds', () => {
  assert.deepEqual(leaderboardRounds([...rounds, R('NS', { no_scoring: true })]).map(r => r.id), ['R1', 'R2'])
})

test('Points Match Play: hole wins add up per team across rounds', () => {
  const s = teamStandings({ ...base, format: 'point_match_play' })
  assert.equal(s.total.get('TA'), 4)          // 1 + 3
  assert.equal(s.total.get('TB'), 1)
  assert.deepEqual(s.perRound.get('TA').get('R1'), { pts: 1, scored: 3, matches: 0, completed: 0 })
  assert.deepEqual(s.ranked, [{ teamId: 'TA', total: 4, rank: 1 }, { teamId: 'TB', total: 1, rank: 2 }])
})

test('Standard Match Play: each completed round is worth 1 / 0.5 / 0', () => {
  const s = teamStandings({ ...base, format: 'standard_match_play' })
  assert.equal(s.total.get('TA'), 1.5)        // halve R1 + win R2
  assert.equal(s.total.get('TB'), 0.5)
  assert.equal(s.perRound.get('TA').get('R2').completed, 1)
})

test('from raw rows gives the same standings', () => {
  const scores = Object.entries(base.scoresMap).map(([k, g]) => { const [round_id, trip_player_id, hole] = k.split(':'); return { round_id, trip_player_id, hole_number: Number(hole), gross_score: g } })
  const tripPlayers = [['A', 'TA'], ['B', 'TA'], ['C', 'TB'], ['D', 'TB']].map(([id, team_id]) => ({ id, team_id, handicap_index: 0 }))
  const s = teamStandingsFromRows({ format: 'point_match_play', rounds, scores, pairings: base.pairings, pairingPlayers: base.pairingPlayers, tripPlayers })
  assert.deepEqual(s.ranked, teamStandings({ ...base, format: 'point_match_play' }).ranked)
})

test('finishLabel: champion, co-champion, places, ties', () => {
  const ranked = [{ teamId: 'A', total: 9, rank: 1 }, { teamId: 'B', total: 7, rank: 2 }, { teamId: 'C', total: 5, rank: 3 }, { teamId: 'D', total: 5, rank: 3 }]
  assert.equal(finishLabel(ranked, 'A'), 'Champion')
  assert.equal(finishLabel(ranked, 'B'), '2nd place')
  assert.equal(finishLabel(ranked, 'C'), 'Tied for 3rd')
  assert.equal(finishLabel([{ teamId: 'A', total: 5, rank: 1 }, { teamId: 'B', total: 5, rank: 1 }], 'B'), 'Co-champion')
  assert.equal(finishLabel(ranked, 'Z'), null)
})
