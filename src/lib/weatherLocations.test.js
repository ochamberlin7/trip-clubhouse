// Weather-widget location pager logic. Run: `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { weatherLocKey, buildWeatherLocations, defaultWeatherIndex } from './weatherLocations.js'

const TODAY = '2026-09-10'

test('weatherLocKey — coords take priority and round to 3dp', () => {
  assert.equal(weatherLocKey({ location_lat: 44.401234, location_lon: -84.599876 }), 'c:44.401,-84.600')
  // Same course, coords a hair different past 3dp → same key (dedupes).
  assert.equal(
    weatherLocKey({ location_lat: 44.4012, location_lon: -84.5999 }),
    weatherLocKey({ location_lat: 44.4014, location_lon: -84.5998 }),
  )
  // No coords → city+state (case/space-insensitive).
  assert.equal(weatherLocKey({ location_city: 'Bandon', location_state: 'OR' }), 'n:bandon|or')
  assert.equal(weatherLocKey({ location_city: ' bandon ', location_state: 'or' }), 'n:bandon|or')
  // No location data at all → null.
  assert.equal(weatherLocKey({ club_name: 'Somewhere GC' }), null)
})

// (a) A trip with a single location (even across multiple rounds) → one location.
test('single location: multiple rounds at the same place collapse to one', () => {
  const rounds = [
    { date: '2026-09-11', location_lat: 44.4012, location_lon: -84.5999, location_city: 'Roscommon', location_state: 'MI' },
    { date: '2026-09-12', location_lat: 44.4013, location_lon: -84.5998, location_city: 'Roscommon', location_state: 'MI' },
  ]
  const locs = buildWeatherLocations(rounds, 'CTI Michigan')
  assert.equal(locs.length, 1)                 // one distinct location → no dots / not swipeable
  assert.equal(locs[0].label, 'Roscommon, MI')
})

// (b) Multiple distinct locations → right count, chronological order.
test('multiple locations: deduped, ordered by earliest date', () => {
  const rounds = [
    { date: '2026-09-14', location_city: 'Pinehurst', location_state: 'NC' },       // 3rd chronologically
    { date: '2026-09-11', location_lat: 44.401, location_lon: -84.600, location_city: 'Roscommon', location_state: 'MI' }, // 1st
    { date: '2026-09-12', location_lat: 44.401, location_lon: -84.600, location_city: 'Roscommon', location_state: 'MI' }, // dup of 1st
    { date: '2026-09-13', location_city: 'Bandon', location_state: 'OR' },           // 2nd
    { date: '2026-09-15', club_name: 'No Location GC' },                              // ignored (no data)
  ]
  const locs = buildWeatherLocations(rounds, 'Trip')
  assert.deepEqual(locs.map(l => l.label), ['Roscommon, MI', 'Bandon, OR', 'Pinehurst, NC'])
  assert.equal(locs.length, 3)
})

// (c) Default index = the next upcoming round's location, regardless of list order.
test('default index: next upcoming round with data (>= today)', () => {
  const rounds = [
    { date: '2026-09-08', location_city: 'Past City', location_state: 'CA' },  // past
    { date: '2026-09-13', location_city: 'Bandon', location_state: 'OR' },     // next upcoming
    { date: '2026-09-16', location_city: 'Pinehurst', location_state: 'NC' },  // later
  ]
  const locs = buildWeatherLocations(rounds, 'Trip')
  const idx = defaultWeatherIndex(rounds, locs, TODAY)
  assert.equal(locs[idx].label, 'Bandon, OR')
})

test('default index: trip over → last round with data', () => {
  const rounds = [
    { date: '2026-09-01', location_city: 'Bandon', location_state: 'OR' },
    { date: '2026-09-05', location_city: 'Pinehurst', location_state: 'NC' }, // last, all in the past
  ]
  const locs = buildWeatherLocations(rounds, 'Trip')
  const idx = defaultWeatherIndex(rounds, locs, TODAY)
  assert.equal(locs[idx].label, 'Pinehurst, NC')
})

test('no locations: empty list, default index 0', () => {
  const rounds = [{ date: '2026-09-13', club_name: 'No Location GC' }]
  const locs = buildWeatherLocations(rounds, 'Trip')
  assert.equal(locs.length, 0)
  assert.equal(defaultWeatherIndex(rounds, locs, TODAY), 0)
})
