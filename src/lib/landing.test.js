// Where the app opens: trip vs player home page. Run: `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tripInLandingWindow, landingTrip, LANDING_DAYS_BEFORE, LANDING_DAYS_AFTER } from './scoring.js'

const trip = { id: 'T', start_date: '2027-03-12', end_date: '2027-03-15', time_zone: 'America/Phoenix' }
const at = iso => new Date(`${iso}T19:00:00Z`) // noon in Phoenix

test('window is 24 hours before through 24 hours after', () => {
  assert.equal(LANDING_DAYS_BEFORE, 1)
  assert.equal(LANDING_DAYS_AFTER, 1)
  assert.equal(tripInLandingWindow(trip, at('2027-03-10')), false) // 2 days before
  assert.equal(tripInLandingWindow(trip, at('2027-03-11')), true)  // the day before
  assert.equal(tripInLandingWindow(trip, at('2027-03-13')), true)  // during
  assert.equal(tripInLandingWindow(trip, at('2027-03-16')), true)  // the day after
  assert.equal(tripInLandingWindow(trip, at('2027-03-17')), false) // 2 days after
  // Edges in the trip's zone: midnight starting the day before, 11:59pm ending the day after.
  assert.equal(tripInLandingWindow(trip, new Date('2027-03-11T06:59:00Z')), false) // 11:59pm Mar 10 Phoenix
  assert.equal(tripInLandingWindow(trip, new Date('2027-03-11T07:00:00Z')), true)  // 12:00am Mar 11 Phoenix
  assert.equal(tripInLandingWindow(trip, new Date('2027-03-17T06:59:00Z')), true)  // 11:59pm Mar 16 Phoenix
  assert.equal(tripInLandingWindow(trip, new Date('2027-03-17T07:00:00Z')), false) // 12:00am Mar 17 Phoenix
})

test('uses the trip time zone, not the viewer clock', () => {
  const east = { ...trip, time_zone: 'America/New_York' }
  // 11:30pm Mar 10 in Phoenix = 1:30am Mar 11 in New York → inside the window there.
  const now = new Date('2027-03-11T06:30:00Z')
  assert.equal(tripInLandingWindow(trip, now), false)
  assert.equal(tripInLandingWindow(east, now), true)
})

test('landingTrip: null when nothing is close; ongoing beats upcoming; nearest wins', () => {
  assert.equal(landingTrip([trip], at('2026-10-27')), null)
  assert.equal(landingTrip([], at('2027-03-13')), null)
  const next = { id: 'N', start_date: '2027-03-20', end_date: '2027-03-22', time_zone: 'America/Phoenix' }
  assert.equal(landingTrip([next, trip], at('2027-03-13')).id, 'T')      // T is ongoing
  const soon = { id: 'S', start_date: '2027-03-17', end_date: '2027-03-18', time_zone: 'America/Phoenix' }
  assert.equal(landingTrip([soon, trip], at('2027-03-16')).id, 'T')      // tie: T ended 1 day ago, S starts in 1 → earlier start
  assert.equal(landingTrip([next, trip], at('2027-03-18')), null)        // T ended 3 days ago, N starts in 2
})
