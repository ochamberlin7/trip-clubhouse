import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validTeamCounts, teamCountChoices, planTeamCountChange } from './teamCount.js'

test('valid team counts split the roster evenly', () => {
  assert.deepEqual(validTeamCounts(8), [2, 4])
  assert.deepEqual(validTeamCounts(12), [2, 3, 4])
  assert.deepEqual(validTeamCounts(9), [3])
  assert.deepEqual(validTeamCounts(7), [])
  assert.deepEqual(validTeamCounts(3), [])
  assert.deepEqual(validTeamCounts(4), [2])
})

test('choices always include the current count', () => {
  assert.deepEqual(teamCountChoices(8, 2), [2, 4])
  assert.deepEqual(teamCountChoices(9, 2), [2, 3]) // a player joined since; 2 still shown
  assert.deepEqual(teamCountChoices(7, 2), [2])
})

const teams = [
  { id: 'a', team_index: 1 }, { id: 'b', team_index: 2 },
  { id: 'c', team_index: 3 }, { id: 'd', team_index: 4 },
]
const players = [
  { id: 'p1', team_id: 'a' }, { id: 'p2', team_id: 'b' },
  { id: 'p3', team_id: 'c' }, { id: 'p4', team_id: 'd' }, { id: 'p5', team_id: null },
]

test('more teams: empty teams added after the last', () => {
  const p = planTeamCountChange({ teams: teams.slice(0, 2), players, target: 4 })
  assert.equal(p.ok, true)
  assert.deepEqual(p.add, [{ team_index: 3, color_index: 3 }, { team_index: 4, color_index: 4 }])
  assert.deepEqual(p.removeTeams, [])
  assert.deepEqual(p.unassignPlayers, [])
})

test('fewer teams: highest-numbered removed, their players unassigned', () => {
  const p = planTeamCountChange({ teams: teams.slice().reverse(), players, target: 2 })
  assert.equal(p.ok, true)
  assert.deepEqual(p.removeTeams.map(t => t.id), ['c', 'd'])
  assert.deepEqual(p.unassignPlayers.map(x => x.id), ['p3', 'p4'])
  assert.deepEqual(p.add, [])
})

test('rejects the same count and out-of-range counts', () => {
  assert.equal(planTeamCountChange({ teams: teams.slice(0, 2), target: 2 }).ok, false)
  assert.equal(planTeamCountChange({ teams, target: 5 }).ok, false)
  assert.equal(planTeamCountChange({ teams, target: 1 }).ok, false)
})
