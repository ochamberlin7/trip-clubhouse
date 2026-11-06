// The groups a user belongs to, for the trip wizard's group dropdown (and later
// the Group stats page). A group is the tradition: it can hold many trips over
// the years, and any member can start its next trip (migration 20260680).

// Pure: memberships [{ group_id, groups: { id, name } }] + trips [{ group_id, start_date }]
// (deleted trips already left out) → [{ id, name, trips, lastDate, lastYear }],
// most recent trip first. Groups with no trips left are dropped.
export function summarizeGroups(memberships = [], trips = []) {
  const byId = new Map()
  for (const m of memberships) {
    const id = m.group_id ?? m.groups?.id
    if (!id || byId.has(id)) continue
    byId.set(id, { id, name: (m.groups?.name || '').trim() || 'Unnamed group', trips: 0, lastDate: null })
  }
  for (const t of trips) {
    const g = byId.get(t.group_id)
    if (!g) continue
    g.trips++
    if (t.start_date && (!g.lastDate || t.start_date > g.lastDate)) g.lastDate = t.start_date
  }
  return [...byId.values()]
    .filter(g => g.trips > 0)
    .map(g => ({ ...g, lastYear: g.lastDate ? g.lastDate.slice(0, 4) : null }))
    .sort((a, b) => (b.lastDate || '').localeCompare(a.lastDate || '') || a.name.localeCompare(b.name))
}

// "4 trips · 2026"
export function groupMeta(g) {
  return [`${g.trips} trip${g.trips === 1 ? '' : 's'}`, g.lastYear].filter(Boolean).join(' · ')
}

export async function loadMyGroups(client, userId) {
  if (!userId) return []
  const { data: gm, error } = await client.from('group_members').select('group_id, groups(id, name)').eq('user_id', userId)
  if (error || !gm?.length) return []
  const ids = [...new Set(gm.map(m => m.group_id).filter(Boolean))]
  const { data: trips } = await client.from('trips').select('group_id, start_date').in('group_id', ids).is('deleted_at', null)
  return summarizeGroups(gm, trips || [])
}
