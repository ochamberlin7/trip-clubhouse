// Trip settings the commissioner can change after creation: the trip name and
// its time zone. One rule each, shared by every screen that edits them (the trip
// header's rename and Commissioner Tools). Dates live in tripDates.js.

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

// US time zones offered in Commissioner Tools (IANA names, never offsets, so
// daylight saving is handled). `trips.time_zone` NULL = not set: each phone uses
// its own zone, as before.
export const TRIP_TIME_ZONES = [
  { value: 'America/New_York', label: 'Eastern Time' },
  { value: 'America/Chicago', label: 'Central Time' },
  { value: 'America/Denver', label: 'Mountain Time' },
  { value: 'America/Phoenix', label: 'Arizona (no daylight saving)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time' },
  { value: 'America/Anchorage', label: 'Alaska Time' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time' },
]

// Zones that read the same as a listed one (e.g. a Michigan trip stored as
// America/Detroit shows as Eastern Time).
const ZONE_ALIASES = {
  'America/Detroit': 'Eastern Time',
  'America/Indiana/Indianapolis': 'Eastern Time',
  'America/Kentucky/Louisville': 'Eastern Time',
  'America/Boise': 'Mountain Time',
}

export function timeZoneLabel(tz) {
  if (!tz) return 'Not set'
  const known = TRIP_TIME_ZONES.find(z => z.value === tz)
  if (known) return known.label
  if (ZONE_ALIASES[tz]) return ZONE_ALIASES[tz]
  // Anything else: the city part of the IANA name ("Europe/London" → "London").
  return tz.split('/').pop().replace(/_/g, ' ')
}

// Options for the picker: the US list, plus the trip's current zone if it isn't
// one of them (so saving never silently changes it).
export function timeZoneOptions(current) {
  const list = TRIP_TIME_ZONES.slice()
  if (current && !list.some(z => z.value === current)) list.unshift({ value: current, label: timeZoneLabel(current) })
  return list
}
