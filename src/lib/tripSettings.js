// Trip name: one rule shared by every screen that renames a trip (the trip
// header and Commissioner Tools). Dates live in tripDates.js.

export const TRIP_NAME_MAX = 80

// Returns { name, error }: the trimmed name, or an error message.
export function cleanTripName(raw) {
  const name = String(raw ?? '').trim()
  if (!name) return { name: '', error: 'Name can’t be empty' }
  if (name.length > TRIP_NAME_MAX) return { name, error: `Keep it under ${TRIP_NAME_MAX} characters` }
  return { name, error: '' }
}

// Save a new trip name. Returns { error, name, unchanged }.
export async function saveTripName(client, tripId, raw, currentName = '') {
  const { name, error } = cleanTripName(raw)
  if (error) return { error, name }
  if (name === String(currentName || '').trim()) return { error: '', name, unchanged: true }
  const res = await client.from('trips').update({ name }).eq('id', tripId)
  return { error: res.error ? 'Couldn’t save — try again' : '', name }
}
