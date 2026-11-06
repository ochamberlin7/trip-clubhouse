// Group dropdown data (myGroups.js). Run: `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeGroups, groupMeta, baseGroupName } from './myGroups.js'

const m = (id, name) => ({ group_id: id, groups: { id, name } })

test('groups sorted by most recent trip, with trip counts', () => {
  const out = summarizeGroups(
    [m('a', 'Work outing'), m('b', 'CTI Boys'), m('c', 'Bachelor party')],
    [
      { group_id: 'b', start_date: '2023-10-01' }, { group_id: 'b', start_date: '2026-10-01' },
      { group_id: 'a', start_date: '2024-05-01' }, { group_id: 'c', start_date: '2025-06-01' },
    ],
  )
  assert.deepEqual(out.map(g => [g.name, g.trips, g.lastYear]), [['CTI Boys', 2, '2026'], ['Bachelor party', 1, '2025'], ['Work outing', 1, '2024']])
})

test('a group with no trips left is not offered; duplicate memberships count once', () => {
  const out = summarizeGroups([m('a', 'Old'), m('b', 'Live'), m('b', 'Live')], [{ group_id: 'b', start_date: '2026-01-01' }])
  assert.deepEqual(out.map(g => g.id), ['b'])
})

test('trips without dates still count; blank names get a label', () => {
  const out = summarizeGroups([m('a', '  ')], [{ group_id: 'a', start_date: null }])
  assert.equal(out[0].name, 'Unnamed group')
  assert.equal(groupMeta(out[0]), '1 trip')
  assert.equal(groupMeta({ trips: 4, lastYear: '2026' }), '4 trips · 2026')
})

test('a group name shows once, whatever the year (most recent group wins)', () => {
  const out = summarizeGroups(
    [m('a', 'Couch Tour Invitational 2026'), m('b', 'Couch Tour Invitational 2027'), m('c', 'couch tour invitational'), m('d', 'Work outing')],
    [
      { group_id: 'a', start_date: '2026-03-01' }, { group_id: 'b', start_date: '2027-03-01' },
      { group_id: 'c', start_date: '2024-03-01' }, { group_id: 'd', start_date: '2025-01-01' },
    ],
  )
  assert.deepEqual(out.map(g => [g.id, g.name]), [['b', 'Couch Tour Invitational'], ['d', 'Work outing']])
})

test('baseGroupName drops a trailing year only', () => {
  assert.equal(baseGroupName('CTI Boys 2026'), 'CTI Boys')
  assert.equal(baseGroupName("CTI Boys '26"), 'CTI Boys')
  assert.equal(baseGroupName('CTI Boys - 2026'), 'CTI Boys')
  assert.equal(baseGroupName('Class of 2010 Golf'), 'Class of 2010 Golf')
  assert.equal(baseGroupName('2026'), '2026')
  assert.equal(baseGroupName('  The   Boys '), 'The Boys')
})
