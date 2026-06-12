import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useGroup } from '../../context/GroupContext'
import { getActiveRound } from '../../lib/scoring'
import TripHeader from '../../components/TripHeader'
import CountdownWidget from '../../components/CountdownWidget'
import TeeTimesWidget from '../../components/TeeTimesWidget'
import ChatWidget from '../../components/ChatWidget'
import DailyMVPCard from '../../components/DailyMVPCard'
import TournamentPurseWidget from '../../components/TournamentPurseWidget'
import MenuDrawer from '../../components/MenuDrawer'
import ScoringTab from '../../components/ScoringTab'

// ── Helpers ──────────────────────────────────────────────────────

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

// ── Weather widget — single-day current conditions ───────────────

const WX_ICONS = {
  0:'☀️',1:'☀️',2:'⛅',3:'☁️',45:'🌫️',48:'🌫️',51:'🌦️',53:'🌦️',55:'🌧️',
  61:'🌧️',63:'🌧️',65:'🌧️',71:'🌨️',73:'🌨️',75:'❄️',80:'🌦️',81:'🌧️',82:'⛈️',
  95:'⛈️',96:'⛈️',99:'⛈️',
}
const WX_DESC = {
  0:'Clear skies',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',
  45:'Foggy',48:'Rime fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',
  61:'Light rain',63:'Rain',65:'Heavy rain',71:'Light snow',73:'Snow',75:'Heavy snow',
  80:'Light showers',81:'Showers',82:'Violent showers',
  95:'Thunderstorm',96:'Thunderstorm w/ hail',99:'Severe thunderstorm',
}
function wxIcon(code) { return WX_ICONS[code] ?? '☁️' }
function wxDesc(code) { return WX_DESC[code] ?? '—' }

const wxStyles = {
  card: { background: '#FFFFFF', border: '1px solid #DDE3EA', borderRadius: '10px', overflow: 'hidden', marginBottom: '10px' },
  header: { background: '#1B3F6E', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '6px', color: '#fff', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' },
  headerRight: { fontSize: '12px', color: 'rgba(255,255,255,0.65)', fontWeight: 500 },
  inner: { padding: '14px' },
  mainRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  temp: { fontSize: '42px', fontWeight: 900, color: '#0D1B2A', lineHeight: 1 },
  condition: { fontSize: '13px', color: '#2C3E50', marginTop: '4px' },
  rightCol: { display: 'flex', alignItems: 'center', gap: '10px' },
  hiloBlock: { textAlign: 'right', lineHeight: 1.6 },
  hi: { fontSize: '13px', fontWeight: 700, color: '#0D1B2A' },
  lo: { fontSize: '13px', fontWeight: 700, color: '#7A8FA6' },
  emoji: { fontSize: '36px' },
  detailsRow: { marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #E8EDF3', display: 'flex', gap: '16px' },
  detailLabel: { fontSize: '11px', color: '#7A8FA6', textTransform: 'uppercase', letterSpacing: '0.5px' },
  detailValue: { display: 'block', fontSize: '13px', fontWeight: 600, color: '#2C3E50' },
  loading: { padding: '14px', fontSize: '13px', color: '#7A8FA6', textAlign: 'center' },
}

function WeatherIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </svg>
  )
}

function todayIsoLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function roundLocationLabel(r) {
  if (r.location_city && r.location_state) return `${r.location_city}, ${r.location_state}`
  if (r.location_city) return r.location_city
  if (r.club_name) return r.club_name.slice(0, 20)
  return null
}

