// Regression check for the WHS handicap math. Run: `npm test`.
//
// Official USGA/R&A World Handicap System order of operations:
//   Course Handicap (raw) = Index × (Slope/113) + (Rating − Par)   ← full decimal
//   Playing Handicap      = ROUND(raw Course Handicap × Allowance%) ← rounded ONCE,
//     from the UNROUNDED course handicap (NOT from a pre-rounded course handicap).
//   Shots off             = Playing Handicap − lowest Playing Handicap in the group.
// The displayed Course Handicap is the raw value rounded to a whole number, but
// that rounded value is NOT what feeds the Playing Handicap calc.
// Rounding is "round half up" (Math.round), NOT banker's rounding.
//
// This double-vs-single rounding is invisible at 100% allowance and only diverges
// at other allowances — hence these cases, which lock in the single-rounding order.
// Reference: Arizona Country Club — Rating 71.5, Slope 128, Par 72 (verified
// against USGA's own calculator).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rawCourseHandicapForTee, courseHandicapForTee, shotsGivenFromCourseHandicaps, effectiveAllowance, princeOfWalesComposites } from './scoring.js'

const SL = 128, RT = 71.5, PAR = 72
function group(players, allowance) {
  const entries = players.map(([id, idx]) => ({ id, raw: rawCourseHandicapForTee(idx, SL, RT, PAR) }))
  const shots = shotsGivenFromCourseHandicaps(entries.map(e => ({ id: e.id, ch: e.raw })), allowance)
  return entries.map(e => ({
    displayCH: Math.round(e.raw),
    ph: Math.round(e.raw * (allowance / 100)),
    shots: shots.get(e.id),
  }))
}
const REF = [['Monty', 5], ['Owen', 7], ['Nicole', 15]]

test('raw Course Handicap keeps full decimal precision; displayed value is rounded', () => {
  assert.ok(Math.abs(rawCourseHandicapForTee(5, SL, RT, PAR) - 5.163717) < 1e-4)
  assert.ok(Math.abs(rawCourseHandicapForTee(7, SL, RT, PAR) - 7.429204) < 1e-4)
  assert.ok(Math.abs(rawCourseHandicapForTee(15, SL, RT, PAR) - 16.491150) < 1e-4)
  assert.equal(courseHandicapForTee(5, SL, RT, PAR), 5)   // displayed
  assert.equal(courseHandicapForTee(7, SL, RT, PAR), 7)
  assert.equal(courseHandicapForTee(15, SL, RT, PAR), 16)
})

test('90% allowance — official single-rounding from the RAW course handicap', () => {
  const [m, o, n] = group(REF, 90)
  assert.deepEqual([m.displayCH, o.displayCH, n.displayCH], [5, 7, 16], 'displayed Course Handicap')
  // ROUND(5.164×.9)=5, ROUND(7.429×.9)=ROUND(6.686)=7, ROUND(16.491×.9)=ROUND(14.842)=15
  // (double-rounding would wrongly give 5/6/14 here — that was the bug.)
  assert.deepEqual([m.ph, o.ph, n.ph], [5, 7, 15], 'Playing Handicap (single round of raw×90%)')
  assert.deepEqual([m.shots, o.shots, n.shots], [0, 2, 10], 'Shots off the lowest Playing Handicap')
})

test('round half UP at a .5 boundary (not banker\'s rounding)', () => {
  assert.equal(Math.round(4.5), 5) // banker's rounding would give 4
})

test('100% allowance — Playing Handicap equals the rounded Course Handicap', () => {
  const [m, o, n] = group(REF, 100)
  assert.deepEqual([m.ph, o.ph, n.ph], [5, 7, 16])
  assert.deepEqual([m.shots, o.shots, n.shots], [0, 2, 11])
})

test('95% allowance — consistent single-rounding from raw', () => {
  const [m, o, n] = group(REF, 95)
  // ROUND(5.164×.95)=5, ROUND(7.429×.95)=ROUND(7.058)=7, ROUND(16.491×.95)=ROUND(15.667)=16
  assert.deepEqual([m.ph, o.ph, n.ph], [5, 7, 16])
  assert.deepEqual([m.shots, o.shots, n.shots], [0, 2, 11])
})

