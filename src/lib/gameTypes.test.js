// Stableford + stroke play (Phase 1 of game types). Run: `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  stablefordPoints, strokeRoundResult, individualStandings, teamStandings, teamStandingsFromRows,
  tripGameType, isIndividualGameType, tournamentFormatLabel,
} from './scoring.js'

// 4 holes: pars 4/3/5/4, stroke index 1..4. Neutral tee (slope 113, rating = par),
// so a player's playing handicap is just round(index × allowance).
const HOLES = [{ par: 4, handicap: 1 }, { par: 3, handicap: 2 }, { par: 5, handicap: 3 }, { par: 4, handicap: 4 }]
const R = (id, extra = {}) => ({ id, round_type: 'tournament', holes: HOLES, slope_rating: 113, course_rating: 16, par_total: 16, ...extra })
const sm = (rid, byPlayer) => {
  const m = {}
  for (const [p, gs] of Object.entries(byPlayer)) gs.forEach((g, i) => { if (g != null) m[`${rid}:${p}:${i + 1}`] = g })
  return m
}

test('Stableford points: 2 + par − net, floored at 0', () => {
  assert.equal(stablefordPoints(7, 4), 0)  // triple
  assert.equal(stablefordPoints(6, 4), 0)  // double bogey
  assert.equal(stablefordPoints(5, 4), 1)  // bogey
  assert.equal(stablefordPoints(4, 4), 2)  // par
  assert.equal(stablefordPoints(3, 4), 3)  // birdie
  assert.equal(stablefordPoints(2, 4), 4)  // eagle
  assert.equal(stablefordPoints(2, 5), 5)  // albatross
  assert.equal(stablefordPoints(null, 4), null)
  assert.equal(stablefordPoints(4, null), null)
})

test('strokes use the FULL playing handicap, not shots off the low', () => {
  // Index 2 → 2 strokes (SI 1 & 2). Scratch partner doesn't change that.
  const scoresMap = sm('R1', { A: [5, 4, 5, 4], B: [4, 3, 5, 4] })
  const a = strokeRoundResult({ round: R('R1'), playerId: 'A', scoresMap, hcpByPlayer: { A: 2, B: 0 } })
  assert.equal(a.playingHcp, 2)
  assert.deepEqual(a.perHole.map(h => h.net), [4, 3, 5, 4])
  assert.deepEqual(a.perHole.map(h => h.points), [2, 2, 2, 2])
  assert.equal(a.gross, 18); assert.equal(a.net, 16); assert.equal(a.points, 8)
  assert.equal(a.grossToPar, 2); assert.equal(a.netToPar, 0)
  assert.equal(a.complete, true)
})

test('the trip allowance scales the playing handicap', () => {
  const scoresMap = sm('R1', { A: [5, 4, 5, 4] })
  const a = strokeRoundResult({ round: R('R1'), playerId: 'A', scoresMap, hcpByPlayer: { A: 4 }, allowance: 50 })
  assert.equal(a.playingHcp, 2)
  const r = strokeRoundResult({ round: R('R1', { handicap_allowance: 100 }), playerId: 'A', scoresMap, hcpByPlayer: { A: 4 }, allowance: 50 })
  assert.equal(r.playingHcp, 4) // the course's own allowance wins
})

test('a round in progress totals only the holes played; unplayed → null', () => {
  const scoresMap = sm('R1', { A: [3, null, null, null] })
  const a = strokeRoundResult({ round: R('R1'), playerId: 'A', scoresMap, hcpByPlayer: { A: 0 } })
  assert.equal(a.holes, 1); assert.equal(a.complete, false)
  assert.equal(a.netToPar, -1); assert.equal(a.points, 3)
  assert.equal(strokeRoundResult({ round: R('R1'), playerId: 'Z', scoresMap, hcpByPlayer: {} }), null)
})

test('a 12-hole round (The Dozen) uses its own hole count', () => {
  const holes12 = Array.from({ length: 12 }, (_, i) => ({ par: 3, handicap: i + 1 }))
  const round = R('D', { holes: holes12, course_rating: 36, par_total: 36 })
  const scoresMap = sm('D', { A: Array(12).fill(3) })
  const a = strokeRoundResult({ round, playerId: 'A', scoresMap, hcpByPlayer: { A: 0 } })
  assert.equal(a.totalHoles, 12); assert.equal(a.complete, true); assert.equal(a.points, 24)
})

const rounds = [R('R1'), R('R2'), R('RP', { round_type: 'practice' })]
const scoresMap = {
  ...sm('R1', { A: [4, 3, 5, 4], B: [5, 4, 6, 5], C: [6, 5, 7, 6] }),
  ...sm('R2', { A: [5, 4, 6, 5], B: [3, 3, 5, 4] }),
  ...sm('RP', { C: [3, 2, 3, 3] }), // practice never counts
}
const hcpByPlayer = { A: 0, B: 0, C: 4 }

