// Side-by-side Leaderboard wording. Run: `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fmtPoints, roundCell, dayLabel, leadLine } from './leaderboardView.js'

test('fmtPoints: whole numbers and Ryder Cup halves', () => {
  assert.equal(fmtPoints(3), '3')
  assert.equal(fmtPoints(1.5), '1½')
  assert.equal(fmtPoints(0.5), '½')
  assert.equal(fmtPoints(0), '0')
})

test('roundCell: dash until played (per format)', () => {
  assert.equal(roundCell('point_match_play', { pts: 0, scored: 0 }), '—')
  assert.equal(roundCell('point_match_play', { pts: 9, scored: 54 }), '9')
  assert.equal(roundCell('standard_match_play', { pts: 0, matches: 1, completed: 0 }), '—')
  assert.equal(roundCell('standard_match_play', { pts: 0.5, matches: 1, completed: 1 }), '½')
})

test('dayLabel from the trip start date', () => {
  assert.equal(dayLabel({ date: '2026-11-05' }, '2026-11-05'), 'Day 1')
  assert.equal(dayLabel({ date: '2026-11-07' }, '2026-11-05'), 'Day 3')
  assert.equal(dayLabel({ date: null }, '2026-11-05'), null)
})

const teams = [{ id: 'A', name: 'Bandits', team_index: 1 }, { id: 'B', name: 'Sandbaggers', team_index: 2 }]
const rounds = [{ id: 'R1' }, { id: 'R2' }, { id: 'R3' }]
function standings(cells, ranked) {
  const perRound = new Map(Object.entries(cells).map(([t, rs]) => [t, new Map(Object.entries(rs))]))
  return { perRound, ranked }
}

test('leadLine: leader, margin and rounds left', () => {
  const s = standings({ A: { R1: { pts: 9, scored: 54 }, R2: { pts: 12, scored: 54 } }, B: { R1: { pts: 7, scored: 54 }, R2: { pts: 10, scored: 54 } } },
    [{ teamId: 'A', total: 21, rank: 1 }, { teamId: 'B', total: 17, rank: 2 }])
  assert.equal(leadLine({ format: 'point_match_play', teams, standings: s, rounds }), 'Bandits lead by 4 · 1 round left')
})

test('leadLine: all square, final, default names, nothing yet', () => {
  const tie = standings({ A: { R1: { pts: 5, scored: 54 } }, B: { R1: { pts: 5, scored: 54 } } }, [{ teamId: 'A', total: 5, rank: 1 }, { teamId: 'B', total: 5, rank: 1 }])
  assert.equal(leadLine({ format: 'point_match_play', teams, standings: tie, rounds: [{ id: 'R1' }] }), 'All square · Final')
  const dflt = [{ id: 'A', team_index: 1 }, { id: 'B', team_index: 2 }]
  const win = standings({ A: { R1: { pts: 1.5, completed: 1 } }, B: { R1: { pts: 0.5, completed: 1 } } }, [{ teamId: 'A', total: 1.5, rank: 1 }, { teamId: 'B', total: 0.5, rank: 2 }])
  assert.equal(leadLine({ format: 'standard_match_play', teams: dflt, standings: win, rounds: [{ id: 'R1' }] }), 'Team 1 wins by 1 · Final')
  const none = standings({ A: {}, B: {} }, [{ teamId: 'A', total: 0, rank: 1 }, { teamId: 'B', total: 0, rank: 1 }])
  assert.equal(leadLine({ format: 'point_match_play', teams, standings: none, rounds }), 'No scores yet')
})

test('stroke play: cells and totals read as net to par; lowest leads', async () => {
  const { fmtTotal: ft } = await import('./leaderboardView.js')
  assert.equal(ft('stroke_play', 0), 'E')
  assert.equal(ft('stroke_play', 3), '+3')
  assert.equal(ft('stableford', 41), '41')
  assert.equal(roundCell('stroke_play', { pts: -2, scored: 18 }), '-2')
  const teams = [{ id: 'A', name: 'Bandits' }, { id: 'B', name: 'Outlaws' }]
  const perRound = new Map([['A', new Map([['R1', { pts: 2, scored: 36 }]])], ['B', new Map([['R1', { pts: 7, scored: 36 }]])]])
  const s = { perRound, total: new Map([['A', 2], ['B', 7]]), ranked: [{ teamId: 'A', total: 2, rank: 1 }, { teamId: 'B', total: 7, rank: 2 }] }
  assert.equal(leadLine({ format: 'stroke_play', teams, standings: s, rounds: [{ id: 'R1' }] }), 'Bandits win by 5 · Final')
})
