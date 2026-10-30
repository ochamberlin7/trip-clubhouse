import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { loadMyTrips } from './myTrips'
import { loadCareerData, buildCareer, tripFinishes } from './careerStats'
import { computeBadges } from './badges'
import { buildCareerDetail } from './careerDetail'
import { saveCopy, readCopy, mapToJson, jsonToMap } from './offlineCache'

// The signed-in player's trips, career totals, badges, past-trip finishes and the full
// Career page numbers (`detail`) — one loader shared by the Clubhouse Home page, the
// Trophy Room and the Career page so all three show the same numbers.
// `reload()` refetches (e.g. after a restore).
const BLANK = { trips: null, deleted: [], career: null, badges: null, finishes: new Map(), detail: null }
const copyKeyFor = userId => `home:${userId}`
function fromCopy(saved) {
  return { trips: saved.trips || [], deleted: saved.deleted || [], career: saved.career || null, badges: saved.badges ? jsonToMap(saved.badges) : null, finishes: jsonToMap(saved.finishes), detail: saved.detail || null }
}

// Opens instantly from the copy saved on this phone by the last load (Home and the
// Trophy Room share it), then refreshes from the server in the background and
// swaps in the new numbers. The first ever visit still waits for the server.
export function useMyCareer(userId) {
  const [state, setState] = useState(() => {
    const saved = userId ? readCopy(copyKeyFor(userId)) : null
    return saved ? fromCopy(saved) : BLANK
  })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const copyKey = copyKeyFor(userId)
      const { rows, deleted, offline } = await loadMyTrips(supabase, userId)
      if (cancelled) return
      // No signal: show the copy saved on this phone from the last good load.
      if (offline) {
        const saved = readCopy(copyKey)
        setState(s => (saved ? fromCopy(saved) : { ...s, trips: [], deleted: [] }))
        return
      }
      setState(s => ({ ...s, trips: rows, deleted }))
      const perTrip = await loadCareerData(supabase, rows.map(t => t.id))
      if (cancelled) return
      const career = buildCareer(perTrip, userId)
      const badges = computeBadges(perTrip, userId)
      const finishes = tripFinishes(perTrip, userId)
      const detail = buildCareerDetail(perTrip, userId)
      setState(s => ({ ...s, career, badges, finishes, detail }))
      saveCopy(copyKey, { trips: rows, deleted, career, badges: mapToJson(badges), finishes: mapToJson(finishes), detail })
    })()
    return () => { cancelled = true }
  }, [userId, tick])
  return { ...state, reload: () => setTick(x => x + 1) }
}
