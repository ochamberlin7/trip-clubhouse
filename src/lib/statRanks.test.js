// Stat leaderboard ranks + short names. Run: `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rankRows } from './statRanks.js'
import { shortNameResolver } from './playerNames.js'

const P = (name, v) => ({ name, v })
const byName = p => p.name

test('rankRows: ties share a rank, next rank skips, nulls last', () => {
  const rows = rankRows([P('Cody', 6), P('Ben', 7), P('Owen', 6), P('Jeff', null), P('Nate', 3)], p => p.v, { hi: true, nameOf: byName })
  assert.deepEqual(rows.map(r => [r.item.name, r.rank]), [['Ben', 1], ['Cody', 2], ['Owen', 2], ['Nate', 4], ['Jeff', null]])
})

test('rankRows: lower is better (best round)', () => {
  const rows = rankRows([P('A', 82), P('B', 78), P('C', 78)], p => p.v, { hi: false, nameOf: byName })
  assert.deepEqual(rows.map(r => [r.item.name, r.rank]), [['B', 1], ['C', 1], ['A', 3]])
})

test('shortNameResolver: first name, last initial only for shared first names', () => {
  const short = shortNameResolver(['Mike Saylor', 'Mike Thomas', 'Owen Chamberlin', 'Cher'])
  assert.equal(short('Owen Chamberlin'), 'Owen')
  assert.equal(short('Mike Saylor'), 'Mike S.')
  assert.equal(short('Mike Thomas'), 'Mike T.')
  assert.equal(short('Cher'), 'Cher')
})
