import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const GroupContext = createContext({})

const STORAGE_KEY = 'tc-active-trip'

// Local (not UTC) YYYY-MM-DD so date comparisons match the user's calendar day.
function localTodayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function readStoredTripId() {
  try { return localStorage.getItem(STORAGE_KEY) || null } catch { return null }
}
function writeStoredTripId(id) {
  try { if (id) localStorage.setItem(STORAGE_KEY, id); else localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

// Pick the trip to auto-load, in priority order:
//   0. a stored (manually-chosen) trip that still exists
//   1. a trip whose dates include today (active)
//   2. the nearest upcoming trip (soonest future start)
//   3. the most recently completed trip (latest past end)
// Dates are ISO 'YYYY-MM-DD' strings, so lexical compare == chronological compare.
export function pickBestTrip(trips, storedId) {
  if (!trips || trips.length === 0) return null
  if (storedId) {
    const stored = trips.find(t => t.id === storedId)
    if (stored) return stored
  }
  const today = localTodayIso()
  const active = trips
    .filter(t => t.start_date && t.end_date && t.start_date <= today && t.end_date >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
  if (active.length) return active[0]

  const upcoming = trips
    .filter(t => t.start_date && t.start_date > today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
  if (upcoming.length) return upcoming[0]

  const past = trips
    .filter(t => t.end_date && t.end_date < today)
    .sort((a, b) => b.end_date.localeCompare(a.end_date))
  if (past.length) return past[0]

  return trips[0]
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
      const { data: tripRows } = await supabase.from('trips').select('*').in('group_id', groupIds)
      trips = tripRows || []
    }
    setAllTrips(trips)

    // Keep the current selection if it's still valid; otherwise stored → priority.
    setActiveTripId(prev => {
      if (prev && trips.some(t => t.id === prev)) return prev
      const best = pickBestTrip(trips, readStoredTripId())
      return best?.id ?? null
    })

    setTripsLoaded(true)
    setLoading(false)
    return { groups, trips }
  }

  // Manually switch the active trip (persisted so it survives a refresh).
  function switchTrip(tripId) {
    if (!tripId) return
    writeStoredTripId(tripId)
    setActiveTripId(tripId)
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
      fetchUserGroups, switchTrip,
    }}>
      {children}
    </GroupContext.Provider>
  )
}

export const useGroup = () => useContext(GroupContext)
