import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { loadMyGroups } from './myGroups'
import { loadCareerData } from './careerStats'
import { buildGroupStats } from './groupStats'

// The Group stats page's data: your groups (for the picker) and the chosen
// group's stats across all its trips. The last group you looked at is
// remembered on this phone.
const LAST_KEY = userId => `groupStats:last:${userId}`
function readLast(userId) { try { return localStorage.getItem(LAST_KEY(userId)) } catch { return null } }
function saveLast(userId, id) { try { localStorage.setItem(LAST_KEY(userId), id) } catch { /* private mode */ } }

export function useGroupStats(userId) {
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
    if (!groupId) return
    let cancelled = false
    ;(async () => {
      setError('')
      const { data: trips, error: tErr } = await supabase.from('trips').select('id').eq('group_id', groupId).is('deleted_at', null)
      if (cancelled) return
      if (tErr) { setError('Couldn\'t load this group. Check your signal and try again.'); return }
      const perTrip = await loadCareerData(supabase, (trips || []).map(t => t.id))
      if (cancelled) return
      setStats({ groupId, data: buildGroupStats(perTrip, userId) })
    })()
    return () => { cancelled = true }
  }, [groupId, userId])

  const setGroupId = id => { setGroupIdState(id); if (userId) saveLast(userId, id) }
  const loading = !stats || stats.groupId !== groupId
  return { groups, groupId, setGroupId, stats: loading ? null : stats.data, loading, error }
}
