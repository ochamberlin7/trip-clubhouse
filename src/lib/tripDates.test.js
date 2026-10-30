import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planTripDateChange, validateNewDates, tripLength, addDays, daysBetween, rpcArgsForPlan, nextRange } from './tripDates.js'

// A 4-day trip: Thu Nov 12 → Sun Nov 15.
// Day 1 travel, Day 2 golf (2 rounds), Day 3 golf, Day 4 travel.
const OLD = { oldStart: '2026-11-12', oldEnd: '2026-11-15' }
const rounds = [
  { id: 'r1', date: '2026-11-13', course_name: 'Arcadia' },
  { id: 'r2', date: '2026-11-13', course_name: 'Forest Dunes' },
  { id: 'r3', date: '2026-11-14', course_name: 'The Loop' },
]
const meals = [
  { id: 'm1', day: '2026-11-12', location: 'Steakhouse' },
  { id: 'm2', day: '2026-11-15', location: 'Brunch' },
]
const stays = [{ id: 's1', hotel_name: 'Lodge', check_in: '2026-11-12', check_out: '2026-11-15' }]
const schedule = [
  { date: '2026-11-12', type: 'travel' },
  { date: '2026-11-13', type: 'golf' },
  { date: '2026-11-14', type: 'golf' },
  { date: '2026-11-15', type: 'travel' },
]
const all = { rounds, meals, stays, schedule }
const toOf = (list, id) => list.find(x => x.id === id)?.to

test('date helpers', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01')
  assert.equal(addDays('2026-03-07', 2), '2026-03-09') // across DST
  assert.equal(daysBetween('2026-11-12', '2026-11-15'), 3)
  assert.equal(tripLength('2026-11-12', '2026-11-15'), 4)
  assert.equal(tripLength('2026-11-12', '2026-11-12'), 1)
})

test('validation', () => {
  assert.match(validateNewDates({ ...OLD, newStart: '', newEnd: '' }), /Pick/)
  assert.match(validateNewDates({ ...OLD, newStart: '2026-11-20', newEnd: '2026-11-19' }), /before/)
  assert.match(validateNewDates({ ...OLD, newStart: OLD.oldStart, newEnd: OLD.oldEnd }), /current/)
  assert.equal(validateNewDates({ ...OLD, newStart: '2026-11-19', newEnd: '2026-11-22' }), '')
})

test('same length: everything shifts to the same trip day', () => {
  const p = planTripDateChange({ ...OLD, newStart: '2026-11-19', newEnd: '2026-11-22', ...all })
  assert.equal(p.ok, true)
  assert.equal(p.sameLength, true)
  assert.equal(p.shift, 7)
  assert.equal(toOf(p.rounds, 'r1'), '2026-11-20')
  assert.equal(toOf(p.rounds, 'r2'), '2026-11-20')
  assert.equal(toOf(p.rounds, 'r3'), '2026-11-21')
  assert.equal(toOf(p.meals, 'm1'), '2026-11-19')
  assert.equal(toOf(p.meals, 'm2'), '2026-11-22')
  assert.deepEqual(p.stays[0].to, { check_in: '2026-11-19', check_out: '2026-11-22' })
  assert.deepEqual(p.schedule.map(d => d.type), ['travel', 'golf', 'golf', 'travel'])
  assert.equal(p.schedule[0].date, '2026-11-19')
  assert.equal(p.clampedItems.length, 0)
  assert.deepEqual(p.addedDays, [])
  assert.deepEqual(p.removedDays, [])
})

test('same length: anchor makes no difference', () => {
  const a = planTripDateChange({ ...OLD, newStart: '2026-11-05', newEnd: '2026-11-08', anchor: 'start', ...all })
  const b = planTripDateChange({ ...OLD, newStart: '2026-11-05', newEnd: '2026-11-08', anchor: 'end', ...all })
  assert.deepEqual(a.rounds, b.rounds)
  assert.deepEqual(a.schedule, b.schedule)
})

test('extend at the end: items stay put, new day is unscheduled', () => {
  const p = planTripDateChange({ ...OLD, newStart: '2026-11-12', newEnd: '2026-11-16', anchor: 'start', ...all })
  assert.equal(p.shift, 0)
  assert.equal(p.lengthChange, 1)
  assert.deepEqual(p.rounds, []) // nothing moves
  assert.deepEqual(p.meals, [])
  assert.deepEqual(p.stays, [])
  assert.deepEqual(p.addedDays, ['2026-11-16'])
  assert.deepEqual(p.schedule.map(d => d.type), ['travel', 'golf', 'golf', 'travel', 'unknown'])
})