test('individual Stableford standings: most points wins, per round and for the trip', () => {
  const s = individualStandings({ gameType: 'stableford', rounds, playerIds: ['A', 'B', 'C', 'D'], scoresMap, hcpByPlayer })
  assert.deepEqual(s.rounds.map(r => r.id), ['R1', 'R2'])
  // R1: A 8 · B 4 · C (4 strokes → net 5/4/6/5) 4. R2: A 4 · B 9.
  assert.equal(s.perRound.get('A').get('R1').points, 8)
  assert.equal(s.perRound.get('C').get('R1').points, 4)
  assert.equal(s.total.get('B').points, 13)
  assert.deepEqual(s.ranked.map(r => [r.id, r.value, r.rank]), [['B', 13, 1], ['A', 12, 2], ['C', 4, 3], ['D', null, null]])
  assert.deepEqual(s.rankedByRound.get('R1').map(r => [r.id, r.rank]), [['A', 1], ['B', 2], ['C', 2], ['D', null]])
})

test('individual stroke play standings: lowest net to par wins; gross kept too', () => {
  const s = individualStandings({ gameType: 'stroke', rounds, playerIds: ['A', 'B', 'C'], scoresMap, hcpByPlayer })
  assert.equal(s.total.get('A').gross, 36); assert.equal(s.total.get('A').grossToPar, 4)
  assert.equal(s.total.get('C').net, 20); assert.equal(s.total.get('C').netToPar, 4)
  assert.deepEqual(s.ranked.map(r => [r.id, r.value, r.rank]), [['B', 3, 1], ['A', 4, 2], ['C', 4, 2]])
})

test('team Stableford = the sum of every member\'s points', () => {
  const s = teamStandings({ format: 'stableford', rounds, scoresMap, hcpByPlayer, teamIds: ['T1', 'T2'], teamOfPlayer: { A: 'T1', C: 'T1', B: 'T2' } })
  assert.equal(s.perRound.get('T1').get('R1').pts, 12)
  assert.equal(s.perRound.get('T1').get('R2').pts, 4)
  assert.equal(s.total.get('T1'), 16); assert.equal(s.total.get('T2'), 13)
  assert.deepEqual(s.ranked.map(r => [r.teamId, r.rank]), [['T1', 1], ['T2', 2]])
  assert.equal(s.perRound.get('T2').get('R1').scored, 4)
})

test('team Stableford from raw rows matches', () => {
  const scores = Object.entries(scoresMap).map(([k, g]) => { const [round_id, trip_player_id, h] = k.split(':'); return { round_id, trip_player_id, hole_number: +h, gross_score: g } })
  const tripPlayers = [{ id: 'A', team_id: 'T1', handicap_index: 0 }, { id: 'C', team_id: 'T1', handicap_index: 4 }, { id: 'B', team_id: 'T2', handicap_index: 0 }]
  const s = teamStandingsFromRows({ format: 'stableford', rounds, scores, tripPlayers })
  assert.equal(s.total.get('T1'), 16); assert.equal(s.total.get('T2'), 13)
})

test('game type from the trip row; old "no tournament" trips stay that way', () => {
  assert.equal(tripGameType({ format: 'stableford', team_mode: true }), 'stableford')
  assert.equal(tripGameType({ format: 'stroke_play', team_mode: true }), 'stroke')
  assert.equal(tripGameType({ format: 'stroke_play', team_mode: false }), null)
  assert.equal(tripGameType({ format: 'standard_match_play', team_mode: true }), 'match')
  assert.equal(tripGameType({ format: 'points_match_play', team_mode: true }), 'match')
  assert.equal(isIndividualGameType('stableford'), true)
  assert.equal(isIndividualGameType('match'), false)
  assert.equal(tournamentFormatLabel('stableford'), 'Stableford')
})

test('team stroke play = the sum of members\' net to par; lowest wins', () => {
  const s = teamStandings({ format: 'stroke_play', rounds, scoresMap, hcpByPlayer, teamIds: ['T1', 'T2'], teamOfPlayer: { A: 'T1', C: 'T1', B: 'T2' } })
  // R1: A 0 + C (net 20 on par 16) +4 = 4 ; R2: A +4 → T1 8. T2: B +4 then −1 → 3.
  assert.equal(s.perRound.get('T1').get('R1').pts, 4)
  assert.equal(s.total.get('T1'), 8); assert.equal(s.total.get('T2'), 3)
  assert.equal(s.lowWins, true)
  assert.deepEqual(s.ranked.map(r => [r.teamId, r.rank]), [['T2', 1], ['T1', 2]])
})
