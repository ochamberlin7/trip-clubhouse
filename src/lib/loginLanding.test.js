// Where login / signup lands. Run: `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { safeRedirect, authRedirectTarget, postLoginDestination } from './loginLanding.js'

const at = iso => new Date(`${iso}T19:00:00Z`) // noon in Phoenix
const trip = (id, start, end) => ({ id, start_date: start, end_date: end, time_zone: 'America/Phoenix' })

test('new account, no invite → Home (never the wizard)', () => {
  assert.equal(authRedirectTarget({}), null)
  assert.deepEqual(postLoginDestination({ trips: [], now: at('2027-03-01') }), { path: '/home', tripId: null })
})

test('existing user with no trips → Home', () => {
  assert.deepEqual(postLoginDestination({ now: at('2027-03-01') }), { path: '/home', tripId: null })
})

test('trip outside the window → Home', () => {
  const t = trip('T', '2027-03-12', '2027-03-15')
  assert.deepEqual(postLoginDestination({ trips: [t], now: at('2027-03-10') }), { path: '/home', tripId: null }) // 2 days before
  assert.deepEqual(postLoginDestination({ trips: [t], now: at('2027-03-17') }), { path: '/home', tripId: null }) // 2 days after
})

test('trip inside the window → that trip', () => {
  const t = trip('T', '2027-03-12', '2027-03-15')
  assert.deepEqual(postLoginDestination({ trips: [t], now: at('2027-03-11') }), { path: '/dashboard', tripId: 'T' }) // the day before
  assert.deepEqual(postLoginDestination({ trips: [t], now: at('2027-03-13') }), { path: '/dashboard', tripId: 'T' })
  assert.deepEqual(postLoginDestination({ trips: [t], now: at('2027-03-16') }), { path: '/dashboard', tripId: 'T' }) // the day after
})

test('mixed trips → only the in-window one opens', () => {
  const old = trip('OLD', '2026-06-01', '2026-06-04')
  const soon = trip('SOON', '2027-03-12', '2027-03-15')
  assert.equal(postLoginDestination({ trips: [old, soon], now: at('2027-03-11') }).tripId, 'SOON')
  assert.equal(postLoginDestination({ trips: [old, soon], now: at('2027-03-05') }).tripId, null) // a week out → Home
})

test('invite link (new or existing account) → back to the invite', () => {
  assert.equal(authRedirectTarget({ redirect: '/join/abc123' }), '/join/abc123')
  assert.equal(authRedirectTarget({ invite: 'tok_9-x' }), '/invite/tok_9-x')
  // explicit redirect beats the older invite param
  assert.equal(authRedirectTarget({ redirect: '/join/abc', invite: 'tok' }), '/join/abc')
})

test('redirects to other sites are ignored', () => {
  for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'evil', '', null, undefined, 42]) {
    assert.equal(safeRedirect(bad), null, String(bad))
  }
  assert.equal(authRedirectTarget({ redirect: '//evil.com' }), null)
  assert.equal(authRedirectTarget({ invite: '../x' }), null)
  assert.equal(safeRedirect('/home'), '/home')
})
