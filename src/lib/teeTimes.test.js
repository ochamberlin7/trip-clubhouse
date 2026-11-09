import { test } from 'node:test'
import assert from 'node:assert/strict'
import { teeSlotCount, TEE_TIME_COLUMNS } from './teeTimes.js'

test('teeSlotCount: one pairing slot per group of four, at least one', () => {
  assert.equal(teeSlotCount(0), 1)
  assert.equal(teeSlotCount(4), 1)
  assert.equal(teeSlotCount(5), 2)
  assert.equal(teeSlotCount(8), 2)
  assert.equal(teeSlotCount(9), 3)
  assert.equal(teeSlotCount(16), 4)
})

test('teeSlotCount: never more slots than stored columns', () => {
  assert.equal(teeSlotCount(20), 5)
  assert.equal(teeSlotCount(40), 5)
  assert.equal(TEE_TIME_COLUMNS.length, 5)
  assert.equal(TEE_TIME_COLUMNS[4], 'tee_time_5')
})
