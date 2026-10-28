import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { loadMyTrips } from './myTrips'
import { loadCareerData, buildCareer, tripFinishes } from './careerStats'
import { computeBadges } from './badges'
import { saveCopy, readCopy, mapToJson, jsonToMap } from './offlineCache'

// The signed-in player's trips, career totals, badges and past-trip finishes — one loader shared by
// the Clubhouse Home page and the Trophy Room so both show the same numbers.
// `reload()` refetches (e.g. after a restore).
export function useMyCareer(userId) {
  const [state, setState] = useState({ trips: null, deleted: [], career: null, badges: null, finishes: new Map() })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const copyKey = `home:${userId}`
      const { rows, deleted, offline } = await loadMyTrips(supabase, userId)
      if (cancelled) return
      // No signal: show the copy saved on this phone from the last good load.
      if (offline) {
        const saved = readCopy(copyKey)
        setState(s => (saved
          ? { trips: saved.trips || [], deleted: saved.deleted || [], career: saved.career || null, badges: saved.badges ? jsonToMap(saved.badges) : null, finishes: jsonToMap(saved.finishes) }
          : { ...s, trips: [], deleted: [] }))
        return
      }
      setState(s => ({ ...s, trips: rows, deleted }))
      const perTrip = await loadCareerData(supabase, rows.map(t => t.id))
      if (cancelled) return
      const career = buildCareer(perTrip, userId)
      const badges = computeBadges(perTrip, userId)
      const finishes = tripFinishes(perTrip, userId)
      setState(s => ({ ...s, career, badges, finishes }))
      saveCopy(copyKey, { trips: rows, deleted, career, badges: mapToJson(badges), finishes: mapToJson(finishes) })
    })()
    return () => { cancelled = true }
  }, [userId, tick])
  return { ...state, reload: () => setTick(x => x + 1) }
}
