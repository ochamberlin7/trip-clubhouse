import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useGroup } from '../../context/GroupContext'

// ── Helpers ──────────────────────────────────────────────────────

function daysUntil(dateStr) {
  if (!dateStr) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.ceil((new Date(dateStr + 'T00:00:00') - today) / 86400000)
}

function formatDateRange(start, end) {
  if (!start) return ''
  const opts = { month: 'short', day: 'numeric' }
  const s = new Date(start + 'T00:00:00').toLocaleDateString('en-US', opts)
  const e = end ? new Date(end + 'T00:00:00').toLocaleDateString('en-US', { ...opts, year: 'numeric' }) : ''
  return e ? `${s} – ${e}` : s
}

function fmtDayHeader(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const day = ['SUN','MON','TUE','WED','THU','FRI','SAT'][d.getDay()]
  return `${day} ${d.getMonth() + 1}/${d.getDate()}`
}

function groupByDate(rounds) {
  const g = {}
  rounds.forEach(r => { (g[r.date] ??= []).push(r) })
  return Object.entries(g).sort(([a], [b]) => a.localeCompare(b))
}

function initials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

// ── SVG tab icons — thin outline, CTI style ───────────────────────
function TabIcon({ id }) {
  const svg = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (id === 'dashboard')
    return <svg {...svg}><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
  if (id === 'scores')
    return <svg {...svg}><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>
  if (id === 'leaderboard')
    return <svg {...svg}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
  if (id === 'tee-times')
    return <svg {...svg}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
  if (id === 'menu')
    return <svg {...svg}><path d="M4 6h16M4 12h16M4 18h16"/></svg>
  return null
}

// ── Weather widget ───────────────────────────────────────────────

const WX_CODES = {
  0: ['☀️','Clear'], 1: ['🌤','Mostly Clear'], 2: ['⛅','Partly Cloudy'], 3: ['☁️','Overcast'],
  45: ['🌫','Fog'], 48: ['🌫','Icy Fog'],
  51: ['🌦','Light Drizzle'], 53: ['🌦','Drizzle'], 55: ['🌦','Heavy Drizzle'],
  61: ['🌧','Light Rain'], 63: ['🌧','Rain'], 65: ['🌧','Heavy Rain'],
  71: ['❄️','Light Snow'], 73: ['❄️','Snow'], 75: ['❄️','Heavy Snow'], 77: ['🌨','Sleet'],
  80: ['🌦','Showers'], 81: ['🌧','Heavy Showers'], 82: ['⛈','Violent Showers'],
  85: ['🌨','Snow Showers'], 86: ['🌨','Heavy Snow Showers'],
  95: ['⛈','Thunderstorm'], 96: ['⛈','Thunderstorm + Hail'], 99: ['⛈','Heavy Thunderstorm'],
}

function wxIcon(code) { return (WX_CODES[code] ?? ['🌡','—'])[0] }
function wxDesc(code) { return (WX_CODES[code] ?? ['🌡','—'])[1] }

const FALLBACK_LAT = 44.5
const FALLBACK_LNG = -84.5

