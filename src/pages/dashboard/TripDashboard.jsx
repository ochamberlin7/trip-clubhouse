import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useGroup } from '../../context/GroupContext'

function fmtFormat(format) {
  return format ? format.replace(/_/g, ' ') : '—'
}

export default function TripDashboard() {
  const { activeGroup, isAdmin } = useGroup()
  const navigate = useNavigate()
  const [trip, setTrip] = useState(null)
  const [rounds, setRounds] = useState([])
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)

  useEffect(() => {
    if (!activeGroup) { navigate('/groups'); return }
    fetchTripData()
  }, [activeGroup])

  async function fetchTripData() {
    setLoading(true)
    setFetchError(null)
    try {
      const { data: tripData, error: tripErr } = await supabase
        .from('trips')
        .select('*')
        .eq('group_id', activeGroup.id)
        .eq('status', 'active')
        .maybeSingle()

      if (tripErr) throw tripErr
      if (!tripData) { setLoading(false); return }
      setTrip(tripData)

      // Fetch rounds and players separately — joining profiles on a nullable
      // user_id FK can fail in PostgREST when user_id is null (guest players).
      // We read display names from profiles only for rows that have a user_id.
      const [roundsRes, playersRes] = await Promise.all([
        supabase.from('rounds').select('*').eq('trip_id', tripData.id).order('round_number'),
        supabase.from('trip_players').select('id, user_id, guest_name, handicap_index').eq('trip_id', tripData.id),
      ])

      if (roundsRes.error) throw roundsRes.error

      const rawPlayers = playersRes.data || []

      // Fetch display names only for rows with a real user_id
      const userIds = rawPlayers.map(p => p.user_id).filter(Boolean)
      let profileMap = {}
      if (userIds.length > 0) {
        const { data: profileRows } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', userIds)
        if (profileRows) {
          profileRows.forEach(pr => { profileMap[pr.id] = pr.display_name })
        }
      }

      const enriched = rawPlayers.map(p => ({
        ...p,
        displayName: p.guest_name ?? profileMap[p.user_id] ?? '(unknown)',
        isGuest: !!p.guest_name,
      }))

      setRounds(roundsRes.data || [])
      setPlayers(enriched)
    } catch (err) {
      console.error('[TripDashboard] fetchTripData error:', err)
      setFetchError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="dashboard"><p>Loading trip…</p></div>

  if (fetchError) return (
    <div className="dashboard">
      <p className="error">Failed to load trip: {fetchError}</p>
      <button onClick={fetchTripData}>Retry</button>
    </div>
  )

  if (!trip) return (
    <div className="dashboard">
      <h2>No active trip</h2>
      <p className="meta">Create a trip to get started.</p>
      {isAdmin && (
        <button onClick={() => navigate('/onboarding/trip')}>Create a Trip</button>
      )}
    </div>
  )

  return (
    <div className="dashboard">
      <h1>{trip.name}</h1>
      <p className="meta">{activeGroup?.name} · {fmtFormat(trip.format)}</p>

      <section>
        <h2>Rounds</h2>
        {rounds.length === 0 && <p className="meta">No rounds added yet.</p>}
        {rounds.map(r => (
          <div key={r.id} className="round-card">
            <span>Round {r.round_number} — {r.course_name}</span>
            <span className="date">{r.date}</span>
            <span className={`status ${r.status}`}>{r.status}</span>
          </div>
        ))}
      </section>

      <section>
        <h2>Roster ({players.length})</h2>
        {players.length === 0 && <p className="meta">No players added yet.</p>}
        {players.map(p => (
          <div key={p.id} className="player-card">
            <span>
              {p.displayName}
              {p.isGuest && <span className="meta"> (guest)</span>}
            </span>
            {p.handicap_index != null && <span className="hcp">HCP {p.handicap_index}</span>}
          </div>
        ))}
        {isAdmin && (
          <button className="secondary" onClick={() => navigate('/admin/roster')}>
            Manage Roster
          </button>
        )}
      </section>
    </div>
  )
}
