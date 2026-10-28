// Where the app opens: trip vs player home page. Run: `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tripInLandingWindow, landingTrip, LANDING_DAYS_BEFORE, LANDING_DAYS_AFTER } from './scoring.js'

const trip = { id: 'T', start_date: '2027-03-12', end_date: '2027-03-15', time_zone: 'America/Phoenix' }
const at = iso => new Date(`${iso}T19:00:00Z`) // noon in Phoenix

test('window is 14 days before through 7 days after', () => {
  assert.equal(LANDING_DAYS_BEFORE, 14)
  assert.equal(LANDING_DAYS_AFTER, 7)
  assert.equal(tripInLandingWindow(trip, at('2027-02-25')), false) // 15 days before
  assert.equal(tripInLandingWindow(trip, at('2027-02-26')), true)  // 14 days before
  assert.equal(tripInLandingWindow(trip, at('2027-03-13')), true)  // during
  assert.equal(tripInLandingWindow(trip, at('2027-03-22')), true)  // 7 days after
  assert.equal(tripInLandingWindow(trip, at('2027-03-23')), false) // 8 days after
})

test('uses the trip time zone, not the viewer clock', () => {
  const east = { ...trip, time_zone: 'America/New_York' }
  // 11:30pm Feb 25 in Phoenix = 1:30am Feb 26 in New York → inside the window there.
  const now = new Date('2027-02-26T06:30:00Z')
  assert.equal(tripInLandingWindow(trip, now), false)
  assert.equal(tripInLandingWindow(east, now), true)
})

test('landingTrip: null when nothing is close; ongoing beats upcoming; nearest wins', () => {
  assert.equal(landingTrip([trip], at('2026-10-27')), null)
  assert.equal(landingTrip([], at('2027-03-13')), null)
  const next = { id: 'N', start_date: '2027-03-20', end_date: '2027-03-22', time_zone: 'America/Phoenix' }
  assert.equal(landingTrip([next, trip], at('2027-03-13')).id, 'T')      // T is ongoing
  assert.equal(landingTrip([next, trip], at('2027-03-17')).id, 'T')      // T ended 2 days ago, N starts in 3
  assert.equal(landingTrip([next, trip], at('2027-03-18')).id, 'N')      // T ended 3 days ago, N starts in 2
})
