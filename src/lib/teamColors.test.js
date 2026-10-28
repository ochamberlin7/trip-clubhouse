// Guards the shared team palette: four distinct team identity colours, index-keyed,
// with a safe fallback, and CSS-var publishing from the same source.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TEAM_COLORS, teamColor, applyTeamColorVars } from './teamColors.js'

test('teams 1-4 are red / blue / green / purple and all distinct', () => {
  assert.equal(TEAM_COLORS[1].solid, '#B22234') // red
  assert.equal(TEAM_COLORS[2].solid, '#003399') // blue
  assert.equal(TEAM_COLORS[3].solid, '#1E7A46') // green
  assert.equal(TEAM_COLORS[4].solid, '#7A3F9E') // purple
  const solids = [1, 2, 3, 4, 5, 6].map(i => TEAM_COLORS[i].solid)
  assert.equal(new Set(solids).size, solids.length) // every team colour is unique
})

test('teamColor falls back to team 1 for an unknown index', () => {
  assert.deepEqual(teamColor(99), TEAM_COLORS[1])
  assert.deepEqual(teamColor(2), TEAM_COLORS[2])
})

test('applyTeamColorVars publishes --team-1..6 from the palette (single source)', () => {
  const set = {}
  applyTeamColorVars({ style: { setProperty: (k, v) => { set[k] = v } } })
  assert.equal(set['--team-1'], TEAM_COLORS[1].solid)
  assert.equal(set['--team-4'], TEAM_COLORS[4].solid)
  assert.equal(Object.keys(set).length, 6)
})

// ── Past trips keep the old palette ─────────────────────────────
import { paletteForTrip, setTeamPalette, LEGACY_TEAM_COLORS, TEAM_COLORS_CHANGED_ON } from './teamColors.js'

test('paletteForTrip: trips that ended before the change keep the old colours', () => {
  assert.equal(TEAM_COLORS_CHANGED_ON, '2026-10-27')
  assert.equal(paletteForTrip({ end_date: '2026-10-04' }), 'legacy')   // CTI Michigan
  assert.equal(paletteForTrip({ end_date: '2026-10-27' }), 'current')  // ends on the day → new
  assert.equal(paletteForTrip({ end_date: '2026-11-08' }), 'current')
  assert.equal(paletteForTrip({ end_date: null }), 'current')
  assert.equal(paletteForTrip(null), 'current')
})

test('setTeamPalette switches what teamColor returns, and back', () => {
  setTeamPalette('legacy')
  assert.equal(teamColor(1).solid, LEGACY_TEAM_COLORS[1].solid) // navy
  assert.equal(teamColor(2).solid, '#0F6E56')                    // teal
  setTeamPalette('current')
  assert.equal(teamColor(1).solid, TEAM_COLORS[1].solid)        // red
  assert.notEqual(teamColor(1).solid, LEGACY_TEAM_COLORS[1].solid)
})
