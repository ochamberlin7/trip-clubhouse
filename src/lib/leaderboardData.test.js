// Leaderboard offline data. Run: `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withUnsyncedScores, loadLeaderboardData } from './leaderboardData.js'

test('withUnsyncedScores lays offline scores on top (saves and removals)', () => {
  const data = { pairings: [], scoresMap: { 'R:A:1': 5, 'R:A:2': 4 } }
  const q = [
    { op: 'save', round_id: 'R', trip_player_id: 'A', hole_number: 1, gross_score: 3, count: 0 },
    { op: 'delete', round_id: 'R', trip_player_id: 'A', hole_number: 2 },
    { op: 'save', round_id: 'R', trip_player_id: 'B', hole_number: 1, gross_score: 4, count: 0 },
  ]
  const out = withUnsyncedScores(data, q)
  assert.deepEqual(out.scoresMap, { 'R:A:1': 3, 'R:B:1': 4 })
  assert.equal(data.scoresMap['R:A:1'], 5) // original untouched
  assert.equal(withUnsyncedScores(data, []), data)
  assert.equal(withUnsyncedScores(null, q), null)
})

// Fake client: every query resolves with `res`.
const client = res => {
  const q = { select: () => q, in: () => q, eq: () => q, then: (ok, bad) => Promise.resolve(res).then(ok, bad) }
  return { from: () => q }
}

test('loadLeaderboardData: no signal → offline flag (and no saved copy in Node)', async () => {
  const r = await loadLeaderboardData(client({ data: null, error: { message: 'TypeError: Load failed', code: '' } }), 'T', ['R'])
  assert.equal(r.offline, true)
  assert.equal(r.data, null)
})

test('loadLeaderboardData: builds the score / handicap / tee maps', async () => {
  const rows = { data: [{ id: 'p', round_id: 'R', trip_player_id: 'A', hole_number: 1, gross_score: 4, handicap_index: 8, slope: 113 }], error: null }
  const r = await loadLeaderboardData(client(rows), 'T', ['R'])
  assert.equal(r.offline, undefined)
  assert.equal(r.data.scoresMap['R:A:1'], 4)
  assert.equal(r.data.hcpByPlayer.p, 8)
  assert.equal(r.data.teeRowMap['R:A'].slope, 113)
})
