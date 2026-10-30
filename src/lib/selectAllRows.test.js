// Paged fetch used by the career / badge loader. Run: `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectAllRows } from './careerStats.js'

// A fake query over `total` rows that caps every request at `cap` rows.
function fakeTable(total, cap = 1000) {
  const all = Array.from({ length: total }, (_, i) => ({ i }))
  const calls = []
  const build = (opts = {}) => ({
    range(from, to) {
      calls.push([from, to])
      const data = all.slice(from, Math.min(to + 1, from + cap))
      return Promise.resolve({ data, error: null, count: opts.count ? total : null })
    },
  })
  return { build, calls }
}

test('one request when everything fits in the first page', async () => {
  const t = fakeTable(640)
  const { data } = await selectAllRows(t.build)
  assert.equal(data.length, 640)
  assert.equal(t.calls.length, 1)
})

test('fetches every page past the 1,000-row cap, in order', async () => {
  const t = fakeTable(2450)
  const { data } = await selectAllRows(t.build)
  assert.equal(data.length, 2450)
  assert.deepEqual(data.map(r => r.i), Array.from({ length: 2450 }, (_, i) => i))
  assert.deepEqual(t.calls, [[0, 999], [1000, 1999], [2000, 2999]])
})

test('exactly 1,000 rows needs no second request', async () => {
  const t = fakeTable(1000)
  const { data } = await selectAllRows(t.build)
  assert.equal(data.length, 1000)
  assert.equal(t.calls.length, 1)
})

test('an error on the first page is passed back', async () => {
  const build = () => ({ range: () => Promise.resolve({ data: null, error: { message: 'offline' } }) })
  const res = await selectAllRows(build)
  assert.equal(res.error.message, 'offline')
})
