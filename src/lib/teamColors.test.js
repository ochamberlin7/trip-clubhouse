// Guards the shared team palette: four distinct team identity colours, index-keyed,
// with a safe fallback, and CSS-var publishing from the same source.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TEAM_COLORS, teamColor, applyTeamColorVars } from './teamColors.js'

test('teams 1-4 are red / blue / green / purple and all distinct', () => {
  assert.equal(TEAM_COLORS[1].solid, '#C62828') // red
  assert.equal(TEAM_COLORS[2].solid, '#1C64A6') // blue
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
