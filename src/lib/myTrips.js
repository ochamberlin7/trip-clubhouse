// "My trips" — the trips a player is actually on, for the player home page and
// the menu's trip switcher (one loader, so both lists agree). Also the shared
// live / upcoming / past split, using each trip's own time zone.
import { zonedTodayAndMinutes } from './scoring.js'

// 'live' (today is within the trip), 'upcoming' (starts later, or no dates yet),
// or 'past' — judged on the trip's local date.
export function tripTimeStatus(trip, now = new Date()) {
  if (!trip?.start_date || !trip?.end_date) return 'upcoming'
  const { todayIso } = zonedTodayAndMinutes(now, trip.time_zone || undefined)
  if (todayIso < trip.start_date) return 'upcoming'
  if (todayIso > trip.end_date) return 'past'
  return 'live'
}

// Whole days from the trip's local today until it starts (0 on/after start).
export function daysUntilTrip(trip, now = new Date()) {
  if (!trip?.start_date) return null
  const { todayIso } = zonedTodayAndMinutes(now, trip.time_zone || undefined)
  const utc = iso => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.max(0, Math.round((utc(trip.start_date) - utc(todayIso)) / 86400000))
}

// Days left to restore a soft-deleted trip (30-day window), never below 0.
export function restoreDaysLeft(deletedAt, now = new Date()) {
  if (!deletedAt) return null
  const gone = Math.floor((now.getTime() - new Date(deletedAt).getTime()) / 86400000)
  return Math.max(0, 30 - gone)
}

// What a trip-list swipe (Home, Switch Trip) shows. Nobody deletes or leaves a
// trip from a list: a commissioner deletes from Commissioner Tools and a player
// leaves from the trip's menu — and only before the trip starts. Once it has
// started (or finished) it stays, for everyone. Returns { title, body, canOpen }.
export function tripListRemoveNotice(trip, now = new Date()) {
  const status = tripTimeStatus(trip, now)
  const name = trip?.name || 'this trip'
  if (status !== 'upcoming') {
    const when = status === 'past' ? 'is finished' : 'has started'
    return trip?.isCommissioner
      ? { title: "This trip can't be deleted", body: `${name} ${when}. Once a trip starts it can't be deleted.`, canOpen: false }
      : { title: "You can't leave this trip", body: `${name} ${when}. Once a trip starts nobody can leave it.`, canOpen: false }
  }
  return trip?.isCommissioner
    ? { title: 'Delete it from inside the trip', body: `To delete ${name}, open the trip, then go to Menu → Commissioner Tools → Delete trip.`, canOpen: true }
    : { title: 'Leave from inside the trip', body: `To leave ${name}, open the trip, then tap Leave trip at the bottom of the Menu.`, canOpen: true }
}

// Split + sort: live (soonest end first), upcoming (soonest start first), past
// (most recent first).
export function splitTrips(trips = [], now = new Date()) {
  const live = [], upcoming = [], past = []
  for (const t of trips) ({ live, upcoming, past })[tripTimeStatus(t, now)].push(t)
  const by = k => (a, b) => (a[k] || '').localeCompare(b[k] || '')
  live.sort(by('end_date'))
  upcoming.sort((a, b) => (a.start_date ? 0 : 1) - (b.start_date ? 0 : 1) || by('start_date')(a, b))
  past.sort((a, b) => by('start_date')(b, a))
  return { live, upcoming, past }
}

// Loads the trips this user is on (plus `currentTripId`), with location, golfer
// count and whether they're its commissioner; and their soft-deleted trips (< 30
// days), each with canRestore (commissioner only — matches trips RLS).
// Returns { rows, deleted, offline } — offline: true when it couldn't reach the server.
// Takes the Supabase client so the pure helpers above stay testable in Node.
export async function loadMyTrips(client, userId, { currentTripId = null } = {}) {
  if (!userId) return { rows: [], deleted: [] }
  const { data: gm, error: gmErr } = await client
    .from('group_members')
    .select('role, group_id, groups(id, name)')
    .eq('user_id', userId)
  if (gmErr) return { rows: [], deleted: [], offline: true } // no signal → caller uses its saved copy
  const groupIds = [...new Set((gm || []).map(m => m.group_id ?? m.groups?.id).filter(Boolean))]
  // Only the commissioner (group admin) may delete or restore a trip (matches trips RLS).
  const adminGroupIds = new Set((gm || []).filter(m => m.role === 'admin').map(m => m.group_id ?? m.groups?.id).filter(Boolean))
  if (!groupIds.length) return { rows: [], deleted: [] }

  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString()
  const [activeRes, deletedRes, tpRes] = await Promise.all([
    client.from('trips').select('id, group_id, name, start_date, end_date, time_zone').in('group_id', groupIds).is('deleted_at', null),
    client.from('trips').select('id, group_id, name, deleted_at').in('group_id', groupIds).not('deleted_at', 'is', null).gte('deleted_at', cutoff).order('deleted_at', { ascending: false }),
    client.from('trip_players').select('trip_id').or(`user_id.eq.${userId},claimed_user_id.eq.${userId}`),
  ])
  if (activeRes.error || tpRes.error) return { rows: [], deleted: [], offline: true }
  const myTripIds = new Set((tpRes.data || []).map(r => r.trip_id))

  // Location (earliest located round → "City, ST") and golfer counts per trip.
  const tripIds = (activeRes.data || []).map(t => t.id)
  const [roundRes, countRes] = tripIds.length
    ? await Promise.all([
        client.from('rounds').select('trip_id, date, location_city, location_state').in('trip_id', tripIds),
        client.from('trip_players').select('trip_id').in('trip_id', tripIds),
      ])
    : [{ data: [] }, { data: [] }]
  const locByTrip = new Map()
  ;(roundRes.data || [])
    .filter(r => r.location_city || r.location_state)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .forEach(r => { if (!locByTrip.has(r.trip_id)) locByTrip.set(r.trip_id, [r.location_city, r.location_state].filter(Boolean).join(', ')) })
  const roundsByTrip = new Map()
  ;(roundRes.data || []).forEach(r => roundsByTrip.set(r.trip_id, (roundsByTrip.get(r.trip_id) || 0) + 1))
  const countByTrip = new Map()
  ;(countRes.data || []).forEach(r => countByTrip.set(r.trip_id, (countByTrip.get(r.trip_id) || 0) + 1))

  const rows = (activeRes.data || [])
    .filter(t => myTripIds.has(t.id) || t.id === currentTripId)
    .map(t => ({
      id: t.id, group_id: t.group_id, name: t.name, start_date: t.start_date, end_date: t.end_date, time_zone: t.time_zone,
      location: locByTrip.get(t.id) || '',
      golfers: countByTrip.get(t.id) || 0,
      rounds: roundsByTrip.get(t.id) || 0,
      isCommissioner: adminGroupIds.has(t.group_id),
    }))
  const deleted = (deletedRes.data || []).filter(t => myTripIds.has(t.id)).map(t => ({ id: t.id, name: t.name, deleted_at: t.deleted_at, canRestore: adminGroupIds.has(t.group_id) }))
  return { rows, deleted }
}
