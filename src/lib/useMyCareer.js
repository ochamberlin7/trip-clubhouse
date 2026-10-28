import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { loadMyTrips } from './myTrips'
import { loadCareerData, buildCareer, tripFinishes } from './careerStats'
import { computeBadges } from './badges'

// The signed-in player's trips, career totals, badges and past-trip finishes — one loader shared by
// the Clubhouse Home page and the Trophy Room so both show the same numbers.
// `reload()` refetches (e.g. after a restore).
export function useMyCareer(userId) {
  const [state, setState] = useState({ trips: null, deleted: [], career: null, badges: null, finishes: new Map() })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { rows, deleted } = await loadMyTrips(supabase, userId)
      if (cancelled) return
      setState(s => ({ ...s, trips: rows, deleted }))
      const perTrip = await loadCareerData(supabase, rows.map(t => t.id))
      if (cancelled) return
      setState(s => ({ ...s, career: buildCareer(perTrip, userId), badges: computeBadges(perTrip, userId), finishes: tripFinishes(perTrip, userId) }))
    })()
    return () => { cancelled = true }
  }, [userId, tick])
  return { ...state, reload: () => setTick(x => x + 1) }
}
