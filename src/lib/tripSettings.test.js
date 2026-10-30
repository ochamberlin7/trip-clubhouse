import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanTripName, saveTripName, timeZoneLabel, timeZoneOptions, TRIP_NAME_MAX } from './tripSettings.js'

test('trip name is trimmed and required', () => {
  assert.deepEqual(cleanTripName('  CTI Washington 2027 '), { name: 'CTI Washington 2027', error: '' })
  assert.match(cleanTripName('   ').error, /empty/)
  assert.match(cleanTripName('x'.repeat(TRIP_NAME_MAX + 1)).error, /under/)
})

function fakeClient(result = { error: null }) {
  const calls = []
  return {
    calls,
    from: table => ({ update: patch => ({ eq: (col, val) => { calls.push({ table, patch, col, val }); return Promise.resolve(result) } }) }),
  }
}

test('saveTripName writes the trimmed name', async () => {
  const c = fakeClient()
  const r = await saveTripName(c, 't1', '  New Name ', 'Old')
  assert.equal(r.error, '')
  assert.deepEqual(c.calls, [{ table: 'trips', patch: { name: 'New Name' }, col: 'id', val: 't1' }])
})

test('saveTripName skips an unchanged name and reports errors', async () => {
  const c = fakeClient()
  assert.equal((await saveTripName(c, 't1', 'Same ', 'Same')).unchanged, true)
  assert.equal(c.calls.length, 0)
  assert.match((await saveTripName(c, 't1', '')).error, /empty/)
  const bad = fakeClient({ error: { message: 'nope' } })
  assert.match((await saveTripName(bad, 't1', 'X')).error, /Couldn/)
})

test('time zone labels', () => {
  assert.equal(timeZoneLabel(null), 'Not set')
  assert.equal(timeZoneLabel('America/Los_Angeles'), 'Pacific Time')
  assert.equal(timeZoneLabel('America/Detroit'), 'Eastern Time')
  assert.equal(timeZoneLabel('Europe/London'), 'London')
})

test('picker keeps an unlisted current zone', () => {
  assert.equal(timeZoneOptions('America/Detroit')[0].value, 'America/Detroit')
  assert.equal(timeZoneOptions('America/Chicago').some(z => z.value === 'America/Chicago'), true)
  assert.equal(timeZoneOptions('America/Chicago').length, 7)
})
