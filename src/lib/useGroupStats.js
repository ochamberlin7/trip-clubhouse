import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { loadMyGroups } from './myGroups'
import { loadCareerData } from './careerStats'
import { buildGroupStats } from './groupStats'
import { loadGroupPastTrips } from './pastTrips'

// The Group stats page's data: your groups (for the picker) and the chosen
// group's stats across all its trips. The last group you looked at is
// remembered on this phone.
const LAST_KEY = userId => `groupStats:last:${userId}`
function readLast(userId) { try { return localStorage.getItem(LAST_KEY(userId)) } catch { return null } }
function saveLast(userId, id) { try { localStorage.setItem(LAST_KEY(userId), id) } catch { /* private mode */ } }

// enabled=false: load the group list only (the Career page's Individual view).
export function useGroupStats(userId, { enabled = true } = {}) {
  const [groups, setGroups] = useState(null)
  const [groupId, setGroupIdState] = useState(null)
  const [stats, setStats] = useState(null) // { groupId, data }
  const [error, setError] = useState('')

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    loadMyGroups(supabase, userId).then(list => {
      if (cancelled) return
      setGroups(list)
      const last = readLast(userId)
      setGroupIdState(list.find(g => g.id === last)?.id || list[0]?.id || null)
    })
    return () => { cancelled = true }
  }, [userId])

  useEffect(() => {
    if (!groupId || !enabled) return
    let cancelled = false
    ;(async () => {
      setError('')
      const { data: trips, error: tErr } = await supabase.from('trips').select('id').eq('group_id', groupId).is('deleted_at', null)
      if (cancelled) return
      if (tErr) { setError('Couldn\'t load this group. Check your signal and try again.'); return }
      const [perTrip, past] = await Promise.all([loadCareerData(supabase, (trips || []).map(t => t.id)), loadGroupPastTrips(supabase, groupId)])
      if (cancelled) return
      // Real trips first, so members keep the names they use in the app.
      setStats({ groupId, data: buildGroupStats([...perTrip, ...past], userId) })
    })()
    return () => { cancelled = true }
  }, [groupId, userId, enabled])

  const setGroupId = id => { setGroupIdState(id); if (userId) saveLast(userId, id) }
  const loading = !stats || stats.groupId !== groupId
  return { groups, groupId, setGroupId, stats: loading ? null : stats.data, loading, error }
}