test('extend at the start: items keep their place from the last day', () => {
  const p = planTripDateChange({ ...OLD, newStart: '2026-11-11', newEnd: '2026-11-15', anchor: 'end', ...all })
  assert.equal(p.shift, 0)
  assert.deepEqual(p.rounds, [])
  assert.deepEqual(p.addedDays, ['2026-11-11'])
  assert.deepEqual(p.schedule.map(d => d.type), ['unknown', 'travel', 'golf', 'golf', 'travel'])
})

test('extend at the start while moving the trip', () => {
  // New trip Nov 18 → Nov 22 (5 days), extra day added at the front.
  const p = planTripDateChange({ ...OLD, newStart: '2026-11-18', newEnd: '2026-11-22', anchor: 'end', ...all })
  assert.equal(p.shift, 7)
  assert.equal(toOf(p.rounds, 'r1'), '2026-11-20')
  assert.equal(toOf(p.rounds, 'r3'), '2026-11-21')
  assert.deepEqual(p.addedDays, ['2026-11-18'])
  assert.deepEqual(p.schedule.map(d => d.type), ['unknown', 'travel', 'golf', 'golf', 'travel'])
})

test('shorten at the end: last-day items move to the new last day', () => {
  const p = planTripDateChange({ ...OLD, newStart: '2026-11-12', newEnd: '2026-11-14', anchor: 'start', ...all })
  assert.equal(p.lengthChange, -1)
  assert.deepEqual(p.removedDays, ['2026-11-15'])
  assert.deepEqual(p.rounds, []) // rounds on days 2–3 still fit
  assert.equal(toOf(p.meals, 'm2'), '2026-11-14')
  assert.equal(p.meals[0].clamped, true)
  assert.deepEqual(p.stays[0].to, { check_in: '2026-11-12', check_out: '2026-11-14' })
  assert.deepEqual(p.clampedItems.map(c => c.kind).sort(), ['meal', 'stay'])
  assert.deepEqual(p.schedule.map(d => d.type), ['travel', 'golf', 'golf'])
})

test('shorten at the start: rounds that no longer fit move to the first day', () => {
  // Cut 2 days from the front: new trip is Nov 14 → Nov 15.
  const p = planTripDateChange({ ...OLD, newStart: '2026-11-14', newEnd: '2026-11-15', anchor: 'end', ...all })
  assert.deepEqual(p.removedDays, ['2026-11-12', '2026-11-13'])
  assert.equal(toOf(p.rounds, 'r1'), '2026-11-14')
  assert.equal(toOf(p.rounds, 'r2'), '2026-11-14')
  assert.equal(toOf(p.rounds, 'r3'), undefined) // already on Nov 14 — unchanged
  assert.equal(p.clampedItems.filter(c => c.kind === 'round').length, 2)
  assert.equal(toOf(p.meals, 'm1'), '2026-11-14')
  // Day the rounds landed on becomes a golf day.
  assert.deepEqual(p.schedule.map(d => d.type), ['golf', 'travel'])
})

test('shortened to one day: a stay with no nights left is flagged', () => {
  const p = planTripDateChange({ ...OLD, newStart: '2026-11-12', newEnd: '2026-11-12', anchor: 'start', ...all })
  assert.equal(p.stays[0].noNights, true)
  assert.ok(p.clampedItems.find(c => c.kind === 'stay')?.noNights)
})

test('rpc args only include rows that change', () => {
  const p = planTripDateChange({ ...OLD, newStart: '2026-11-12', newEnd: '2026-11-14', anchor: 'start', ...all })
  const args = rpcArgsForPlan('t1', '2026-11-12', '2026-11-14', p)
  assert.equal(args.p_trip_id, 't1')
  assert.deepEqual(args.p_rounds, [])
  assert.deepEqual(args.p_meals, [{ id: 'm2', day: '2026-11-14' }])
  assert.deepEqual(args.p_stays, [{ id: 's1', check_in: '2026-11-12', check_out: '2026-11-14' }])
  assert.equal(args.p_schedule.length, 3)
})

test('trip with no schedule saved still gets one', () => {
  const p = planTripDateChange({ ...OLD, newStart: '2026-11-19', newEnd: '2026-11-22', rounds, schedule: null })
  assert.deepEqual(p.schedule.map(d => d.type), ['unknown', 'golf', 'golf', 'unknown'])
})

test('calendar tap rule', () => {
  assert.deepEqual(nextRange('', '', '2026-11-12'), ['2026-11-12', ''])
  assert.deepEqual(nextRange('2026-11-12', '', '2026-11-15'), ['2026-11-12', '2026-11-15'])
  assert.deepEqual(nextRange('2026-11-12', '', '2026-11-10'), ['2026-11-10', ''])
  assert.deepEqual(nextRange('2026-11-12', '2026-11-15', '2026-11-20'), ['2026-11-20', ''])
})
