import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useGroup } from '../../context/GroupContext'

export default function PastTrips() {
  const { activeGroup } = useGroup()
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!activeGroup) { setLoading(false); return }
    supabase
      .from('trips')
      .select('*')
      .eq('group_id', activeGroup.id)
      .eq('status', 'archived')
      .order('created_at', { ascending: false })
      .then(({ data }) => { setTrips(data || []); setLoading(false) })
  }, [activeGroup])

  if (loading) return <div className="dashboard"><p>Loading…</p></div>

  return (
    <div className="dashboard">
      <h1>Past Trips</h1>
      {trips.length === 0 ? (
        <p className="meta">No archived trips yet.</p>
      ) : (
        trips.map(t => (
          <div key={t.id} className="round-card">
            <span>{t.name}</span>
            <span className="meta">{t.format ? t.format.replace(/_/g, ' ') : '—'}</span>
          </div>
        ))
      )}
    </div>
  )
}
