// Distinct trip locations for the Weather widget's swipeable pager. Pure helpers
// (no React / network) so they're unit-tested directly. The widget resolves each
// location's coordinates (stored lat/lon, else geocoded from city+state) and
// fetches weather; this module only builds the ordered, deduped location list and
// picks the default.

// Header label for a round's location: "City, ST" → "City" → club name → null.
export function roundLocationLabel(r) {
  if (r.location_city && r.location_state) return `${r.location_city}, ${r.location_state}`
  if (r.location_city) return r.location_city
  if (r.club_name) return r.club_name.slice(0, 20)
  return null
}

// Dedup key for a round's location: coordinates (rounded to ~3dp) when present,
// else city+state. Rounds at the same place collapse to one location. Null when
// the round has no location data at all.
export function weatherLocKey(r) {
  if (r.location_lat != null && r.location_lon != null) {
    return `c:${Number(r.location_lat).toFixed(3)},${Number(r.location_lon).toFixed(3)}`
  }
  const city = (r.location_city || '').trim().toLowerCase()
  if (city) return `n:${city}|${(r.location_state || '').trim().toLowerCase()}`
  return null
}

// Distinct locations across every round that has location data — deduped by
// weatherLocKey, ordered by the earliest round date at each place.
export function buildWeatherLocations(rounds, tripName) {
  const withLoc = (rounds || [])
    .filter(r => r.date && weatherLocKey(r))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
  const map = new Map()
  for (const r of withLoc) {
    const key = weatherLocKey(r)
    if (!map.has(key)) {
      map.set(key, {
        key,
        lat: r.location_lat, lon: r.location_lon,
        city: r.location_city, state: r.location_state,
        label: roundLocationLabel(r) || tripName || 'Weather',
      })
    }
  }
  return [...map.values()] // earliest-first (input is date-sorted, first occurrence wins)
}

// Index of the default location: the next upcoming round with data (date >=
// today), else the last such round. 0 when nothing matches.
export function defaultWeatherIndex(rounds, locations, todayIso) {
  if (!locations || locations.length === 0) return 0
  const dated = (rounds || [])
    .filter(r => r.date && weatherLocKey(r))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
  const sel = dated.find(r => r.date >= todayIso) || dated[dated.length - 1]
  const i = sel ? locations.findIndex(l => l.key === weatherLocKey(sel)) : -1
  return i < 0 ? 0 : i
}
