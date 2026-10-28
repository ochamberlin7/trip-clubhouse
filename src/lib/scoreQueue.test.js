// Offline score outbox. Run: `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addToQueue, overlayQueue, isNetworkError, cellKey, enqueue, getQueue, flushQueue } from './scoreQueue.js'

const save = (hole, gross, count = 0) => ({ op: 'save', round_id: 'R', trip_player_id: 'A', hole_number: hole, gross_score: gross, count })

test('addToQueue: one entry per cell, latest edit wins, order kept', () => {
  let q = addToQueue([], save(1, 4))
  q = addToQueue(q, save(2, 5))
  q = addToQueue(q, save(1, 3))                  // re-edit hole 1
  assert.deepEqual(q.map(x => [x.hole_number, x.gross_score]), [[2, 5], [1, 3]])
  q = addToQueue(q, { op: 'delete', round_id: 'R', trip_player_id: 'A', hole_number: 2 })
  assert.deepEqual(q.map(x => [x.hole_number, x.op]), [[1, 'save'], [2, 'delete']])
})

test('overlayQueue: unsynced edits win over fetched data', () => {
  const fetched = { [cellKey('R', 'A', 1)]: 6, [cellKey('R', 'A', 2)]: 5 }
  const drinks = { [cellKey('R', 'A', 2)]: 1 }
  const q = [save(1, 4, 2), { op: 'delete', round_id: 'R', trip_player_id: 'A', hole_number: 2 }]
  const { scores, drinks: d } = overlayQueue(fetched, drinks, q)
  assert.equal(scores[cellKey('R', 'A', 1)], 4)
  assert.equal(d[cellKey('R', 'A', 1)], 2)
  assert.equal(cellKey('R', 'A', 2) in scores, false)
  assert.equal(cellKey('R', 'A', 2) in d, false)
})

test('isNetworkError: connection failures yes, real rejections no', () => {
  // Shapes the Supabase library returns when the request never got an answer.
  assert.equal(isNetworkError({ message: 'TypeError: Failed to fetch', code: '' }, true), true)
  assert.equal(isNetworkError({ message: 'TypeError: Load failed', code: '' }, true), true)          // iPhone Safari
  assert.equal(isNetworkError({ message: 'TypeError: The Internet connection appears to be offline.', code: '' }, true), true)
  assert.equal(isNetworkError({ message: 'Something unexpected', code: '' }, true), true)            // any wording, no code
  assert.equal(isNetworkError({ message: 'x', code: 'PGRST301', status: 0 }, true), true)           // status 0 = no answer
  assert.equal(isNetworkError(new TypeError('Load failed'), true), true)                             // thrown, no code
  assert.equal(isNetworkError({ message: 'anything', code: '42501' }, false), true)                 // phone says offline
  // Real rejections from the database carry a code.
  assert.equal(isNetworkError({ message: 'new row violates row-level security policy', code: '42501' }, true), false)
  assert.equal(isNetworkError({ message: 'duplicate key', code: '23505' }, true), false)
  assert.equal(isNetworkError(null, true), false)
})

// Minimal fake Supabase client: `fail` = 'network' | 'reject' | null per call.
function fakeClient(plan) {
  const calls = []
  let i = 0
  const result = () => {
    const f = plan[i++] ?? null
    return Promise.resolve({ error: f === 'network' ? { message: 'TypeError: Load failed', code: '', status: 0 } : f === 'reject' ? { message: 'permission denied', code: '42501' } : null })
  }
  const chain = (table, op) => {
    const q = { eq: () => q, then: (res, rej) => { calls.push(`${op}:${table}`); return result().then(res, rej) } }
    return q
  }
  return {
    calls,
    from: table => ({
      upsert: () => ({ then: (res, rej) => { calls.push(`upsert:${table}`); return result().then(res, rej) } }),
      delete: () => chain(table, 'delete'),
    }),
  }
}

test('flushQueue: sends in order, stops at no signal, keeps the rest', async () => {
  assert.equal(getQueue().length, 0) // fresh module in Node starts empty
  enqueue(save(1, 4)); enqueue(save(2, 5)); enqueue(save(3, 3))
  const synced = []
  // hole 1: score ok + drinks delete ok; hole 2: score fails with no signal → stop.
  const client = fakeClient([null, null, 'network'])
  await flushQueue(client, { onSynced: x => synced.push(x.hole_number) })
  assert.deepEqual(synced, [1])
  assert.deepEqual(getQueue().map(x => x.hole_number), [2, 3])
  // Signal back: the rest go through.
  await flushQueue(fakeClient([null, null, null, null]), { onSynced: x => synced.push(x.hole_number) })
  assert.deepEqual(synced, [1, 2, 3])
  assert.equal(getQueue().length, 0)
})

test('flushQueue: a real rejection is dropped and reported, not retried forever', async () => {
  enqueue(save(7, 4))
  const rejected = []
  await flushQueue(fakeClient(['reject']), { onRejected: x => rejected.push(x.hole_number) })
  assert.deepEqual(rejected, [7])
  assert.equal(getQueue().length, 0)
})
