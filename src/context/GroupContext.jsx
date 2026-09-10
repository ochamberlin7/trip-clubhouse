import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const GroupContext = createContext({})

// Local (not UTC) YYYY-MM-DD so date comparisons match the user's calendar day.
function localTodayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Whole-day count between two ISO 'YYYY-MM-DD' dates (order-independent). Parsed
// as UTC midnight so DST never shifts the result.
function isoToUtc(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
function daysBetweenIso(a, b) {
  return Math.round(Math.abs(isoToUtc(b) - isoToUtc(a)) / 86400000)
}

// How far a trip's date window is from today: 0 while the trip is ongoing (today
// within [start,end]); otherwise the gap to the nearest edge — days until it
// starts (future) or days since it ended (past). Trips missing dates sort last.
function tripDistanceFromToday(trip, today) {
  const { start_date: s, end_date: e } = trip
  if (!s || !e) return Number.POSITIVE_INFINITY
  if (s <= today && e >= today) return 0
  return today < s ? daysBetweenIso(today, s) : daysBetweenIso(e, today)
}

// The trip to auto-load: always the one CLOSEST to today (an ongoing trip wins at
// distance 0, else the nearest upcoming or most-recently-finished by day count).
// Chosen fresh on every load — a manual switch lasts only for the session, so
// reopening the app always lands on the date-relevant trip. Ties (equal distance,
// e.g. one ending yesterday vs one starting tomorrow) break to the earlier start.
export function pickBestTrip(trips) {
  if (!trips || trips.length === 0) return null
  const today = localTodayIso()
  return trips.slice().sort((a, b) => {
    const da = tripDistanceFromToday(a, today)
    const db = tripDistanceFromToday(b, today)
    if (da !== db) return da - db
    return (a.start_date || '').localeCompare(b.start_date || '')
  })[0]
}

export function GroupProvider({ children }) {
  const { user } = useAuth()
  const [userGroups, setUserGroups] = useState([])
  const [allTrips, setAllTrips] = useState([])       // every trip the user can access
  const [activeTripId, setActiveTripId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [tripsLoaded, setTripsLoaded] = useState(false)

  useEffect(() => {
    if (user) {
      fetchUserGroups()
    } else {
      setUserGroups([])
      setAllTrips([])
      setActiveTripId(null)
      setTripsLoaded(false)
    }
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch every group the user belongs to, plus every trip in those groups.
  // Auto-selects the best trip (keeping any still-valid current selection).
  async function fetchUserGroups() {
    setLoading(true)
    const { data, error } = await supabase
      .from('group_members')
      .select('role, groups(id, name)')
      .eq('user_id', user.id)

    const groups = (!error && data)
      ? data.map(m => ({ ...m.groups, role: m.role })).filter(g => g && g.id)
      : []
    setUserGroups(groups)

    const groupIds = groups.map(g => g.id)
    let trips = []
    if (groupIds.length) {
      // Soft-deleted trips (deleted_at set) are excluded everywhere except the
      // Switch Trip screen's "Recently Deleted" section.
      const { data: tripRows } = await supabase.from('trips').select('*').in('group_id', groupIds).is('deleted_at', null)
      trips = tripRows || []
    }
    setAllTrips(trips)

    // Keep a still-valid in-session selection across refetches; on a fresh load
    // (prev == null) default to the trip closest to today.
    setActiveTripId(prev => {
      if (prev && trips.some(t => t.id === prev)) return prev
      const best = pickBestTrip(trips)
      return best?.id ?? null
    })

    setTripsLoaded(true)
    setLoading(false)
    return { groups, trips }
  }

  // Manually switch the active trip for THIS session only. Not persisted — a
  // reload intentionally returns to the trip closest to today (see pickBestTrip).
  function switchTrip(tripId) {
    if (!tripId) return
    setActiveTripId(tripId)
  }

  // Soft-delete a trip: flag deleted_at, keep every child row so it stays
  // restorable for 30 days. Refetches so it drops out of the active lists (and
  // the active selection re-defaults if it was the current trip).
  async function softDeleteTrip(tripId) {
    if (!tripId) return { error: 'no trip' }
    const { error } = await supabase.from('trips').update({ deleted_at: new Date().toISOString() }).eq('id', tripId)
    if (!error) {
      setActiveTripId(prev => (prev === tripId ? null : prev))
      await fetchUserGroups()
    }
    return { error }
  }

  // Restore a soft-deleted trip (clear deleted_at) and refetch so it reappears.
  async function restoreTrip(tripId) {
    if (!tripId) return { error: 'no trip' }
    const { error } = await supabase.from('trips').update({ deleted_at: null }).eq('id', tripId)
    if (!error) await fetchUserGroups()
    return { error }
  }

  const activeTrip = allTrips.find(t => t.id === activeTripId) || null
  const activeGroup = activeTrip
    ? (userGroups.find(g => g.id === activeTrip.group_id) || null)
    : null
  const isAdmin = activeGroup?.role === 'admin'

  return (
    <GroupContext.Provider value={{
      userGroups, allTrips, activeGroup, activeTrip, activeTripId,
      loading, tripsLoaded, isAdmin,
      fetchUserGroups, switchTrip, softDeleteTrip, restoreTrip,
    }}>
      {children}
    </GroupContext.Provider>
  )
}

export const useGroup = () => useContext(GroupContext)