test('per-course allowance override wins over the trip default (The Dozen @65%)', () => {
  // A course with its own handicap_allowance uses that; a round without one falls
  // back to the trip default. Unset/blank/non-numeric all fall back.
  assert.equal(effectiveAllowance({ handicap_allowance: 65 }, 90), 65)
  assert.equal(effectiveAllowance({ handicap_allowance: null }, 90), 90)
  assert.equal(effectiveAllowance({}, 90), 90)
  assert.equal(effectiveAllowance(null, 90), 90)
  assert.equal(effectiveAllowance({}, undefined), 100) // global default when unset
  // Playing Handicap for Owen (raw 7.429) drops from 7 @90% to 5 @65% (ROUND(4.829)).
  const raw = rawCourseHandicapForTee(7, SL, RT, PAR)
  assert.equal(Math.round(raw * (effectiveAllowance({ handicap_allowance: 65 }, 90) / 100)), 5)
})

test('decimal Handicap Index carries full precision into the Playing Handicap', () => {
  // Index 7.4 → raw CH 7.882 (used EXACTLY, not floored to 7 or pre-rounded to 8).
  const raw = rawCourseHandicapForTee(7.4, SL, RT, PAR)
  assert.ok(Math.abs(raw - 7.882301) < 1e-4)
  assert.equal(courseHandicapForTee(7.4, SL, RT, PAR), 8)   // displayed
  assert.equal(Math.round(raw * 0.90), 7)                   // Playing @90% = ROUND(7.094)
})

test('Prince of Wales composite: lowest per hole-slot across rounds+teammates, gross & net independent', () => {
  // One team (A, B) over two 18-hole rounds; holes stroke-index 1..18.
  // A plays off scratch (HI 0 → ph 0); B off 9 (ph 9 → a stroke on SI 1..9).
  const holes = Array.from({ length: 18 }, (_, i) => ({ par: 4, handicap: i + 1 }))
  const rounds = [
    { id: 'R1', round_type: 'tournament', holes, number_of_holes: 18 },
    { id: 'R2', round_type: 'tournament', holes, number_of_holes: 18 },
  ]
  const teams = [{ id: 'T1' }]
  const playersByTeam = { T1: ['A', 'B'] }
  const hcpByPlayer = { A: 0, B: 9 }
  const teeRowMap = { // neutral tee (slope 113, no rating adj) → raw CH == HI
    'R1:A': { slope: 113, rating: null, par: null }, 'R1:B': { slope: 113, rating: null, par: null },
    'R2:A': { slope: 113, rating: null, par: null }, 'R2:B': { slope: 113, rating: null, par: null },
  }
  const scoresMap = {
    'R1:A:1': 5, 'R1:B:1': 5,   // slot 1: gross 5; B nets 4 (stroke on SI1)
    'R1:A:2': 4, 'R1:B:2': 4,   // slot 2: gross 4; B nets 3 (stroke on SI2)
    'R2:A:1': 3,                // slot 1 again, lower gross across rounds
  }
  const comp = princeOfWalesComposites(
    { rounds, teams, playersByTeam, scoresMap, teeRowMap, hcpByPlayer }, 100,
  ).get('T1')

  assert.equal(comp.gross[0], 3, 'slot 1 gross = lowest across both rounds')
  assert.equal(comp.gross[1], 4, 'slot 2 gross')
  assert.equal(comp.net[1], 3, 'slot 2 net is below gross (B got a stroke)')
  assert.equal(comp.gross[17], null, 'unscored slot stays blank (null)')
  assert.equal(comp.net[17], null, 'unscored slot stays blank (null)')
  assert.equal(comp.grossTotal, 7, 'total sums only scored cells (3 + 4)')
  assert.equal(comp.netTotal, 6, 'net total (3 + 3)')
  assert.equal(comp.anyScored, true)
})

test('Prince of Wales: a team with no scores has blank cells and a zero/dash total', () => {
  const comp = princeOfWalesComposites(
    { rounds: [{ id: 'R1', round_type: 'tournament', holes: [], number_of_holes: 18 }],
      teams: [{ id: 'T1' }], playersByTeam: { T1: ['A'] }, scoresMap: {}, teeRowMap: {}, hcpByPlayer: { A: 0 } },
    100,
  ).get('T1')
  assert.equal(comp.anyScored, false)
  assert.equal(comp.grossTotal, 0)
  assert.equal(comp.gross.every(v => v === null), true)
})
