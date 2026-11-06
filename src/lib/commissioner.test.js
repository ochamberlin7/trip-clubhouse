// Commissioner hand-over (commissioner.js). Run: `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { transferCommissioner } from './commissioner.js'

// Tiny fake of the Supabase query builder: records calls in order.
function fakeClient({ failAdd = false } = {}) {
  const calls = []
  const q = op => ({
    eq(col, v) { calls.at(-1).filters.push([col, v]); return this },
    then(res) { return Promise.resolve({ error: op === 'upsert' && failAdd ? { message: 'nope' } : null }).then(res) },
  })
  return {
    calls,
    from: table => ({
      upsert(row) { calls.push({ table, op: 'upsert', row, filters: [] }); return q('upsert') },
      delete() { calls.push({ table, op: 'delete', filters: [] }); return q('delete') },
    }),
  }
}

test('adds the new commissioner first, then removes you', async () => {
  const c = fakeClient()
  const { error } = await transferCommissioner(c, { tripId: 'T', toUserId: 'B', fromUserId: 'A' })
  assert.equal(error, null)
  assert.deepEqual(c.calls.map(x => x.op), ['upsert', 'delete'])
  assert.deepEqual(c.calls[0].row, { trip_id: 'T', user_id: 'B' })
  assert.deepEqual(c.calls[1].filters, [['trip_id', 'T'], ['user_id', 'A']])
})

test('if adding fails, you are not removed', async () => {
  const c = fakeClient({ failAdd: true })
  const { error } = await transferCommissioner(c, { tripId: 'T', toUserId: 'B', fromUserId: 'A' })
  assert.ok(error)
  assert.deepEqual(c.calls.map(x => x.op), ['upsert'])
})

test('refuses a missing player or handing it to yourself', async () => {
  assert.ok((await transferCommissioner(fakeClient(), { tripId: 'T', toUserId: null, fromUserId: 'A' })).error)
  assert.ok((await transferCommissioner(fakeClient(), { tripId: 'T', toUserId: 'A', fromUserId: 'A' })).error)
})
