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
  assert.deepEqual([p.cutRounds, p.cutMeals, p.cutStays], [[], [], []])
  assert.deepEqual(p.addedDays, [])
  assert.deepEqual(p.removedDays, [])
})

test('longer: Day 1 stays Day 1, new day added at the end', () => {
  const p = planTripDateChange({ ...OLD, newStart: '2026-11-12', newEnd: '2026-11-16', ...all })
  assert.equal(p.shift, 0)
  assert.equal(p.lengthChange, 1)
  assert.deepEqual(p.rounds, []) // nothing moves
  assert.deepEqual(p.meals, [])
  assert.deepEqual(p.stays, []) // lodging is NOT stretched — it's a real booking
  assert.deepEqual(p.addedDays, ['2026-11-16'])
  assert.deepEqual(p.schedule.map(d => d.type), ['travel', 'golf', 'golf', 'travel', 'unknown'])
})

test('longer and moved: items keep their day number', () => {
  // Nov 18 → Nov 23 (6 days): Day 2 rounds land on Nov 19, days 5–6 are new.
  const p = planTripDateChange({ ...OLD, newStart: '2026-11-18', newEnd: '2026-11-23', ...all })
  assert.equal(p.shift, 6)
  assert.equal(toOf(p.rounds, 'r1'), '2026-11-19')
  assert.equal(toOf(p.rounds, 'r3'), '2026-11-20')
  assert.equal(toOf(p.meals, 'm2'), '2026-11-21')
  assert.deepEqual(p.addedDays, ['2026-11-22', '2026-11-23'])
})

test('4 days → 3: days 1–3 stay, day 4 items are cut', () => {
  const p = planTripDateChange({ ...OLD, newStart: '2026-11-12', newEnd: '2026-11-14', ...all })
  assert.equal(p.lengthChange, -1)
  assert.deepEqual(p.removedDays, ['2026-11-15'])
  assert.deepEqual(p.rounds, []) // rounds on days 2–3 stay put
  assert.deepEqual(p.cutRounds, [])
  assert.deepEqual(p.meals, [])
  assert.deepEqual(p.cutMeals.map(m => m.id), ['m2']) // day-4 brunch cut
  // Lodging checks out on the new last day.
  assert.deepEqual(p.stays[0].to, { check_in: '2026-11-12', check_out: '2026-11-14' })
  assert.equal(p.stays[0].trimmed, true)
  assert.deepEqual(p.schedule.map(d => d.type), ['travel', 'golf', 'golf'])
})

test('4 days → 2: day 3 round is cut, day 1–2 items stay', () => {
  const p = planTripDateChange({ ...OLD, newStart: '2026-11-12', newEnd: '2026-11-13', ...all })
  assert.deepEqual(p.cutRounds.map(r => r.id), ['r3'])
  assert.deepEqual(p.removedDays, ['2026-11-14', '2026-11-15'])
  assert.deepEqual(p.schedule.map(d => d.type), ['travel', 'golf'])
})

test('shorter and moved: cut by day number, the rest shifts', () => {
  // Nov 19 → Nov 21 (3 days).
  const p = planTripDateChange({ ...OLD, newStart: '2026-11-19', newEnd: '2026-11-21', ...all })
  assert.equal(toOf(p.rounds, 'r1'), '2026-11-20')
  assert.equal(toOf(p.rounds, 'r3'), '2026-11-21')
  assert.equal(toOf(p.meals, 'm1'), '2026-11-19')
  assert.deepEqual(p.cutMeals.map(m => m.id), ['m2'])
  assert.deepEqual(p.stays[0].to, { check_in: '2026-11-19', check_out: '2026-11-21' })
})

test('a second hotel with no nights left is cut', () => {
  const twoHotels = [
    { id: 'a', hotel_name: 'First', check_in: '2026-11-12', check_out: '2026-11-14' },
    { id: 'b', hotel_name: 'Second', check_in: '2026-11-14', check_out: '2026-11-15' },
  ]
  const p = planTripDateChange({ ...OLD, newStart: '2026-11-12', newEnd: '2026-11-14', stays: twoHotels })
  assert.deepEqual(p.cutStays.map(s => s.id), ['b'])
  assert.deepEqual(p.stays, []) // First already checks out on the new last day
})

test('a hotel that checks in on a cut day is cut', () => {
  const late = [{ id: 'c', hotel_name: 'Late', check_in: '2026-11-15', check_out: '2026-11-16' }]
  const p = planTripDateChange({ ...OLD, newStart: '2026-11-12', newEnd: '2026-11-14', stays: late })
  assert.deepEqual(p.cutStays.map(s => s.id), ['c'])
})

test('rpc args: moves and cuts', () => {
  const p = planTripDateChange({ ...OLD, newStart: '2026-11-12', newEnd: '2026-11-13', ...all })
  const args = rpcArgsForPlan('t1', '2026-11-12', '2026-11-13', p)
  assert.equal(args.p_trip_id, 't1')
  assert.deepEqual(args.p_rounds, [])
  assert.deepEqual(args.p_delete_rounds, ['r3'])
  assert.deepEqual(args.p_delete_meals, ['m2'])
  assert.deepEqual(args.p_delete_stays, [])
  assert.deepEqual(args.p_stays, [{ id: 's1', check_in: '2026-11-12', check_out: '2026-11-13' }])
  assert.equal(args.p_schedule.length, 2)
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