function WeatherWidget({ tripName, startDate }) {
  const [days, setDays] = useState(null)
  const [loading, setLoading] = useState(true)
  const [locationLabel, setLocationLabel] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        let lat = FALLBACK_LAT, lng = FALLBACK_LNG, label = 'Northern Michigan'
        try {
          const geoRes = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(tripName)}&count=1&language=en&format=json`
          )
          const geoJson = await geoRes.json()
          const hit = geoJson?.results?.[0]
          if (hit) { lat = hit.latitude; lng = hit.longitude; label = hit.name }
        } catch { /* geocoding failed — use fallback coords */ }

        const wxRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
          `&daily=weathercode,temperature_2m_max,temperature_2m_min` +
          `&temperature_unit=fahrenheit&timezone=auto&forecast_days=7`
        )
        const wx = await wxRes.json()
        if (!cancelled && wx?.daily?.time) {
          setDays(wx.daily.time.map((t, i) => ({
            date: t,
            code: wx.daily.weathercode[i],
            hi: Math.round(wx.daily.temperature_2m_max[i]),
            lo: Math.round(wx.daily.temperature_2m_min[i]),
          })))
          setLocationLabel(label)
        }
      } catch {
        if (!cancelled) setDays([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [tripName])

  if (loading) return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="widget-title">☁️ Weather</span>
      </div>
      <div className="widget-loading">Loading forecast…</div>
    </div>
  )

  if (!days || days.length === 0) return null

  return (
    <div className="widget-card">
      <div className="widget-header">
        <span className="widget-title">☁️ Weather</span>
        <span className="widget-sub">{locationLabel}</span>
      </div>
      <div className="wx-row">
        {days.map(d => {
          const dt = new Date(d.date + 'T00:00:00')
          const dayLabel = ['Su','Mo','Tu','We','Th','Fr','Sa'][dt.getDay()]
          return (
            <div key={d.date} className="wx-day">
              <div className="wx-day-label">{dayLabel}</div>
              <div className="wx-icon" title={wxDesc(d.code)}>{wxIcon(d.code)}</div>
              <div className="wx-hi">{d.hi}°</div>
              <div className="wx-lo">{d.lo}°</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Chat widget ──────────────────────────────────────────────────

function ChatWidget({ tripId, userId, displayName }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const bottomRef = React.useRef(null)

  useEffect(() => {
    let sub
    async function init() {
      const { data, error: fetchErr } = await supabase
        .from('messages')
        .select('id, display_name, content, created_at, user_id')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: true })
        .limit(100)

      if (fetchErr) {
        setError(fetchErr.message)
        return
      }
      setMessages(data || [])

      sub = supabase
        .channel(`messages:${tripId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `trip_id=eq.${tripId}`,
        }, payload => {
          setMessages(prev => [...prev, payload.new])
        })
        .subscribe()
    }
    init()
    return () => { if (sub) supabase.removeChannel(sub) }
  }, [tripId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(e) {
    e.preventDefault()
    const content = text.trim()
    if (!content || sending) return
    setSending(true)
    const { error: sendErr } = await supabase.from('messages').insert({
      trip_id: tripId,
      user_id: userId,
      display_name: displayName,
      content,
    })
    if (!sendErr) setText('')
    setSending(false)
  }

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  return (
    <div className="widget-card chat-widget">
      <div className="widget-header">
        <span className="widget-title">💬 Sh*t Talk Thread</span>
      </div>

      {error ? (
        <div className="chat-error">Chat unavailable — table may not exist yet.</div>
      ) : (
        <div className="chat-messages">
          {messages.length === 0 && (
            <div className="chat-empty">No messages yet. Start the trash talk.</div>
          )}
          {messages.map(m => {
            const isMe = m.user_id === userId
            return (
              <div key={m.id} className={`chat-bubble-wrap ${isMe ? 'me' : 'them'}`}>
                {!isMe && <div className="chat-sender">{m.display_name}</div>}
                <div className={`chat-bubble ${isMe ? 'me' : 'them'}`}>{m.content}</div>
                <div className="chat-time">{fmtTime(m.created_at)}</div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
      )}

      {!error && (
        <form className="chat-input-row" onSubmit={send}>
          <input
            type="text"
            className="chat-input"
            placeholder="Say something…"
            value={text}
            onChange={e => setText(e.target.value)}
            maxLength={500}
          />
          <button type="submit" className="chat-send-btn" disabled={!text.trim() || sending}>
            ↑
          </button>
        </form>
      )}
    </div>
  )
}

// ── Tab: Home ────────────────────────────────────────────────────

function TabHome({ trip, rounds, userId, displayName }) {
  const n = daysUntil(trip.start_date)
  const dateRange = formatDateRange(trip.start_date, trip.end_date)
  const groups = groupByDate(rounds)
  const isTournament = !!trip.team_mode

  return (
    <div>
      {/* Countdown */}
      {n !== null && (
        <div className="countdown-card">
          <div className="countdown-number">
            {n > 0 ? n : n === 0 ? '🏌' : '⛳'}
          </div>
          <div className="countdown-label">
            {n > 0 ? 'Days Until Tee Off' : n === 0 ? 'Tee Off Today' : 'Trip In Progress'}
          </div>
          {dateRange && <div className="countdown-date-str">{dateRange}</div>}
        </div>
      )}

      {/* Tee Times section */}
      {groups.length > 0 ? groups.map(([date, dayRounds]) => (
        <div key={date} className="tee-group">
          <div className="tee-group-header">{fmtDayHeader(date)}</div>
          {dayRounds.map(r => (
            <div key={r.id} className="tee-group-row">
              <div>
                <div className="tee-group-course">{r.course_name}</div>
                <span className={`type-pill ${isTournament ? 'tournament' : 'practice'}`}>
                  {isTournament ? 'Tournament' : 'Practice'}
                </span>
              </div>
              <div className="tee-group-time">TBD</div>
            </div>
          ))}
        </div>
      )) : (
        <div className="empty-state">
          <span className="empty-state-icon">⛳</span>
          No rounds scheduled yet.
        </div>
      )}

      {/* Weather */}
      <WeatherWidget tripName={trip.name} startDate={trip.start_date} />

      {/* Chat */}
      <ChatWidget tripId={trip.id} userId={userId} displayName={displayName} />
    </div>
  )
}

// ── Tab: Scores ──────────────────────────────────────────────────

function TabScores({ rounds }) {
  const [selectedId, setSelectedId] = useState(rounds[0]?.id ?? null)
  const [pairing, setPairing] = useState(1)

  if (rounds.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon">📊</span>
        No rounds to score yet.
      </div>
    )
  }

  const selected = rounds.find(r => r.id === selectedId)

  return (
    <div>
      {/* Round pill selectors */}
      <div className="pill-row">
        {rounds.map(r => (
          <button
            key={r.id}
            className={`pill-btn ${selectedId === r.id ? 'active' : ''}`}
            onClick={() => setSelectedId(r.id)}
          >
            {r.course_name.slice(0, 8)}
          </button>
        ))}
      </div>

      {/* Pairing segmented control */}
      <div className="pair-tabs">
        <button className={`pair-tab ${pairing === 1 ? 'active' : ''}`} onClick={() => setPairing(1)}>
          Pairing 1
        </button>
        <button className={`pair-tab ${pairing === 2 ? 'active' : ''}`} onClick={() => setPairing(2)}>
          Pairing 2
        </button>
      </div>

      {/* Scorecard placeholder */}
      {selected && (
        <div className="card" style={{ textAlign: 'center', padding: '32px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
            {selected.course_name} · Pairing {pairing}
          </div>
          <div style={{ fontSize: 14, color: 'var(--muted)' }}>Live scorecard coming soon</div>
        </div>
      )}
    </div>
  )
}

// ── Tab: Leaderboard ─────────────────────────────────────────────

function TabLeaderboard({ trip, teams, rounds }) {
  const [view, setView] = useState('tournament')

  if (!trip.team_mode) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon">🏆</span>
        No tournament set up
      </div>
    )
  }

  if (teams.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon">🏆</span>
        Teams not yet created.
      </div>
    )
  }

  return (
    <div>
      {/* Toggle */}
      <div className="lb-toggle">
        <button className={`lb-toggle-btn ${view === 'tournament' ? 'active' : ''}`} onClick={() => setView('tournament')}>
          Tournament
        </button>
        <button className={`lb-toggle-btn ${view === 'wales' ? 'active' : ''}`} onClick={() => setView('wales')}>
          Prince of Wales
        </button>
      </div>

      {/* Team cards */}
      {teams.map((team, i) => (
        <div key={team.id} className="lb-team-card">
          <div className={`lb-team-header ${i % 2 === 0 ? 't1' : 't2'}`}>
            <span className="lb-team-name">{team.name}</span>
            <span className="lb-team-pts">—</span>
          </div>
          <div className="lb-rounds">
            {rounds.map(r => (
              <div key={r.id} className="lb-round-row">
                <span className="lb-round-name">{r.course_name}</span>
                <span className="lb-round-score">—</span>
              </div>
            ))}
            {rounds.length === 0 && (
              <div className="lb-round-row" style={{ justifyContent: 'center', color: 'var(--muted)', fontStyle: 'italic' }}>
                No rounds yet
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Tab: Tee Times ───────────────────────────────────────────────

function TabTeeTimes({ rounds, trip }) {
  if (rounds.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon">⏰</span>
        No rounds scheduled.
      </div>
    )
  }

  const groups = groupByDate(rounds)
  const isTournament = !!trip?.team_mode

  return (
    <div>
      {groups.map(([date, dayRounds]) => (
        <div key={date} className="tee-group">
          <div className="tee-group-header">{fmtDayHeader(date)}</div>
          {dayRounds.map(r => (
            <div key={r.id} className="tee-group-row">
              <div>
                <div className="tee-group-course">{r.course_name}</div>
                <span className={`type-pill ${isTournament ? 'tournament' : 'practice'}`}>
                  {isTournament ? 'Tournament' : 'Practice'}
                </span>
              </div>
              <div className="tee-group-time">TBD</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Tab: Menu ────────────────────────────────────────────────────

function TabMenu({ players, navigate, trip, activeGroup, onDevReset, user }) {
  const [resetting, setResetting] = useState(false)
  const me = players.find(p => !p.isGuest)
  const displayName = me?.displayName ?? user?.email?.split('@')[0] ?? 'You'

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
    <div style={{ paddingBottom: 32 }}>
      {/* Profile */}
      <div className="menu-profile-row">
        <div className="menu-avatar">{initials(displayName)}</div>
        <div>
          <div className="menu-profile-name">{displayName}</div>
          <div className="menu-profile-sub">{trip?.name}</div>
        </div>
      </div>

      {/* Roster */}
      <p className="menu-section-label">Roster</p>
      <div className="menu-section">
        {players.map(p => (
          <div key={p.id} className="menu-item" style={{ cursor: 'default' }}>
            <div className="menu-item-left">
              <div className="menu-item-icon-box" style={{ background: 'var(--bg2)', fontSize: 14 }}>
                {initials(p.displayName)}
              </div>
              <div>
                <div className="menu-item-label">{p.displayName}</div>
                <div className="menu-item-sub">{p.isGuest ? 'Guest player' : 'Member'}</div>
              </div>
            </div>
          </div>
        ))}
        {players.length === 0 && (
          <div className="menu-item" style={{ cursor: 'default', color: 'var(--muted)', fontStyle: 'italic' }}>
            No players added yet.
          </div>
        )}
      </div>

      {/* More */}
      <p className="menu-section-label">More</p>
      <div className="menu-section">
        <button className="menu-item">
          <div className="menu-item-left">
            <div className="menu-item-icon-box">✈️</div>
            <div>
              <div className="menu-item-label">Flights</div>
              <div className="menu-item-sub">Arrival & departure info</div>
            </div>
          </div>
          <span className="menu-item-chevron">›</span>
        </button>
        <button className="menu-item">
          <div className="menu-item-left">
            <div className="menu-item-icon-box">ℹ️</div>
            <div>
              <div className="menu-item-label">App Info</div>
              <div className="menu-item-sub">Install guide & about</div>
            </div>
          </div>
          <span className="menu-item-chevron">›</span>
        </button>
      </div>

      {/* Account */}
      <p className="menu-section-label">Account</p>
      <div className="menu-section">
        <button className="menu-item" onClick={handleSignOut}>
          <div className="menu-item-left">
            <div className="menu-item-icon-box">🚪</div>
            <div>
              <div className="menu-item-label" style={{ color: 'var(--red)' }}>Sign Out</div>
            </div>
          </div>
        </button>
      </div>

      {/* DEV tools */}
      {import.meta.env.DEV && (
        <>
          <p className="menu-section-label" style={{ color: '#f59e0b' }}>Developer Tools</p>
          <div className="menu-section">
            <button className="menu-item" onClick={handleDevReset} disabled={resetting}
              style={{ opacity: resetting ? 0.5 : 1 }}>
              <div className="menu-item-left">
                <div className="menu-item-icon-box">🗑</div>
                <div>
                  <div className="menu-item-label" style={{ color: 'var(--red)' }}>
                    {resetting ? 'Deleting…' : 'Reset Trip & Start Over'}
                  </div>
                  <div className="menu-item-sub">Deletes all trip data</div>
                </div>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────

const TABS = [
  { id: 'dashboard',   label: 'Home'        },
  { id: 'scores',      label: 'Score'       },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'tee-times',   label: 'Tee Times'   },
  { id: 'menu',        label: 'Menu'        },
]

export default function TripDashboard() {
  const { user } = useAuth()
  const { activeGroup } = useGroup()
  const navigate = useNavigate()
  const location = useLocation()

  const [activeTab, setActiveTab] = useState('dashboard')
  const [showTripBanner, setShowTripBanner] = useState(location.state?.singleTripWarning ?? false)
  const [trip, setTrip] = useState(null)
  const [rounds, setRounds] = useState([])
  const [players, setPlayers] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)

  useEffect(() => {
    if (!activeGroup) { navigate('/groups', { replace: true }); return }
    fetchAll()
  }, [activeGroup])

  async function devReset(trip, activeGroup) {
    const { data: roundRows } = await supabase.from('rounds').select('id').eq('trip_id', trip.id)
    const roundIds = (roundRows || []).map(r => r.id)
    if (roundIds.length > 0) {
      await supabase.from('scores').delete().in('round_id', roundIds).then(() => {})
      const { data: pairingRows } = await supabase.from('pairings').select('id').in('round_id', roundIds)
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
        .from('trips').select('*').eq('group_id', activeGroup.id).eq('status', 'active').maybeSingle()
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
        const { data: profileRows } = await supabase.from('profiles').select('id, display_name').in('id', userIds)
        if (profileRows) profileRows.forEach(pr => { profileMap[pr.id] = pr.display_name })
      }

      setRounds(roundsRes.data || [])
      setPlayers(rawPlayers.map(p => ({
        ...p,
        displayName: p.guest_name ?? profileMap[p.user_id] ?? '(unknown)',
        isGuest: !!p.guest_name,
      })))
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
      <p style={{ color: 'var(--red)' }}>Failed to load: {fetchError}</p>
      <button className="btn btn-outline btn-auto" onClick={fetchAll}>Retry</button>
    </div>
  )

  if (!trip) return (
    <div className="loading-screen" style={{ flexDirection: 'column', gap: 20 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48 }}>⛳</div>
        <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)', marginTop: 12 }}>No active trip</p>
        <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 6 }}>Create a trip to get started.</p>
      </div>
      <button className="btn btn-primary btn-auto" onClick={() => navigate('/onboarding/trip')}>Create a Trip</button>
    </div>
  )

  // Page header content per tab
  const headers = {
    dashboard:   { eyebrow: 'Trip Clubhouse', title: trip.name, sub: formatDateRange(trip.start_date, trip.end_date) },
    scores:      { eyebrow: 'Live Scoring',   title: trip.name },
    leaderboard: { eyebrow: 'Trip Leaderboard', title: trip.name },
    'tee-times': { eyebrow: 'Tee Times',     title: trip.name },
    menu:        null,
  }
  const hdr = headers[activeTab]

  return (
    <div className="dashboard-page">
      {/* ── Tab bar — sticky top ── */}
      <nav className="tab-bar">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <TabIcon id={tab.id} />
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* ── Page header ── */}
      {hdr && (
        <div className="page-header">
          <h1>{hdr.eyebrow}</h1>
          <h2>{hdr.title}</h2>
          {hdr.sub && <p>{hdr.sub}</p>}
        </div>
      )}

      {/* ── Warning banner ── */}
      {showTripBanner && (
        <div className="info-banner" style={{ margin: '10px 16px 0' }}>
          <span>One active trip at a time. Multi-trip support coming soon.</span>
          <button className="info-banner-close" onClick={() => setShowTripBanner(false)}>×</button>
        </div>
      )}

      {/* ── Tab content ── */}
      <div className="dashboard-content">
        {activeTab === 'dashboard'   && <TabHome trip={trip} rounds={rounds} userId={user?.id} displayName={players.find(p => p.user_id === user?.id)?.displayName ?? user?.email?.split('@')[0] ?? 'You'} />}
        {activeTab === 'scores'      && <TabScores rounds={rounds} />}
        {activeTab === 'leaderboard' && <TabLeaderboard trip={trip} teams={teams} rounds={rounds} />}
        {activeTab === 'tee-times'   && <TabTeeTimes rounds={rounds} trip={trip} />}
        {activeTab === 'menu'        && <TabMenu players={players} navigate={navigate} trip={trip} activeGroup={activeGroup} onDevReset={devReset} user={user} />}
      </div>
    </div>
  )
}