// eslint-disable-next-line no-unused-vars -- tripStartDate/tripEndDate kept in the interface
// `rounds` comes from shared dashboard state; the effect re-runs (and re-fetches
// weather) whenever rounds change — e.g. after a commissioner edits a course.
function WeatherWidget({ rounds = [], tripName }) {
  const [wx, setWx] = useState(null)
  const [status, setStatus] = useState('loading') // 'loading' | 'ok' | 'error'
  const [locationLabel, setLocationLabel] = useState('Weather')

  // Stable dependency: only the locations that affect which weather we show.
  const locationKey = rounds.map(r => `${r.date}|${r.location_lat}|${r.location_lon}|${r.location_city}|${r.location_state}|${r.club_name}`).join(';')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setStatus('loading')
      try {
        const dated = rounds.filter(r => r.date).slice().sort((a, b) => a.date.localeCompare(b.date))

        // Next upcoming round (earliest date >= today), else the last round.
        const today = todayIsoLocal()
        const selected = dated.find(r => r.date >= today) || dated[dated.length - 1] || null

        if (!selected) { if (!cancelled) { setLocationLabel(tripName || 'Weather'); setStatus('error') } return }

        let lat = selected.location_lat
        let lon = selected.location_lon
        let label = roundLocationLabel(selected) || tripName || 'Weather'

        // No stored coords → geocode from city + state.
        if (lat == null || lon == null) {
          const query = [selected.location_city, selected.location_state].filter(Boolean).join(' ')
          if (query) {
            const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`)
            const geo = await geoRes.json()
            const hit = geo?.results?.[0]
            if (hit) { lat = hit.latitude; lon = hit.longitude }
          }
        }

        if (lat == null || lon == null) { if (!cancelled) { setLocationLabel(label); setStatus('error') } return }

        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
          `&current=temperature_2m,weathercode,windspeed_10m,relativehumidity_2m` +
          `&daily=temperature_2m_max,temperature_2m_min` +
          `&temperature_unit=fahrenheit&windspeed_unit=mph&timezone=auto&forecast_days=1`
        )
        const data = await res.json()
        if (cancelled) return
        if (data?.current) {
          setWx({
            temp: Math.round(data.current.temperature_2m),
            code: data.current.weathercode,
            wind: Math.round(data.current.windspeed_10m),
            humidity: data.current.relativehumidity_2m,
            hi: Math.round(data.daily.temperature_2m_max[0]),
            lo: Math.round(data.daily.temperature_2m_min[0]),
          })
          setLocationLabel(label)
          setStatus('ok')
        } else {
          setLocationLabel(label)
          setStatus('error')
        }
      } catch {
        if (!cancelled) setStatus('error')
      }
    }
    load()
    return () => { cancelled = true }
  }, [locationKey, tripName]) // eslint-disable-line react-hooks/exhaustive-deps

  // Always render the card shell — never return null.
  const header = (
    <div style={wxStyles.header}>
      <span style={wxStyles.headerLeft}><WeatherIcon /> Weather</span>
      <span style={wxStyles.headerRight}>{locationLabel}</span>
    </div>
  )

  if (status === 'loading') return (
    <div style={wxStyles.card}>
      {header}
      <div style={wxStyles.loading}>Loading conditions…</div>
    </div>
  )

  if (status === 'error' || !wx) return (
    <div style={wxStyles.card}>
      {header}
      <div style={wxStyles.inner}>
        <div style={wxStyles.mainRow}>
          <div>
            <div style={wxStyles.temp}>—°F</div>
            <div style={wxStyles.condition}>Weather unavailable</div>
          </div>
          <div style={wxStyles.rightCol}>
            <div style={wxStyles.hiloBlock}>
              <div style={wxStyles.hi}>↑ —°</div>
              <div style={wxStyles.lo}>↓ —°</div>
            </div>
            <div style={wxStyles.emoji}>☁️</div>
          </div>
        </div>
        <div style={wxStyles.detailsRow}>
          <div>
            <span style={wxStyles.detailLabel}>Wind</span>
            <span style={wxStyles.detailValue}>—</span>
          </div>
          <div>
            <span style={wxStyles.detailLabel}>Humidity</span>
            <span style={wxStyles.detailValue}>—</span>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div style={wxStyles.card}>
      {header}
      <div style={wxStyles.inner}>
        <div style={wxStyles.mainRow}>
          <div>
            <div style={wxStyles.temp}>{wx.temp}°F</div>
            <div style={wxStyles.condition}>{wxDesc(wx.code)}</div>
          </div>
          <div style={wxStyles.rightCol}>
            <div style={wxStyles.hiloBlock}>
              <div style={wxStyles.hi}>↑ {wx.hi}°</div>
              <div style={wxStyles.lo}>↓ {wx.lo}°</div>
            </div>
            <div style={wxStyles.emoji}>{wxIcon(wx.code)}</div>
          </div>
        </div>
        <div style={wxStyles.detailsRow}>
          <div>
            <span style={wxStyles.detailLabel}>Wind</span>
            <span style={wxStyles.detailValue}>{wx.wind} mph</span>
          </div>
          <div>
            <span style={wxStyles.detailLabel}>Humidity</span>
            <span style={wxStyles.detailValue}>{wx.humidity}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Tab: Home ────────────────────────────────────────────────────

function TabHome({ trip, rounds, userId, displayName, isCommissioner, onPurseUpdate }) {
  return (
    <div>
      {/* Countdown */}
      <CountdownWidget
        tripName={trip.name}
        startDate={trip.start_date}
        endDate={trip.end_date}
        rounds={rounds}
      />

      {/* Today's / next tee times — single day only */}
      <TeeTimesWidget
        rounds={rounds}
        tripStartDate={trip.start_date}
        tripEndDate={trip.end_date}
        today={new Date()}
      />

      {/* Weather */}
      <WeatherWidget rounds={rounds} tripName={trip.name} />

      {/* Chat */}
      <ChatWidget
        tripId={trip.id}
        currentUserId={userId}
        currentUserName={(displayName || '').split(' ')[0] || displayName}
      />

      {/* Daily MVPs — below the chat thread */}
      <DailyMVPCard tripId={trip.id} today={new Date()} />

      {/* Tournament purse — bottom of the stack */}
      <TournamentPurseWidget
        tripId={trip.id}
        isCommissioner={isCommissioner}
        purseAmount={trip.purse_amount || 0}
        onPurseUpdate={onPurseUpdate}
      />
    </div>
  )
}

// ── Tab: Leaderboard ─────────────────────────────────────────────

function TabLeaderboard({ trip, teams, rounds }) {
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

// "09:00" → "9:00 AM"
function to12(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ap}`
}
// "9:00 AM" → "09:00" (for prefilling the time input)
function to24(disp) {
  const m = (disp || '').match(/(\d+):(\d+)\s*(AM|PM)/i)
  if (!m) return ''
  let h = Number(m[1]); const ap = m[3].toUpperCase()
  if (ap === 'PM' && h !== 12) h += 12
  if (ap === 'AM' && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

function TabTeeTimes({ rounds, trip, isCommissioner, onUpdateRound }) {
  // Single inline editor / type toggle open at a time across the whole tab.
  const [editing, setEditing] = useState(null)   // { roundId, slot }
  const [editValue, setEditValue] = useState('')
  const [typeOpen, setTypeOpen] = useState(null)  // roundId

  if (rounds.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon">⏰</span>
        No rounds scheduled.
      </div>
    )
  }

  const groups = groupByDate(rounds)

  function openEditor(round, slot) {
    const cur = slot === 1 ? round.tee_time_1 : round.tee_time_2
    setEditValue(to24(cur))
    setTypeOpen(null)
    setEditing({ roundId: round.id, slot })
  }

  async function saveTime() {
    const display = to12(editValue)
    const col = editing.slot === 1 ? 'tee_time_1' : 'tee_time_2'
    await supabase.from('rounds').update({ [col]: display || null }).eq('id', editing.roundId)
    onUpdateRound(editing.roundId, { [col]: display || null })
    setEditing(null)
  }

  async function setType(roundId, type) {
    await supabase.from('rounds').update({ round_type: type }).eq('id', roundId)
    onUpdateRound(roundId, { round_type: type })
    setTypeOpen(null)
  }

  function TimeCell({ round, slot }) {
    const isEditing = editing && editing.roundId === round.id && editing.slot === slot
    const value = slot === 1 ? round.tee_time_1 : round.tee_time_2

    if (isEditing) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="time" value={editValue} onChange={e => setEditValue(e.target.value)}
            style={{ background: '#E8EDF3', border: '1px solid #1B3F6E', borderRadius: 6, padding: '5px 8px', fontSize: 14, color: '#0D1B2A', fontFamily: 'inherit', width: 'auto' }} />
          <button onClick={saveTime} style={{ background: '#1B3F6E', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 8px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 6 }}>✓</button>
          <button onClick={() => setEditing(null)} style={{ background: 'transparent', border: 'none', color: '#7A8FA6', fontSize: 16, cursor: 'pointer', marginLeft: 4 }}>✕</button>
        </div>
      )
    }

    const display = value
      ? <span style={{ fontSize: 14, fontWeight: 700, color: '#0D1B2A' }}>{value}</span>
      : <span style={{ fontSize: 13, fontWeight: 600, color: '#DDE3EA' }}>TBD</span>

    if (!isCommissioner) return display
    return (
      <button onClick={() => openEditor(round, slot)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0 }}>
        {display}
        <span style={{ fontSize: 11, color: '#7A8FA6' }}>✎</span>
      </button>
    )
  }

  return (
    <div>
      {groups.map(([date, dayRounds]) => (
        <div key={date} className="tee-group">
          <div className="tee-group-header">{fmtDayHeader(date)}</div>
          {dayRounds.map(r => {
            const isTournament = r.round_type !== 'practice'
            return (
              <div key={r.id} style={{ background: 'var(--bg1)', padding: '12px 14px', borderTop: '1px solid var(--bg2)' }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#0D1B2A' }}>{r.course_name}</div>

                {/* Badge + Change */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4, marginBottom: 10 }}>
                  <span className={`type-pill ${isTournament ? 'tournament' : 'practice'}`}>
                    {isTournament ? 'Tournament' : 'Practice'}
                  </span>
                  {isCommissioner && (
                    <span onClick={() => { setEditing(null); setTypeOpen(typeOpen === r.id ? null : r.id) }}
                      style={{ fontSize: 11, color: '#1B3F6E', cursor: 'pointer', marginLeft: 4 }}>Change</span>
                  )}
                  {isCommissioner && typeOpen === r.id && (
                    <span style={{ display: 'inline-flex', gap: 6, marginLeft: 4 }}>
                      {['practice', 'tournament'].map(t => {
                        const active = (t === 'tournament') === isTournament
                        return (
                          <button key={t} onClick={() => active ? setTypeOpen(null) : setType(r.id, t)}
                            style={{ borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
                              ...(active ? { background: '#1B3F6E', color: '#fff', border: 'none' } : { background: '#E8EDF3', color: '#7A8FA6', border: '1px solid #DDE3EA' }) }}>
                            {t}
                          </button>
                        )
                      })}
                    </span>
                  )}
                </div>

                {/* Pairing tee-time rows */}
                {[1, 2].map(slot => (
                  <div key={slot} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
                    <span style={{ fontSize: 12, color: '#7A8FA6', fontWeight: 500 }}>Pairing {slot}</span>
                    <TimeCell round={r} slot={slot} />
                  </div>
                ))}
              </div>
            )
          })}
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
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showTripBanner, setShowTripBanner] = useState(location.state?.singleTripWarning ?? false)
  const [trip, setTrip] = useState(null)
  const [rounds, setRounds] = useState([])
  const [players, setPlayers] = useState([])
  const [teams, setTeams] = useState([])
  const [isCommissioner, setIsCommissioner] = useState(false)
  const [scoringInit, setScoringInit] = useState(null) // { roundId, pairingNum } — active round to auto-open
  const [scoreConnStatus, setScoreConnStatus] = useState('connecting') // realtime status from ScoringTab
  const autoNavedRef = React.useRef(false)
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

      const [roundsRes, playersRes, teamsRes, memberRes] = await Promise.all([
        supabase.from('rounds').select('*').eq('trip_id', tripData.id).order('round_number'),
        supabase.from('trip_players').select('id, user_id, guest_name, handicap_index').eq('trip_id', tripData.id),
        supabase.from('teams').select('*').eq('trip_id', tripData.id).order('name'),
        user?.id
          ? supabase.from('group_members').select('role').eq('group_id', activeGroup.id).eq('user_id', user.id).maybeSingle()
          : Promise.resolve({ data: null }),
      ])
      if (roundsRes.error) throw roundsRes.error
      setIsCommissioner(memberRes.data?.role === 'admin')

      const rawPlayers = playersRes.data || []
      const userIds = rawPlayers.map(p => p.user_id).filter(Boolean)
      let profileMap = {}
      if (userIds.length > 0) {
        const { data: profileRows } = await supabase.from('profiles').select('id, display_name').in('id', userIds)
        if (profileRows) profileRows.forEach(pr => { profileMap[pr.id] = pr.display_name })
      }

      const roundList = roundsRes.data || []
      setRounds(roundList)
      setPlayers(rawPlayers.map(p => ({
        ...p,
        displayName: p.guest_name ?? profileMap[p.user_id] ?? '(unknown)',
        isGuest: !!p.guest_name,
      })))
      setTeams(teamsRes.data || [])

      // Determine the round being played right now → auto-open Score on load.
      await computeActiveScoring(roundList, rawPlayers)
    } catch (err) {
      setFetchError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  // Build the maps getActiveRound needs, find the active round + the user's
  // pairing, and (once) auto-navigate to the Score tab.
  async function computeActiveScoring(roundList, rawPlayers) {
    const roundIds = roundList.map(r => r.id)
    if (roundIds.length === 0) return
    const [pairRes, scoreRes] = await Promise.all([
      supabase.from('pairings').select('id, round_id, pairing_number').in('round_id', roundIds),
      supabase.from('scores').select('round_id, trip_player_id, hole_number').in('round_id', roundIds),
    ])
    const pairings = pairRes.data || []
    const pairIds = pairings.map(p => p.id)
    let pp = []
    if (pairIds.length) {
      const r = await supabase.from('pairing_players').select('pairing_id, trip_player_id, team_slot').in('pairing_id', pairIds)
      pp = r.data || []
    }
    const roundOfPairing = {}; pairings.forEach(p => { roundOfPairing[p.id] = p.round_id })
    const assignedByRound = {}
    pp.forEach(x => { const rid = roundOfPairing[x.pairing_id]; if (rid) (assignedByRound[rid] ??= new Set()).add(x.trip_player_id) })
    const holesByRoundPlayer = {}
    ;(scoreRes.data || []).forEach(sc => {
      const k = `${sc.round_id}:${sc.trip_player_id}`
      ;(holesByRoundPlayer[k] ??= new Set()).add(sc.hole_number)
    })

    const active = getActiveRound(roundList, { assignedByRound, holesByRoundPlayer })
    if (!active) { setScoringInit(null); return }

    // The user's pairing for the active round.
    const myTp = rawPlayers.find(p => p.user_id === user?.id)?.id
    let pairingNum = 1
    if (myTp) {
      const myPairingId = pp.find(x => x.trip_player_id === myTp && roundOfPairing[x.pairing_id] === active.id)?.pairing_id
      const num = pairings.find(p => p.id === myPairingId)?.pairing_number
      if (num) pairingNum = num
    }
    setScoringInit({ roundId: active.id, pairingNum })
    if (!autoNavedRef.current) { autoNavedRef.current = true; setActiveTab('scores') }
  }

  async function refetchTrip() {
    if (!trip?.id) return
    const { data } = await supabase.from('trips').select('*').eq('id', trip.id).maybeSingle()
    if (data) setTrip(data)
  }

  // Re-fetch rounds into shared state so every consumer (tee times, weather,
  // scoring, courses) updates instantly after a course change.
  async function refreshRounds() {
    if (!trip?.id) return
    const { data } = await supabase.from('rounds').select('*').eq('trip_id', trip.id).order('round_number')
    if (data) setRounds(data)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
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

  // Page header content per tab (dashboard uses the TripHeader component instead)
  const headers = {
    dashboard:   null,
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
            className={`tab-btn ${tab.id !== 'menu' && activeTab === tab.id ? 'active' : ''}`}
            onClick={() => tab.id === 'menu' ? setDrawerOpen(true) : setActiveTab(tab.id)}
          >
            <TabIcon id={tab.id} />
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* ── Page header ── */}
      {activeTab === 'dashboard' && (
        <TripHeader tripName={trip.name} startDate={trip.start_date} endDate={trip.end_date} />
      )}
      {hdr && (
        <div className="page-header">
          <h1>
            {hdr.eyebrow}
            {activeTab === 'scores' && (
              <span
                title={scoreConnStatus === 'connected' ? 'Live' : scoreConnStatus === 'disconnected' ? 'Reconnecting…' : 'Connecting…'}
                style={{
                  display: 'inline-block', width: 7, height: 7, borderRadius: '50%', marginLeft: 4, verticalAlign: 'super',
                  background: scoreConnStatus === 'connected' ? '#2E7D32' : scoreConnStatus === 'disconnected' ? '#C0392B' : '#DDE3EA',
                }}
              />
            )}
          </h1>
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
        {activeTab === 'dashboard'   && <TabHome trip={trip} rounds={rounds} userId={user?.id} displayName={players.find(p => p.user_id === user?.id)?.displayName ?? user?.email?.split('@')[0] ?? 'You'} isCommissioner={isCommissioner} onPurseUpdate={refetchTrip} />}
        {activeTab === 'scores'      && <ScoringTab trip={trip} rounds={rounds} currentUserId={user?.id} isCommissioner={isCommissioner} initialRoundId={scoringInit?.roundId} initialPairingNum={scoringInit?.pairingNum} onConnStatus={setScoreConnStatus} />}
        {activeTab === 'leaderboard' && <TabLeaderboard trip={trip} teams={teams} rounds={rounds} />}
        {activeTab === 'tee-times'   && <TabTeeTimes rounds={rounds} trip={trip} isCommissioner={isCommissioner} onUpdateRound={(id, patch) => setRounds(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r))} />}
      </div>

      {/* Slide-out menu drawer (opened by the MENU tab) */}
      <MenuDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        tripId={trip.id}
        groupId={activeGroup.id}
        groupName={activeGroup.name}
        tripName={trip.name}
        tripStartDate={trip.start_date}
        tripEndDate={trip.end_date}
        inviteToken={trip.invite_token}
        isCommissioner={isCommissioner}
        currentUserId={user?.id}
        handicapAllowance={trip.handicap_allowance ?? 100}
        onTripUpdate={refetchTrip}
        onRoundsChanged={refreshRounds}
        onSignOut={handleSignOut}
      />
    </div>
  )
}
