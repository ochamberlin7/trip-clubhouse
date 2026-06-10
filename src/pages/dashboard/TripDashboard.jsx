import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useGroup } from '../../context/GroupContext'

// ── helpers ──────────────────────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric'
  })
}

function formatDateRange(start, end) {
  if (!start || !end) return ''
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  const opts = { month: 'short', day: 'numeric' }
  return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`
}

function daysBetween(start, end) {
  if (!start || !end) return 0
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  return Math.round((e - s) / 86400000) + 1
}

// ── Tab components ────────────────────────────────────────────────

function TabDashboard({ trip, rounds }) {
  const totalDays = daysBetween(trip.start_date, trip.end_date)
  const golfDays = [...new Set(rounds.map(r => r.date))].length
  const totalRounds = rounds.length

  // Reconstruct schedule from rounds grouped by date
  const byDate = {}
  rounds.forEach(r => {
    if (!byDate[r.date]) byDate[r.date] = []
    byDate[r.date].push(r.course_name)
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">{totalDays}</div>
          <div className="stat-label">Total Days</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{golfDays}</div>
          <div className="stat-label">Golf Days</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalRounds}</div>
          <div className="stat-label">Rounds</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{trip.team_mode ? '⛳' : '—'}</div>
          <div className="stat-label">{trip.team_mode ? 'Tournament' : 'No Tournament'}</div>
        </div>
      </div>

      {rounds.length > 0 && (
        <div>
          <p className="section-header">Golf Schedule</p>
          <div className="schedule-summary">
            {rounds.map(r => (
              <div key={r.id} className="schedule-row">
                <span className="schedule-row-date">{formatDate(r.date)}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, color: '#374151' }}>{r.course_name}</span>
                  <span className="type-pill golf">Golf</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {rounds.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">⛳</div>
          No rounds scheduled yet.
        </div>
      )}
    </div>
  )
}

function TabScores({ rounds }) {
  const [selected, setSelected] = useState(rounds[0]?.id ?? null)

  if (rounds.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📊</div>
        No rounds to score yet.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="pill-row">
        {rounds.map(r => (
          <button
            key={r.id}
            className={`pill-btn ${selected === r.id ? 'active' : ''}`}
            onClick={() => setSelected(r.id)}
          >
            {r.course_name}
          </button>
        ))}
      </div>
      <div className="empty-state" style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14 }}>
        <div className="empty-state-icon">🚧</div>
        Scorecards coming soon
      </div>
    </div>
  )
}

function TabLeaderboard({ trip, teams }) {
  if (!trip.team_mode) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🏆</div>
        No tournament set up
      </div>
    )
  }

  if (teams.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🏆</div>
        Teams not yet created.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p className="section-header">Match Play · Teams</p>
      {teams.map((team, i) => (
        <div key={team.id} className="team-card">
          <div className="team-card-header">
            <span className="team-rank">{i + 1}</span>
            <span className="team-name">{team.name}</span>
            <span className="team-score">— pts</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function TabTeeTimes({ rounds }) {
  if (rounds.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">⏰</div>
        No rounds scheduled.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rounds.map(r => (
        <div key={r.id} className="tee-time-card">
          <div className="tee-time-course">Round {r.round_number} · {r.course_name}</div>
          <div className="tee-time-date">{formatDate(r.date)}</div>
          <div className="tee-time-tbd">Times TBD</div>
        </div>
      ))}
    </div>
  )
}

function TabMenu({ players, navigate, trip, activeGroup, onDevReset }) {
  const [resetting, setResetting] = useState(false)

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  async function handleDevReset() {
    const ok = window.confirm('This will permanently delete your trip and all associated data. Continue?')
    if (!ok) return
    setResetting(true)
    try {
      await onDevReset(trip, activeGroup)
      navigate('/onboarding/trip', { replace: true })
    } catch (err) {
      alert('Reset failed: ' + (err?.message || String(err)))
      setResetting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <p className="menu-section-label">Players</p>
        <div className="roster-list">
          {players.map(p => (
            <div key={p.id} className="roster-item">
              <div>
                <div className="roster-name">{p.displayName}</div>
                {p.isGuest && <div className="roster-meta">Guest</div>}
              </div>
            </div>
          ))}
          {players.length === 0 && (
            <p style={{ color: '#9ca3af', fontSize: 14 }}>No players added yet.</p>
          )}
        </div>
      </div>

      <div>
        <p className="menu-section-label">More</p>
        <div className="menu-section">
          <button className="menu-item">
            <span><span className="menu-item-icon">✈️</span> Flights</span>
            <span className="menu-item-chevron">›</span>
          </button>
          <button className="menu-item">
            <span><span className="menu-item-icon">ℹ️</span> App Info</span>
            <span className="menu-item-chevron">›</span>
          </button>
        </div>
      </div>

      <div>
        <p className="menu-section-label">Account</p>
        <div className="menu-section">
          <button className="menu-item" onClick={handleSignOut}
            style={{ color: '#ef4444' }}>
            Sign Out
          </button>
        </div>
      </div>

      {import.meta.env.DEV && (
        <div>
          <p className="menu-section-label" style={{ color: '#f59e0b' }}>Developer Tools</p>
          <div className="menu-section">
            <button
              className="menu-item"
              onClick={handleDevReset}
              disabled={resetting}
              style={{ color: '#dc2626', opacity: resetting ? 0.5 : 1 }}
            >
              {resetting ? 'Deleting…' : '🗑 Reset Trip & Start Over'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { id: 'scores',    label: 'Scores',    icon: '📊' },
  { id: 'leaderboard', label: 'Leaderboard', icon: '🏆' },
  { id: 'tee-times', label: 'Tee Times', icon: '⏰' },
  { id: 'menu',      label: 'Menu',      icon: '☰'  },
]

export default function TripDashboard() {
  const { user } = useAuth()
  const { activeGroup } = useGroup()
  const navigate = useNavigate()
  const location = useLocation()

  const [activeTab, setActiveTab] = useState('dashboard')
  // Change 5: show banner when redirected from wizard due to existing trip
  const [showTripBanner, setShowTripBanner] = useState(
    location.state?.singleTripWarning ?? false
  )
  const [trip, setTrip] = useState(null)
  const [rounds, setRounds] = useState([])
  const [players, setPlayers] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)

  useEffect(() => {
    if (!activeGroup) {
      navigate('/groups', { replace: true })
      return
    }
    fetchAll()
  }, [activeGroup])

  async function devReset(trip, activeGroup) {
    // Gather round IDs to delete dependent rows first
    const { data: roundRows } = await supabase
      .from('rounds').select('id').eq('trip_id', trip.id)
    const roundIds = (roundRows || []).map(r => r.id)

    if (roundIds.length > 0) {
      // These tables may not exist yet — swallow errors individually
      await supabase.from('scores').delete().in('round_id', roundIds).then(() => {})
      const { data: pairingRows } = await supabase
        .from('pairings').select('id').in('round_id', roundIds)
      const pairingIds = (pairingRows || []).map(p => p.id)
      if (pairingIds.length > 0) {
        await supabase.from('pairing_players').delete().in('pairing_id', pairingIds).then(() => {})
      }
      await supabase.from('pairings').delete().in('round_id', roundIds).then(() => {})
      await supabase.from('course_holes').delete().in('round_id', roundIds).then(() => {})
    }

    await supabase.from('rounds').delete().eq('trip_id', trip.id)
    await supabase.from('trip_players').delete().eq('trip_id', trip.id)
    await supabase.from('teams').delete().eq('trip_id', trip.id)
    await supabase.from('trips').delete().eq('id', trip.id)
    await supabase.from('group_members').delete().eq('group_id', activeGroup.id)
    await supabase.from('groups').delete().eq('id', activeGroup.id)
  }

  async function fetchAll() {
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

      const [roundsRes, playersRes, teamsRes] = await Promise.all([
        supabase.from('rounds').select('*').eq('trip_id', tripData.id).order('round_number'),
        supabase.from('trip_players').select('id, user_id, guest_name, handicap_index').eq('trip_id', tripData.id),
        supabase.from('teams').select('*').eq('trip_id', tripData.id).order('name'),
      ])

      if (roundsRes.error) throw roundsRes.error

      const rawPlayers = playersRes.data || []
      const userIds = rawPlayers.map(p => p.user_id).filter(Boolean)
      let profileMap = {}
      if (userIds.length > 0) {
        const { data: profileRows } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', userIds)
        if (profileRows) profileRows.forEach(pr => { profileMap[pr.id] = pr.display_name })
      }

      const enriched = rawPlayers.map(p => ({
        ...p,
        displayName: p.guest_name ?? profileMap[p.user_id] ?? '(unknown)',
        isGuest: !!p.guest_name,
      }))

      setRounds(roundsRes.data || [])
      setPlayers(enriched)
      setTeams(teamsRes.data || [])
    } catch (err) {
      setFetchError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="loading-screen">Loading trip…</div>

  if (fetchError) return (
    <div className="loading-screen" style={{ flexDirection: 'column', gap: 16 }}>
      <p style={{ color: '#ef4444' }}>Failed to load trip: {fetchError}</p>
      <button className="btn btn-outline btn-auto" onClick={fetchAll}>Retry</button>
    </div>
  )

  if (!trip) return (
    <div className="loading-screen" style={{ flexDirection: 'column', gap: 20 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48 }}>⛳</div>
        <p style={{ fontSize: 18, fontWeight: 700, color: '#1a2b4a', marginTop: 12 }}>No active trip</p>
        <p style={{ fontSize: 14, color: '#6b7280', marginTop: 6 }}>Create a trip to get started.</p>
      </div>
      <button className="btn btn-primary btn-auto" onClick={() => navigate('/onboarding/trip')}>
        Create a Trip
      </button>
    </div>
  )

  return (
    <div className="dashboard-page">
      {/* Top bar */}
      <div className="dashboard-topbar">
        <div className="dashboard-topbar-brand">Trip Clubhouse</div>
        <div className="dashboard-topbar-title">{trip.name}</div>
        {(trip.start_date || trip.end_date) && (
          <div className="dashboard-topbar-dates">{formatDateRange(trip.start_date, trip.end_date)}</div>
        )}
      </div>

      {/* Change 5: single-trip warning banner */}
      {showTripBanner && (
        <div style={{
          background: '#eff6ff', borderBottom: '1px solid #bfdbfe',
          padding: '10px 20px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 12, fontSize: 13, color: '#1e40af',
        }}>
          <span>
            Trip Clubhouse currently supports one active trip. Multi-trip support is coming soon.
          </span>
          <button
            onClick={() => setShowTripBanner(false)}
            style={{
              background: 'none', border: 'none', color: '#60a5fa',
              fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 0, flexShrink: 0,
            }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Tab content */}
      <div className="dashboard-content">
        {activeTab === 'dashboard'   && <TabDashboard trip={trip} rounds={rounds} />}
        {activeTab === 'scores'      && <TabScores rounds={rounds} />}
        {activeTab === 'leaderboard' && <TabLeaderboard trip={trip} teams={teams} />}
        {activeTab === 'tee-times'   && <TabTeeTimes rounds={rounds} />}
        {activeTab === 'menu'        && <TabMenu players={players} navigate={navigate} trip={trip} activeGroup={activeGroup} onDevReset={devReset} />}
      </div>

      {/* Bottom tab bar */}
      <div className="tab-bar">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
