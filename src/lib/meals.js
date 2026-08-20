// Meal type metadata + time helpers. Meal times are stored as display strings
// ("6:30 PM") like tee times, so they sort/render the same way (see
// parseTeeTimeToMinutes in scoring.js).

export const MEAL_TYPES = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'happy_hour', label: 'Happy Hour' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'other', label: 'Other' },
]

const MEAL_LABEL = Object.fromEntries(MEAL_TYPES.map(m => [m.value, m.label]))

// Display label for a meal's type — the custom label when type is 'other'.
export function mealTypeLabel(meal) {
  if (!meal) return ''
  if (meal.meal_type === 'other') return (meal.custom_label || '').trim() || 'Other'
  return MEAL_LABEL[meal.meal_type] || 'Dinner'
}

// "6:30 PM" -> "18:30" for an <input type="time">; '' if unparseable.
export function displayToTimeInput(disp) {
  const m = String(disp || '').match(/(\d+):(\d+)\s*(AM|PM)/i)
  if (!m) return ''
  let h = Number(m[1]) % 12
  if (m[3].toUpperCase() === 'PM') h += 12
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

// "18:30" (from <input type="time">) -> "6:30 PM"; '' if empty.
export function timeInputToDisplay(val) {
  const m = String(val || '').match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return ''
  let h = Number(m[1])
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${m[2]} ${ap}`
}
