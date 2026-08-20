// Regression check for the WHS two-step handicap math. Run: `npm test`.
//
// The bug this guards against is invisible at 100% allowance (rounding once vs.
// twice give the same result there) and only surfaces at other allowances — so
// these cases lock in the official USGA World Handicap System order of operations:
//   1. Course Handicap = ROUND(Index × (Slope/113) + (Rating − Par))  ← full
//      DECIMAL index, rounded ONCE.
//   2. Playing Handicap = ROUND(CourseHandicap × Allowance%)          ← a SEPARATE
//      round applied to the already-rounded Course Handicap.
//   3. Shots off = PlayingHandicap − lowest PlayingHandicap in the group.
// Rounding is "round half up" (Math.round), NOT banker's rounding.
//
// Reference: Arizona Country Club — Rating 71.5, Slope 128, Par 72.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { courseHandicapForTee, shotsGivenFromCourseHandicaps } from './scoring.js'

const SL = 128, RT = 71.5, PAR = 72
const playingHcp = (ch, allowance) => Math.round(ch * (allowance / 100))
function group(players, allowance) {
  const entries = players.map(([id, idx]) => ({ id, ch: courseHandicapForTee(idx, SL, RT, PAR) }))
  const shots = shotsGivenFromCourseHandicaps(entries, allowance)
  return entries.map(e => ({ ch: e.ch, ph: playingHcp(e.ch, allowance), shots: shots.get(e.id) }))
}
const REF = [['Monty', 5], ['Owen', 7], ['Nicole', 15]]

test('Course Handicap: full decimal index, rounded once', () => {
  assert.equal(courseHandicapForTee(5, SL, RT, PAR), 5)   // raw 5.164 → 5
  assert.equal(courseHandicapForTee(7, SL, RT, PAR), 7)   // raw 7.429 → 7
  assert.equal(courseHandicapForTee(15, SL, RT, PAR), 16) // raw 16.491 → 16
  // A decimal index must be used EXACTLY (not floored to a whole number first):
  //   7.4 → raw 7.882 → CH 8, whereas index 7 → CH 7. If 7.4 were pre-floored to
  //   7 this would (wrongly) give 7.
  assert.equal(courseHandicapForTee(7.4, SL, RT, PAR), 8)
})

test('90% allowance — reference case (the two-step bug is visible here)', () => {
  const [m, o, n] = group(REF, 90)
  assert.deepEqual([m.ch, o.ch, n.ch], [5, 7, 16], 'Course Handicap')
  assert.deepEqual([m.ph, o.ph, n.ph], [5, 6, 14], 'Playing Handicap (separate round of CH×90%)')
  assert.deepEqual([m.shots, o.shots, n.shots], [0, 1, 9], 'Shots off the lowest Playing Handicap')
})

test('round half UP at a .5 boundary (not banker\'s rounding)', () => {
  // Monty: ROUND(5 × 0.90) = ROUND(4.5) = 5. Banker's rounding would give 4.
  assert.equal(Math.round(4.5), 5)
  assert.equal(playingHcp(5, 90), 5)
})

test('100% allowance — Playing Handicap equals Course Handicap', () => {
  const [m, o, n] = group(REF, 100)
  assert.deepEqual([m.ph, o.ph, n.ph], [5, 7, 16])
  assert.deepEqual([m.shots, o.shots, n.shots], [0, 2, 11])
})

test('95% allowance — consistent two-step behaviour', () => {
  const [m, o, n] = group(REF, 95)
  // ROUND(5×.95)=5, ROUND(7×.95)=ROUND(6.65)=7, ROUND(16×.95)=ROUND(15.2)=15
  assert.deepEqual([m.ph, o.ph, n.ph], [5, 7, 15])
  assert.deepEqual([m.shots, o.shots, n.shots], [0, 2, 10])
})
