// Changing a trip's dates after it's created (Commissioner Tools → Trip Dates).
//
// One rule moves everything that has a date — rounds (`date`), meals (`day`),
// lodging (`check_in` / `check_out`) and the per-day schedule (`trips.schedule`):
//
//  • Day 1 always stays Day 1. Everything keeps its day number counted from the
//    first day, so moving the trip shifts every item by the same amount.
//  • Longer → new days are added at the end and start as "Not Scheduled Yet".
//  • Shorter → the last days are cut, along with the rounds and meals on them.
//    Lodging is trimmed to check out on the new last day; a stay with no nights
//    left is removed.
//
// Player flights are each player's own bookings and are never changed.
// Dates lock once any score is entered (enforced by the RPC), so a cut round
// never has scores. The plan is applied in one transaction by change_trip_dates.

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

// 1-based day number within a trip, e.g. "Day 3".
export function dayNumber(iso, tripStart) {
  const d = daysBetween(tripStart, iso)
  return d == null ? null : d + 1
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
//   ok, error, shift, oldLength, newLength, lengthChange, sameLength,
//   rounds:   [{ id, from, to }],                    // moved (only rows that change)
//   meals:    [{ id, from, to }],
//   stays:    [{ id, from: {check_in, check_out}, to: {check_in, check_out}, trimmed }],
//   cutRounds: [{ id, label, date }],                // on a cut day → deleted
//   cutMeals:  [{ id, label, date }],
//   cutStays:  [{ id, label, check_in, check_out }], // no nights left → deleted
//   schedule: [{ date, type }],                      // new trips.schedule
//   addedDays: [iso], removedDays: [iso],            // new dates gained / old dates cut
// }
export function planTripDateChange({
  oldStart, oldEnd, newStart, newEnd,
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
    lengthChange: newLength - oldLength, sameLength: newLength === oldLength,
    rounds: [], meals: [], stays: [], cutRounds: [], cutMeals: [], cutStays: [],
    schedule: [], addedDays: [], removedDays: [],
  }
  if (error) return base

  const shift = daysBetween(oldStart, newStart)
  // A date sits on a cut day if it's one of the old trip's last days that no
  // longer exist (only when shortening). Dates already outside the old trip
  // just shift with everything else.
  const isCut = iso => {
    const i = daysBetween(oldStart, iso)
    return i != null && i >= newLength && i <= oldLength - 1
  }

  const roundMoves = [], cutRounds = []
  for (const r of rounds) {
    if (!r?.date) continue
    if (isCut(r.date)) { cutRounds.push({ id: r.id, label: roundLabel(r), date: r.date }); continue }
    const to = addDays(r.date, shift)
    if (to !== r.date) roundMoves.push({ id: r.id, from: r.date, to })
  }

  const mealMoves = [], cutMeals = []
  for (const m of meals) {
    if (!m?.day) continue
    if (isCut(m.day)) { cutMeals.push({ id: m.id, label: mealLabel(m), date: m.day }); continue }
    const to = addDays(m.day, shift)
    if (to !== m.day) mealMoves.push({ id: m.id, from: m.day, to })
  }

  const stayMoves = [], cutStays = []
  for (const s of stays) {
    const ci = s?.check_in || null, co = s?.check_out || null
    if (!ci && !co) continue
    const cut = () => cutStays.push({ id: s.id, label: stayLabel(s), check_in: ci, check_out: co })
    if (ci && isCut(ci)) { cut(); continue }
    let toCo = co ? addDays(co, shift) : null
    let trimmed = false
    if (co && isCut(co)) { toCo = newEnd; trimmed = true }
    const toCi = ci ? addDays(ci, shift) : null
    if (trimmed && toCi && toCo <= toCi) { cut(); continue }
    if (toCi !== ci || toCo !== co) {
      stayMoves.push({ id: s.id, from: { check_in: ci, check_out: co }, to: { check_in: toCi, check_out: toCo }, trimmed })
    }
  }

  // New per-day schedule: day N keeps old day N's type; added days start as
  // "unknown" (Not Scheduled Yet).
  const oldTypeByDate = {}
  for (const d of schedule || []) if (d?.date) oldTypeByDate[d.date] = d.type
  const newSchedule = []
  for (let i = 0; i < newLength; i++) {
    const date = addDays(newStart, i)
    const type = i < oldLength ? (oldTypeByDate[addDays(oldStart, i)] || 'unknown') : 'unknown'
    newSchedule.push({ date, type })
  }
  // Days with a round are golf days (covers trips whose schedule was never saved).
  const golfDays = new Set(rounds.filter(r => r?.date && !isCut(r.date)).map(r => addDays(r.date, shift)))
  for (const d of newSchedule) if (golfDays.has(d.date)) d.type = 'golf'

  const addedDays = []
  for (let i = oldLength; i < newLength; i++) addedDays.push(addDays(newStart, i))
  const removedDays = []
  for (let i = newLength; i < oldLength; i++) removedDays.push(addDays(oldStart, i))

  return {
    ...base, shift,
    rounds: roundMoves, meals: mealMoves, stays: stayMoves,
    cutRounds, cutMeals, cutStays,
    schedule: newSchedule, addedDays, removedDays,
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
    p_delete_rounds: plan.cutRounds.map(r => r.id),
    p_delete_meals: plan.cutMeals.map(m => m.id),
    p_delete_stays: plan.cutStays.map(s => s.id),
  }
}
