// Changing a trip's dates after it's created (Commissioner Tools → Trip Dates).
//
// One rule moves everything that has a date — rounds (`date`), meals (`day`),
// lodging (`check_in` / `check_out`) and the per-day schedule (`trips.schedule`):
//
//  • Same number of days → everything shifts by the same amount, so Day 1 stays
//    Day 1, Day 2 stays Day 2, and so on.
//  • Longer or shorter → the commissioner picks which side gains or loses days:
//      anchor 'start' (default): days are added / cut at the END. Items keep
//        their day number counted from the first day.
//      anchor 'end': days are added / cut at the START. Items keep their place
//        counted back from the last day.
//  • Anything that would land outside the new dates is moved to the nearest day
//    still in the trip (never deleted) and reported, so the commissioner can
//    remove it from Schedule & Courses if it's no longer needed.
//
// Player flights are each player's own bookings and are never moved.
// The plan is applied in one database transaction by the change_trip_dates RPC.

const DAY_MS = 86400000

function toUtc(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''))
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null
}

function fromUtc(ms) {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

// Whole days from a to b (b − a). null if either date is missing/invalid.
export function daysBetween(a, b) {
  const x = toUtc(a), y = toUtc(b)
  return x == null || y == null ? null : Math.round((y - x) / DAY_MS)
}

export function addDays(iso, n) {
  const x = toUtc(iso)
  return x == null ? null : fromUtc(x + n * DAY_MS)
}

// Number of days in an inclusive range (a one-day trip = 1).
export function tripLength(start, end) {
  const d = daysBetween(start, end)
  return d == null || d < 0 ? 0 : d + 1
}

function clampDate(iso, start, end) {
  if (iso < start) return start
  if (iso > end) return end
  return iso
}

// 1-based day number within a trip, e.g. "Day 3".
export function dayNumber(iso, tripStart) {
  const d = daysBetween(tripStart, iso)
  return d == null ? null : d + 1
}

// How many days every item moves.
export function shiftForChange({ oldStart, oldEnd, newStart, newEnd, anchor = 'start' }) {
  return anchor === 'end' ? daysBetween(oldEnd, newEnd) : daysBetween(oldStart, newStart)
}

// Validation for the picked dates. Returns an error message, or '' if OK.
export function validateNewDates({ oldStart, oldEnd, newStart, newEnd }) {
  if (!newStart || !newEnd) return 'Pick a start and end date.'
  if (toUtc(newStart) == null || toUtc(newEnd) == null) return 'Pick a start and end date.'
  if (newEnd < newStart) return 'End date cannot be before start date.'
  if (newStart === oldStart && newEnd === oldEnd) return 'These are the current dates.'
  return ''
}

// Range-calendar tap rule: 1st tap = start (clears any end), 2nd tap = end if
// it's on/after start, else it becomes a new start. A complete range stays
// visible; tapping again begins a new range. Returns [start, end].
export function nextRange(startDate, endDate, iso) {
  if (!startDate || (startDate && endDate)) return [iso, '']
  if (iso < startDate) return [iso, '']
  return [startDate, iso]
}

// Build the full plan for a date change. Pure — no database calls.
//
// Returns {
//   ok, error, shift, oldLength, newLength, lengthChange, sameLength, anchor,
//   rounds:   [{ id, from, to, clamped }],         // only rows that change
//   meals:    [{ id, from, to, clamped }],
//   stays:    [{ id, from: {check_in, check_out}, to: {check_in, check_out}, clamped, noNights }],
//   schedule: [{ date, type }],                    // new trips.schedule
//   addedDays: [iso], removedDays: [iso],          // calendar days gained / lost
//   clampedItems: [{ kind, id, label, to }],       // items that didn't fit and were moved
// }
export function planTripDateChange({
  oldStart, oldEnd, newStart, newEnd, anchor = 'start',
  rounds = [], meals = [], stays = [], schedule = [],
  roundLabel = r => r.course_name || 'Round',
  mealLabel = m => m.location || 'Meal',
  stayLabel = s => s.hotel_name || 'Lodging',
}) {
  const error = validateNewDates({ oldStart, oldEnd, newStart, newEnd })
  const oldLength = tripLength(oldStart, oldEnd)
  const newLength = tripLength(newStart, newEnd)
  const base = {
    ok: !error, error, shift: 0, oldLength, newLength,
    lengthChange: newLength - oldLength, sameLength: newLength === oldLength, anchor,
    rounds: [], meals: [], stays: [], schedule: [], addedDays: [], removedDays: [], clampedItems: [],
  }
  if (error) return base

  // With the same length both anchors give the same shift.
  const shift = shiftForChange({ oldStart, oldEnd, newStart, newEnd, anchor })
  const move = iso => {
    const shifted = addDays(iso, shift)
    const to = clampDate(shifted, newStart, newEnd)
    return { to, clamped: to !== shifted }
  }

  const clampedItems = []

  const roundMoves = []
  for (const r of rounds) {
    if (!r?.date) continue
    const { to, clamped } = move(r.date)
    if (clamped) clampedItems.push({ kind: 'round', id: r.id, label: roundLabel(r), to })
    if (to !== r.date) roundMoves.push({ id: r.id, from: r.date, to, clamped })
  }

  const mealMoves = []
  for (const m of meals) {
    if (!m?.day) continue
    const { to, clamped } = move(m.day)
    if (clamped) clampedItems.push({ kind: 'meal', id: m.id, label: mealLabel(m), to })
    if (to !== m.day) mealMoves.push({ id: m.id, from: m.day, to, clamped })
  }

  const stayMoves = []
  for (const s of stays) {
    if (!s?.check_in && !s?.check_out) continue
    const ci = s.check_in ? move(s.check_in) : null
    const co = s.check_out ? move(s.check_out) : null
    const to = { check_in: ci ? ci.to : null, check_out: co ? co.to : null }
    const clamped = !!(ci?.clamped || co?.clamped)
    const noNights = !!(to.check_in && to.check_out && to.check_out <= to.check_in)
    if (clamped) clampedItems.push({ kind: 'stay', id: s.id, label: stayLabel(s), to: to.check_in || to.check_out, noNights })
    if (to.check_in !== (s.check_in || null) || to.check_out !== (s.check_out || null)) {
      stayMoves.push({ id: s.id, from: { check_in: s.check_in || null, check_out: s.check_out || null }, to, clamped, noNights })
    }
  }

  // New per-day schedule: each new day takes the type of the old day that maps
  // onto it; brand-new days start as "unknown" (Not Scheduled Yet). Any day that
  // ends up with a round is a golf day.
  const oldTypeByDate = {}
  for (const d of schedule || []) if (d?.date) oldTypeByDate[d.date] = d.type
  const golfDays = new Set()
  for (const r of rounds) {
    if (!r?.date) continue
    const mv = roundMoves.find(x => x.id === r.id)
    golfDays.add(mv ? mv.to : r.date)
  }
  const newSchedule = []
  for (let i = 0; i < newLength; i++) {
    const date = addDays(newStart, i)
    const fromDate = addDays(date, -shift)
    const inOld = fromDate >= oldStart && fromDate <= oldEnd
    let type = (inOld && oldTypeByDate[fromDate]) || 'unknown'
    if (golfDays.has(date)) type = 'golf'
    newSchedule.push({ date, type })
  }

  // Days gained / lost, in terms of the trip's own days (not raw calendar overlap).
  const addedDays = []
  const removedDays = []
  if (newLength > oldLength) {
    const extra = newLength - oldLength
    for (let i = 0; i < extra; i++) addedDays.push(anchor === 'end' ? addDays(newStart, i) : addDays(newEnd, -extra + 1 + i))
  } else if (newLength < oldLength) {
    const cut = oldLength - newLength
    for (let i = 0; i < cut; i++) removedDays.push(anchor === 'end' ? addDays(oldStart, i) : addDays(oldEnd, -cut + 1 + i))
  }

  return {
    ...base, shift,
    rounds: roundMoves, meals: mealMoves, stays: stayMoves,
    schedule: newSchedule, addedDays, removedDays, clampedItems,
  }
}

// The arguments for the change_trip_dates RPC.
export function rpcArgsForPlan(tripId, newStart, newEnd, plan) {
  return {
    p_trip_id: tripId,
    p_start: newStart,
    p_end: newEnd,
    p_schedule: plan.schedule,
    p_rounds: plan.rounds.map(r => ({ id: r.id, date: r.to })),
    p_meals: plan.meals.map(m => ({ id: m.id, day: m.to })),
    p_stays: plan.stays.map(s => ({ id: s.id, check_in: s.to.check_in, check_out: s.to.check_out })),
  }
}
