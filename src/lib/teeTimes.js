// Tee-time storage rules shared by the Tee times tab, Schedule and courses and the
// Home tee-times card. Tee times are trip-local display strings ("7:45 AM"), one per
// pairing slot: rounds.tee_time_1 … tee_time_5.

export const TEE_TIME_COLUMNS = ['tee_time_1', 'tee_time_2', 'tee_time_3', 'tee_time_4', 'tee_time_5']

// One tee-time row per pairing. A pairing is a 2v2 foursome, so pairings scale by
// groups of 4 (1-4 players → 1, 5-8 → 2, …), matching the count ScoringTab shows.
// Bounded at 5 (the 20-player max ⇒ 5 pairings; storage is tee_time_1…5).
export function teeSlotCount(playerCount = 0) {
  return Math.min(TEE_TIME_COLUMNS.length, Math.max(1, Math.ceil(playerCount / 4)))
}
