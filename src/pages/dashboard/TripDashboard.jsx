import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase, uniqueChannelName } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useGroup } from '../../context/GroupContext'
import { getActiveRound, liveMatchTally, liveStandardMatchTally, parseTeeTimeToMinutes, sortRoundsByTee, princeOfWalesComposites } from '../../lib/scoring'
import { teamColor, colorIndexOf, getTeamDisplayName } from '../../lib/teamColors'
import { hasBonusGame } from '../../lib/bonusGames'
import { mealTypeLabel } from '../../lib/meals'
import TripHeader from '../../components/TripHeader'
import CountdownWidget from '../../components/CountdownWidget'
import TeeTimesWidget from '../../components/TeeTimesWidget'
import ChatWidget from '../../components/ChatWidget'
import DailyMVPCard from '../../components/DailyMVPCard'
import TournamentPurseCard from '../../components/TournamentPurseCard'
import GettingStartedCard from '../../components/GettingStartedCard'
import MenuDrawer from '../../components/MenuDrawer'
import ScoringTab from '../../components/ScoringTab'
import StatsTab from '../../components/StatsTab'
import LiveScoreBanner from '../../components/LiveScoreBanner'
import FeedbackButton from '../../components/FeedbackButton'
import { FEATURES } from '../../lib/features'

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
    // Symmetric house centred on x=12 (the previous path was visually lopsided,
    // which made the gap to the Score tab look uneven).
    return <svg {...svg}><path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1z"/><path d="M9.5 21v-7h5v7"/></svg>
  if (id === 'scores')
    return <svg {...svg}><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>
  if (id === 'leaderboard')
    return <svg {...svg}><rect x="2" y="3" width="20" height="13" rx="1"/><line x1="9" y1="3" x2="9" y2="16"/><line x1="16" y1="3" x2="16" y2="16"/><line x1="2" y1="7" x2="22" y2="7"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="2" y1="13" x2="22" y2="13"/><line x1="8" y1="16" x2="8" y2="21"/><line x1="16" y1="16" x2="16" y2="21"/><line x1="5" y1="21" x2="11" y2="21"/><line x1="13" y1="21" x2="19" y2="21"/></svg>
  if (id === 'stats')
    return <svg {...svg}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
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
function wxIcon(code) { return WX_ICONS[code] ?? '-' }
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
  forecastHint: { marginLeft: 'auto', alignSelf: 'center', fontSize: '12px', fontWeight: 700, color: '#1B3F6E' },
  // 10-day forecast modal (portal + centered overlay, matching the app pattern).
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { position: 'relative', background: '#fff', borderRadius: '14px', width: '100%', maxWidth: 400, maxHeight: 'calc(100vh - 40px)', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.25)' },
  modalClose: { position: 'absolute', top: '50%', right: 10, transform: 'translateY(-50%)', width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 15, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
  fRow: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderBottom: '1px solid #E8EDF3' },
  fDay: { fontSize: '13px', fontWeight: 700, color: '#0D1B2A', width: 78, flexShrink: 0 },
  fEmoji: { fontSize: '22px', width: 26, textAlign: 'center', flexShrink: 0 },
  fCond: { fontSize: '12px', color: '#7A8FA6', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  fPop: { fontSize: '12px', color: '#3F6FA6', width: 40, textAlign: 'right', flexShrink: 0 },
  fTemp: { fontSize: '13px', fontWeight: 700, color: '#0D1B2A', width: 74, textAlign: 'right', flexShrink: 0 },
}

const WX_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WX_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtForecastDay(iso, idx) {
  if (idx === 0) return 'Today'
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d)) return iso
  return `${WX_DOW[d.getDay()]}, ${WX_MON[d.getMonth()]} ${d.getDate()}`
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

// Open-Meteo geocoding matches on place NAME only — appending a state
// abbreviation (e.g. "Cathedral City CA") returns zero results. So we query the
// city alone and disambiguate by state, mapping the abbreviation to the full
// name Open-Meteo returns in `admin1` (e.g. "California").
const US_STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia',
}

// Does an Open-Meteo result's admin1 match the course's state (abbreviation or
// full name)?
function stateMatches(admin1, state) {
  if (!admin1 || !state) return false
  const a = admin1.toLowerCase()
  const s = String(state).trim()
  const full = (US_STATES[s.toUpperCase()] || s).toLowerCase()
  return a === full || a === s.toLowerCase()
}

// eslint-disable-next-line no-unused-vars -- tripStartDate/tripEndDate kept in the interface
// `rounds` comes from shared dashboard state; the effect re-runs (and re-fetches
// weather) whenever rounds change — e.g. after a commissioner edits a course.
function WeatherWidget({ rounds = [], tripName }) {
  const [wx, setWx] = useState(null)
  const [status, setStatus] = useState('loading') // 'loading' | 'ok' | 'error'
  const [locationLabel, setLocationLabel] = useState('Weather')
  const [showForecast, setShowForecast] = useState(false) // 10-day forecast modal

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

        // No stored coords → geocode by CITY NAME only (Open-Meteo returns zero
        // results if the state is appended to the name), then disambiguate by
        // state and prefer a US match.
        if (lat == null || lon == null) {
          const city = selected.location_city
          const state = selected.location_state
          if (city) {
            const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=10&language=en&format=json`)
            const geo = await geoRes.json()
            const results = Array.isArray(geo?.results) ? geo.results : []
            const us = results.filter(r => r.country_code === 'US')
            const pool = us.length ? us : results
            const hit = (state && pool.find(r => stateMatches(r.admin1, state))) || pool[0]
            if (hit) { lat = hit.latitude; lon = hit.longitude }
          }
        }

        if (lat == null || lon == null) { if (!cancelled) { setLocationLabel(label); setStatus('error') } return }

        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
          `&current=temperature_2m,weathercode,windspeed_10m,relativehumidity_2m` +
          `&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max` +
          `&temperature_unit=fahrenheit&windspeed_unit=mph&timezone=auto&forecast_days=10`
        )
        const data = await res.json()
        if (cancelled) return
        if (data?.current) {
          const d = data.daily || {}
          const days = (d.time || []).map((date, i) => ({
            date,
            hi: Math.round(d.temperature_2m_max?.[i]),
            lo: Math.round(d.temperature_2m_min?.[i]),
            code: d.weathercode?.[i],
            pop: d.precipitation_probability_max?.[i],
          }))
          setWx({
            temp: Math.round(data.current.temperature_2m),
            code: data.current.weathercode,
            wind: Math.round(data.current.windspeed_10m),
            humidity: data.current.relativehumidity_2m,
            hi: days[0]?.hi,
            lo: days[0]?.lo,
            daily: days, // full 10-day forecast for the tap-through modal
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
            <div style={wxStyles.emoji}>-</div>
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

  const days = wx.daily || []
  return (
    <>
      {/* Current conditions (unchanged) — the whole card taps through to the
          10-day forecast. */}
      <div style={{ ...wxStyles.card, cursor: 'pointer' }} onClick={() => setShowForecast(true)} role="button" tabIndex={0} aria-label="Open 10-day forecast">
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
            {days.length > 1 && <span style={wxStyles.forecastHint}>10-day ›</span>}
          </div>
        </div>
      </div>

      {showForecast && days.length > 0 && createPortal(
        <div style={wxStyles.overlay} role="dialog" aria-modal="true" onClick={() => setShowForecast(false)}>
          <div style={wxStyles.modalCard} onClick={e => e.stopPropagation()}>
            {/* Close button lives inside the header (position: relative) and is
                vertically centred on the same plane as the city label; the right
                padding reserves its space so the label doesn't run under it. */}
            <div style={{ ...wxStyles.header, borderRadius: '14px 14px 0 0', position: 'relative', paddingRight: '44px' }}>
              <span style={wxStyles.headerLeft}><WeatherIcon /> 10-Day Forecast</span>
              <span style={wxStyles.headerRight}>{locationLabel}</span>
              <button style={wxStyles.modalClose} aria-label="Close" onClick={() => setShowForecast(false)}>✕</button>
            </div>
            <div>
              {days.map((day, i) => (
                <div key={day.date} style={{ ...wxStyles.fRow, ...(i === days.length - 1 ? { borderBottom: 'none' } : null) }}>
                  <span style={wxStyles.fDay}>{fmtForecastDay(day.date, i)}</span>
                  <span style={wxStyles.fEmoji}>{wxIcon(day.code)}</span>
                  <span style={wxStyles.fCond}>{wxDesc(day.code)}</span>
                  <span style={wxStyles.fPop}>{day.pop != null ? `${day.pop}%` : ''}</span>
                  <span style={wxStyles.fTemp}>{day.hi}° / {day.lo}°</span>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

// ── Tab: Home ────────────────────────────────────────────────────

function TabHome({ trip, rounds, userId, displayName, isCommissioner, onOpenMenuPage, onNavigateTab }) {
  return (
    <div>
      {/* Getting Started checklist — persistent (live-computed) reminders +
          one-time first-login tips. Self-hides when there's nothing to show. */}
      <GettingStartedCard trip={trip} rounds={rounds} userId={userId} isCommissioner={isCommissioner} onOpenMenuPage={onOpenMenuPage} onNavigateTab={onNavigateTab} />

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

      {/* Chat */}
      <ChatWidget
        tripId={trip.id}
        currentUserId={userId}
        currentUserName={(displayName || '').split(' ')[0] || displayName}
      />

      {/* Weather */}
      <WeatherWidget rounds={rounds} tripName={trip.name} />

      {/* Daily MVPs — below the chat thread. Hidden behind a feature flag until
          stats/analytics are built out; component + data fetch are unchanged. */}
      {FEATURES.dailyMvps && <DailyMVPCard tripId={trip.id} endDate={trip.end_date} />}

      {/* Tournament Purse — self-hides unless the commissioner enabled it. */}
      <TournamentPurseCard tripId={trip.id} endDate={trip.end_date} allowance={trip.handicap_allowance ?? 100} />
    </div>
  )
}

// ── Tab: Leaderboard ─────────────────────────────────────────────

function TabLeaderboard({ trip, teams, rounds }) {
  const powEnabled = hasBonusGame(trip, 'prince_of_wales')
  const [sub, setSub] = useState('tournament') // 'tournament' | 'pow'

  if (!trip.team_mode) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon">🏆</span>
        No tournament set up
      </div>
    )
  }

  // Main tournament standings (the existing view), by format. Standard Match Play:
  // each round is a match worth 1 / 0.5 / 0 per team. Points Match Play (and legacy
  // 'match_play'): running hole-point standings.
  const tournamentView = trip.format === 'standard_match_play'
    ? <StandardLeaderboard trip={trip} teams={teams} rounds={rounds} />
    : <PointsLeaderboard trip={trip} teams={teams} rounds={rounds} />

  // Without the Prince of Wales bonus game there are no tabs — just the tournament.
  if (!powEnabled) return tournamentView

  return (
    <div>
      <div className="gross-net-toggle" role="tablist" aria-label="Leaderboard view" style={{ marginBottom: 12 }}>
        <button role="tab" aria-selected={sub === 'tournament'} className={`gn-btn ${sub === 'tournament' ? 'active' : ''}`} onClick={() => setSub('tournament')}>Tournament</button>
        <button role="tab" aria-selected={sub === 'pow'} className={`gn-btn ${sub === 'pow' ? 'active' : ''}`} onClick={() => setSub('pow')}>Prince of Wales</button>
      </div>
      {sub === 'tournament' ? tournamentView : <PrinceOfWalesLeaderboard trip={trip} teams={teams} rounds={rounds} />}
    </div>
  )
}

// Points Match Play standings: every hole won is worth 1 point (halved holes
// score nothing — no half points), accumulated across all rounds. Live: it
// subscribes to score / pairing / handicap / tee changes so standings update as
// scores are entered (same realtime pattern as LiveScoreBanner).
function PointsLeaderboard({ trip, teams, rounds }) {
  const [pairings, setPairings] = useState([])
  const [pairingPlayers, setPairingPlayers] = useState([])
  const [scoresMap, setScoresMap] = useState({})
  const [hcpByPlayer, setHcpByPlayer] = useState({})
  const [teeRowMap, setTeeRowMap] = useState({})

  const allowance = trip?.handicap_allowance ?? 100
  // Leaderboard shows only counting rounds: exclude 'none' placeholders, practice
  // rounds, and "no scoring" (tee-times-only) rounds.
  const lbRounds = rounds.filter(r => r.round_type !== 'none' && r.round_type !== 'practice' && !r.no_scoring)
  const roundIds = lbRounds.map(r => r.id)
  const roundKey = roundIds.join(',')

  useEffect(() => {
    if (!trip?.id || roundIds.length === 0) return
    let cancelled = false

    async function loadScores() {
      const { data } = await supabase.from('scores')
        .select('round_id, trip_player_id, hole_number, gross_score').in('round_id', roundIds)
      if (cancelled) return
      const m = {}; (data || []).forEach(s => { if (s.gross_score != null) m[`${s.round_id}:${s.trip_player_id}:${s.hole_number}`] = s.gross_score })
      setScoresMap(m)
    }
    async function loadTees() {
      const { data } = await supabase.from('player_rounds')
        .select('trip_player_id, round_id, slope, rating, par').in('round_id', roundIds)
      if (cancelled) return
      const m = {}; (data || []).forEach(pr => { m[`${pr.round_id}:${pr.trip_player_id}`] = pr })
      setTeeRowMap(m)
    }
    async function loadAll() {
      const [pairRes, tpRes] = await Promise.all([
        supabase.from('pairings').select('id, round_id, pairing_number, team1_id, team2_id').in('round_id', roundIds),
        supabase.from('trip_players').select('id, handicap_index').eq('trip_id', trip.id),
      ])
      const pairs = pairRes.data || []
      const pairIds = pairs.map(p => p.id)
      let pp = []
      if (pairIds.length) {
        const { data } = await supabase.from('pairing_players').select('pairing_id, trip_player_id, team_slot').in('pairing_id', pairIds)
        pp = data || []
      }
      if (cancelled) return
      const hcp = {}; (tpRes.data || []).forEach(tp => { hcp[tp.id] = tp.handicap_index })
      setPairings(pairs); setPairingPlayers(pp); setHcpByPlayer(hcp)
      await loadScores(); await loadTees()
    }

    loadAll()

    // Live updates: score change / commissioner tee change / pairing change / HI edit.
    const ch = supabase.channel(uniqueChannelName(`points-lb:${roundKey}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, payload => {
        const rid = payload.new?.round_id ?? payload.old?.round_id
        if (rid && roundIds.includes(rid)) loadScores()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_rounds' }, payload => {
        const rid = payload.new?.round_id ?? payload.old?.round_id
        if (rid && roundIds.includes(rid)) loadTees()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pairing_players' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_players', filter: `trip_id=eq.${trip.id}` }, () => loadAll())
      .subscribe()

    return () => { cancelled = true; supabase.removeChannel(ch) }
  }, [trip?.id, roundKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // roundId -> per-pairing Points Match Play tally (hole-win counts per side).
  const byRound = useMemo(() => {
    const m = new Map()
    for (const r of lbRounds) {
      m.set(r.id, liveMatchTally(r, pairings, pairingPlayers, scoresMap, hcpByPlayer, allowance, teeRowMap))
    }
    return m
  }, [roundKey, pairings, pairingPlayers, scoresMap, hcpByPlayer, teeRowMap, allowance]) // eslint-disable-line react-hooks/exhaustive-deps

  // Attribute each pairing's hole wins to the REAL team on that side
  // (team1_id = slots 1&2, team2_id = slots 3&4), so any team can face any other
  // and a team split across pairings is summed correctly. `scored` only counts
  // pairings this team is in, so an unplayed team still shows '—' per round.
  const roundPointsForTeam = (teamId, roundId) => {
    let pts = 0, scored = 0
    for (const row of (byRound.get(roundId) || [])) {
      if (row.team1_id === teamId) { pts += row.t1pts; scored += row.holesScored }
      else if (row.team2_id === teamId) { pts += row.t2pts; scored += row.holesScored }
    }
    return { pts, scored }
  }
  const totalForTeam = teamId => lbRounds.reduce((a, r) => a + roundPointsForTeam(teamId, r.id).pts, 0)
  const roundCellTeam = (teamId, roundId) => {
    const { pts, scored } = roundPointsForTeam(teamId, roundId)
    return scored === 0 ? '—' : pts
  }

  return (
    <div>
      {teams.map(team => (
        <div key={team.id} className="lb-team-card">
          {/* Colour by stable index (1 navy, 2 teal, 3 brown, 4 purple), never by name. */}
          <div className="lb-team-header" style={{ background: teamColor(colorIndexOf(team)).solid }}>
            <span className="lb-team-name">{getTeamDisplayName(team)}</span>
            <span className="lb-team-pts">{totalForTeam(team.id)}</span>
          </div>
          <div className="lb-rounds">
            {lbRounds.map(r => (
              <div key={r.id} className="lb-round-row">
                <span className="lb-round-name">{r.course_name}</span>
                <span className="lb-round-score">{roundCellTeam(team.id, r.id)}</span>
              </div>
            ))}
            {lbRounds.length === 0 && (
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

// Standard Match Play standings: each completed round is a match worth 1 (win),
// 0.5 (halve) or 0 (loss) to each team; totals accumulate across rounds. Fetches
// its own scores/pairings on mount (the leaderboard tab remounts each time it's
// opened, so this is fresh without a realtime subscription).
function StandardLeaderboard({ trip, teams, rounds }) {
  const [pairings, setPairings] = useState([])
  const [pairingPlayers, setPairingPlayers] = useState([])
  const [scoresMap, setScoresMap] = useState({})
  const [hcpByPlayer, setHcpByPlayer] = useState({})
  const [teeRowMap, setTeeRowMap] = useState({})

  const allowance = trip?.handicap_allowance ?? 100
  // Leaderboard shows only counting rounds: exclude 'none', practice, and
  // "no scoring" (tee-times-only) rounds.
  const lbRounds = rounds.filter(r => r.round_type !== 'none' && r.round_type !== 'practice' && !r.no_scoring)
  const roundIds = lbRounds.map(r => r.id)
  const roundKey = roundIds.join(',')

  useEffect(() => {
    if (!trip?.id || roundIds.length === 0) return
    let cancelled = false
    ;(async () => {
      const [pairRes, tpRes, scoreRes, prRes] = await Promise.all([
        supabase.from('pairings').select('id, round_id, pairing_number, team1_id, team2_id').in('round_id', roundIds),
        supabase.from('trip_players').select('id, handicap_index').eq('trip_id', trip.id),
        supabase.from('scores').select('round_id, trip_player_id, hole_number, gross_score').in('round_id', roundIds),
        supabase.from('player_rounds').select('trip_player_id, round_id, slope, rating, par').in('round_id', roundIds),
      ])
      const pairs = pairRes.data || []
      const pairIds = pairs.map(p => p.id)
      let pp = []
      if (pairIds.length) {
        const { data } = await supabase.from('pairing_players').select('pairing_id, trip_player_id, team_slot').in('pairing_id', pairIds)
        pp = data || []
      }
      if (cancelled) return
      const hcp = {}; (tpRes.data || []).forEach(tp => { hcp[tp.id] = tp.handicap_index })
      const sMap = {}; (scoreRes.data || []).forEach(s => { if (s.gross_score != null) sMap[`${s.round_id}:${s.trip_player_id}:${s.hole_number}`] = s.gross_score })
      const tMap = {}; (prRes.data || []).forEach(pr => { tMap[`${pr.round_id}:${pr.trip_player_id}`] = pr })
      setPairings(pairs); setPairingPlayers(pp); setHcpByPlayer(hcp); setScoresMap(sMap); setTeeRowMap(tMap)
    })()
    return () => { cancelled = true }
  }, [trip?.id, roundKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // roundId -> per-pairing Standard Match Play results.
  const byRound = useMemo(() => {
    const m = new Map()
    for (const r of lbRounds) {
      m.set(r.id, liveStandardMatchTally(r, pairings, pairingPlayers, scoresMap, hcpByPlayer, allowance, teeRowMap))
    }
    return m
  }, [roundKey, pairings, pairingPlayers, scoresMap, hcpByPlayer, teeRowMap, allowance]) // eslint-disable-line react-hooks/exhaustive-deps

  const fmtPts = x => (Number.isInteger(x) ? String(x) : x.toFixed(1))

  // Attribute each pairing's match result to the REAL team on that side
  // (team1_id -> 'T1', team2_id -> 'T2'). `matches` only counts pairings this
  // team is in, so a team in exactly one match shows W/H/L while a team split
  // across two matches in a round shows its summed points.
  const roundPointsForTeam = (teamId, roundId) => {
    let pts = 0, matches = 0, completed = 0
    for (const row of (byRound.get(roundId) || [])) {
      if (!row.hasMatch) continue
      const side = row.team1_id === teamId ? 'T1' : row.team2_id === teamId ? 'T2' : null
      if (!side) continue
      matches++
      if (!row.complete) continue
      completed++
      if (row.result === side) pts += 1
      else if (row.result === 'halve') pts += 0.5
    }
    return { pts, matches, completed }
  }
  const totalForTeam = teamId => lbRounds.reduce((a, r) => a + roundPointsForTeam(teamId, r.id).pts, 0)
  const roundBadge = (teamId, roundId) => {
    const { pts, matches, completed } = roundPointsForTeam(teamId, roundId)
    if (matches === 0 || completed === 0) return '—'
    if (matches === 1) return pts === 1 ? 'W' : pts === 0.5 ? 'H' : 'L'
    return fmtPts(pts) // multiple matches in one round → show the earned points
  }

  return (
    <div>
      {teams.map(team => (
        <div key={team.id} className="lb-team-card">
          <div className="lb-team-header" style={{ background: teamColor(colorIndexOf(team)).solid }}>
            <span className="lb-team-name">{getTeamDisplayName(team)}</span>
            <span className="lb-team-pts">{fmtPts(totalForTeam(team.id))}</span>
          </div>
          <div className="lb-rounds">
            {lbRounds.map(r => (
              <div key={r.id} className="lb-round-row">
                <span className="lb-round-name">{r.course_name}</span>
                <span className="lb-round-score">{roundBadge(team.id, r.id)}</span>
              </div>
            ))}
            {lbRounds.length === 0 && (
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

// ── Prince of Wales (bonus game) ─────────────────────────────────
// Per-team composite scorecard: for each hole slot 1..18, the lowest score any
// teammate posted in that slot across all tournament rounds. Gross + net composites
// are computed live from the same score/tee/handicap data the leaderboard uses; a
// Gross/Net toggle (default Net) switches the display. No winner/leader UI mid-trip.
const powCard = {
  card: { borderRadius: 10, overflow: 'hidden', marginBottom: 10, border: '1px solid #DDE3EA' },
  header: { padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: 800, color: '#fff' },
  total: { fontSize: 28, fontWeight: 900, color: '#fff' },
  body: { background: '#fff', padding: '10px 12px' },
  divider: { height: 1, background: '#E8EDF3', margin: '8px 0' },
}

function PowHoleGrid({ cells, start }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 2 }}>
      {cells.map((v, i) => (
        <div key={i} style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: '#7A8FA6', fontWeight: 700 }}>{start + i}</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: v == null ? '#C4CEDA' : '#0D1B2A' }}>{v == null ? '·' : v}</div>
        </div>
      ))}
    </div>
  )
}

function PrinceOfWalesLeaderboard({ trip, teams, rounds }) {
  const [scoresMap, setScoresMap] = useState({})
  const [teeRowMap, setTeeRowMap] = useState({})
  const [playersByTeam, setPlayersByTeam] = useState({})
  const [hcpByPlayer, setHcpByPlayer] = useState({})
  const [mode, setMode] = useState('net') // Gross/Net toggle — defaults to Net

  const allowance = trip?.handicap_allowance ?? 100
  // Same filter the tournament leaderboard uses: tournament rounds only (exclude
  // 'none' placeholders, practice rounds, and tee-times-only rounds).
  const powRounds = rounds.filter(r => r.round_type !== 'none' && r.round_type !== 'practice' && !r.no_scoring)
  const roundIds = powRounds.map(r => r.id)
  const roundKey = roundIds.join(',')

  useEffect(() => {
    if (!trip?.id) return
    let cancelled = false

    async function loadScores() {
      if (!roundIds.length) { setScoresMap({}); return }
      const { data } = await supabase.from('scores')
        .select('round_id, trip_player_id, hole_number, gross_score').in('round_id', roundIds)
      if (cancelled) return
      const m = {}; (data || []).forEach(s => { if (s.gross_score != null) m[`${s.round_id}:${s.trip_player_id}:${s.hole_number}`] = s.gross_score })
      setScoresMap(m)
    }
    async function loadTees() {
      if (!roundIds.length) { setTeeRowMap({}); return }
      const { data } = await supabase.from('player_rounds')
        .select('trip_player_id, round_id, slope, rating, par').in('round_id', roundIds)
      if (cancelled) return
      const m = {}; (data || []).forEach(pr => { m[`${pr.round_id}:${pr.trip_player_id}`] = pr })
      setTeeRowMap(m)
    }
    async function loadPlayers() {
      const { data } = await supabase.from('trip_players').select('id, team_id, handicap_index').eq('trip_id', trip.id)
      if (cancelled) return
      const byTeam = {}; const hcp = {}
      ;(data || []).forEach(tp => { hcp[tp.id] = tp.handicap_index; if (tp.team_id) (byTeam[tp.team_id] ??= []).push(tp.id) })
      setPlayersByTeam(byTeam); setHcpByPlayer(hcp)
    }

    loadPlayers(); loadScores(); loadTees()

    // Live: recompute as scores are entered/edited, tees change, or players move teams.
    const ch = supabase.channel(uniqueChannelName(`pow-lb:${roundKey}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, payload => {
        const rid = payload.new?.round_id ?? payload.old?.round_id
        if (rid && roundIds.includes(rid)) loadScores()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_rounds' }, payload => {
        const rid = payload.new?.round_id ?? payload.old?.round_id
        if (rid && roundIds.includes(rid)) loadTees()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_players', filter: `trip_id=eq.${trip.id}` }, () => loadPlayers())
      .subscribe()

    return () => { cancelled = true; supabase.removeChannel(ch) }
  }, [trip?.id, roundKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const composites = useMemo(
    () => princeOfWalesComposites({ rounds: powRounds, teams, playersByTeam, scoresMap, teeRowMap, hcpByPlayer }, allowance),
    [roundKey, teams, playersByTeam, scoresMap, teeRowMap, hcpByPlayer, allowance] // eslint-disable-line react-hooks/exhaustive-deps
  )

  // Persist the latest composite per team for later reference (archives). Best-
  // effort only — the live display never reads it back, and a failure (e.g. the
  // migration not yet applied) is swallowed. Skips writes when nothing changed.
  const persistedRef = useRef('')
  useEffect(() => {
    if (!trip?.id || teams.length === 0) return
    const rows = teams.map(t => {
      const c = composites.get(t.id) || { gross: [], net: [], grossTotal: 0, netTotal: 0 }
      return { trip_id: trip.id, team_id: t.id, gross: c.gross, net: c.net, gross_total: c.grossTotal, net_total: c.netTotal }
    })
    const sig = JSON.stringify(rows)
    if (sig === persistedRef.current) return
    persistedRef.current = sig
    supabase.from('prince_of_wales_composites').upsert(rows, { onConflict: 'trip_id,team_id' }).then(() => {}, () => {})
  }, [composites, teams, trip?.id])

  return (
    <div>
      <div className="gross-net-toggle" role="tablist" aria-label="Gross or net composite">
        <button role="tab" aria-selected={mode === 'gross'} className={`gn-btn ${mode === 'gross' ? 'active' : ''}`} onClick={() => setMode('gross')}>Gross</button>
        <button role="tab" aria-selected={mode === 'net'} className={`gn-btn ${mode === 'net' ? 'active' : ''}`} onClick={() => setMode('net')}>Net</button>
      </div>

      {teams.length === 0 && (
        <div className="empty-state"><span className="empty-state-icon">👑</span>No teams yet</div>
      )}

      {teams.map(team => {
        const c = composites.get(team.id) || { gross: Array(18).fill(null), net: Array(18).fill(null), grossTotal: 0, netTotal: 0, anyScored: false }
        const cells = mode === 'net' ? c.net : c.gross
        const total = mode === 'net' ? c.netTotal : c.grossTotal
        return (
          <div key={team.id} style={powCard.card}>
            {/* Colour by stable team index, never by name — same as the tournament cards. */}
            <div style={{ ...powCard.header, background: teamColor(colorIndexOf(team)).solid }}>
              <span style={powCard.name}>{getTeamDisplayName(team)}</span>
              <span style={powCard.total}>{c.anyScored ? total : '—'}</span>
            </div>
            <div style={powCard.body}>
              <PowHoleGrid cells={cells.slice(0, 9)} start={1} />
              <div style={powCard.divider} />
              <PowHoleGrid cells={cells.slice(9, 18)} start={10} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Tab: Tee Times ───────────────────────────────────────────────

const TEE_HOURS = Array.from({ length: 12 }, (_, i) => i + 1)      // 1..12
const TEE_MINUTES = Array.from({ length: 60 }, (_, i) => i)        // 0,1,...,59 (every minute)

// Parse a stored display time ("7:45 AM") into picker parts; default 8:00 AM.
function parseDisplayTime(disp) {
  const m = (disp || '').match(/(\d+):(\d+)\s*(AM|PM)/i)
  if (!m) return { h: 8, m: 0, ap: 'AM' }
  return { h: Number(m[1]), m: Number(m[2]), ap: m[3].toUpperCase() }
}

// Custom time-picker popover styles — navy/white, card-style, no native control.
const tp = {
  // Rendered via a portal to document.body and fixed-centred so the parent card's
  // overflow:hidden (.tee-group) can't clip it.
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, touchAction: 'none' },
  popover: { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 1000, background: '#fff', border: '1px solid #DDE3EA', borderRadius: 12, boxShadow: '0 8px 28px rgba(13,27,42,0.18)', padding: 16, width: 240 },
  cols: { display: 'flex', gap: 8 },
  colWrap: { flex: 1, minWidth: 0 },
  colLabel: { fontSize: 9, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: '#7A8FA6', textAlign: 'center', marginBottom: 4 },
  // overscrollBehavior:contain + touchAction:pan-y keep touch scrolling inside the
  // list instead of chaining to the page behind the popover.
  list: { height: 150, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', touchAction: 'pan-y', display: 'flex', flexDirection: 'column', gap: 2, padding: 3, background: '#F5F8FA', borderRadius: 8 },
  item: { padding: '7px 0', fontSize: 14, fontWeight: 600, color: '#2C3E50', background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 },
  itemActive: { background: '#1B3F6E', color: '#fff', fontWeight: 800 },
  apCol: { display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' },
  ap: { padding: '8px 12px', fontSize: 13, fontWeight: 700, color: '#7A8FA6', background: '#E8EDF3', border: '1px solid #DDE3EA', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' },
  apActive: { background: '#1B3F6E', color: '#fff', border: '1px solid #1B3F6E' },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  cancel: { background: 'none', border: 'none', color: '#7A8FA6', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: '6px 4px' },
  confirm: { width: 38, height: 38, borderRadius: '50%', background: '#1B3F6E', color: '#fff', border: 'none', fontSize: 18, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' },
}

// Tee-time cell: TBD placeholder or formatted time + Clear. Tapping opens a custom
// popover time picker (hour / minute / AM-PM) with a ✓ to confirm — no native control.
function TimeCell({ round, slot, isCommissioner, onSave }) {
  const col = `tee_time_${slot}` // slot 1..5 → tee_time_1..tee_time_5
  const value = round[col]
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(() => parseDisplayTime(value))
  const hourListRef = useRef(null)
  const minListRef = useRef(null)

  // Lock the page (which scrolls the window/body — there's no inner scroll
  // container) while the picker is open, so dragging the hour/minute lists scrolls
  // THEM, not the page behind the fixed popover. iOS-safe: pin the body with
  // position:fixed and restore the scroll offset on close.
  useEffect(() => {
    if (!open) return
    const scrollY = window.scrollY
    const b = document.body
    const prev = { position: b.style.position, top: b.style.top, left: b.style.left, right: b.style.right, width: b.style.width, overflow: b.style.overflow }
    b.style.position = 'fixed'
    b.style.top = `-${scrollY}px`
    b.style.left = '0'
    b.style.right = '0'
    b.style.width = '100%'
    b.style.overflow = 'hidden'
    return () => {
      b.style.position = prev.position
      b.style.top = prev.top
      b.style.left = prev.left
      b.style.right = prev.right
      b.style.width = prev.width
      b.style.overflow = prev.overflow
      window.scrollTo(0, scrollY)
    }
  }, [open])

  // When the picker opens, scroll the currently-selected hour and minute into the
  // centre of their (fixed-height, scrollable) columns. Without this, editing an
  // already-set time opens the lists at the top — the saved value is highlighted
  // but off-screen, so it looks blank/reset (esp. with 60 minute rows).
  useLayoutEffect(() => {
    if (!open) return
    for (const listRef of [hourListRef, minListRef]) {
      const list = listRef.current
      if (!list) continue
      const active = list.querySelector('[data-active="true"]')
      if (active) list.scrollTop = active.offsetTop - list.clientHeight / 2 + active.offsetHeight / 2
    }
  }, [open])

  function openPicker() {
    setDraft(parseDisplayTime(value))
    setOpen(true)
  }
  function confirm() {
    onSave(round.id, col, `${draft.h}:${String(draft.m).padStart(2, '0')} ${draft.ap}`)
    setOpen(false)
  }

  if (!isCommissioner) {
    return value
      ? <span style={{ fontSize: 17, fontWeight: 800, color: '#1B3F6E' }}>{value}</span>
      : <span style={{ fontSize: 13, fontWeight: 600, color: '#7A8FA6' }}>TBD</span>
  }

  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {value ? (
        <>
          <button onClick={openPicker} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 17, fontWeight: 800, color: '#1B3F6E' }}>{value}</button>
          <button onClick={() => onSave(round.id, col, null)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, color: '#7A8FA6' }}>Clear</button>
        </>
      ) : (
        <button onClick={openPicker} style={{ background: '#fff', border: '1px solid #1B3F6E', color: '#1B3F6E', padding: '4px 12px', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700 }}>TBD</button>
      )}

      {open && createPortal(
        <>
          {/* Tap outside to cancel. */}
          <div onClick={() => setOpen(false)} style={tp.backdrop} />
          <div style={tp.popover} role="dialog" aria-label="Pick tee time">
            <div style={tp.cols}>
              <div style={tp.colWrap}>
                <div style={tp.colLabel}>Hour</div>
                <div ref={hourListRef} style={tp.list}>
                  {TEE_HOURS.map(h => (
                    <button key={h} data-active={draft.h === h ? 'true' : undefined} onClick={() => setDraft(d => ({ ...d, h }))}
                      style={{ ...tp.item, ...(draft.h === h ? tp.itemActive : null) }}>{h}</button>
                  ))}
                </div>
              </div>
              <div style={tp.colWrap}>
                <div style={tp.colLabel}>Min</div>
                <div ref={minListRef} style={tp.list}>
                  {TEE_MINUTES.map(m => (
                    <button key={m} data-active={draft.m === m ? 'true' : undefined} onClick={() => setDraft(d => ({ ...d, m }))}
                      style={{ ...tp.item, ...(draft.m === m ? tp.itemActive : null) }}>{String(m).padStart(2, '0')}</button>
                  ))}
                </div>
              </div>
              <div style={tp.apCol}>
                {['AM', 'PM'].map(ap => (
                  <button key={ap} onClick={() => setDraft(d => ({ ...d, ap }))}
                    style={{ ...tp.ap, ...(draft.ap === ap ? tp.apActive : null) }}>{ap}</button>
                ))}
              </div>
            </div>
            <div style={tp.footer}>
              <button onClick={() => setOpen(false)} style={tp.cancel}>Cancel</button>
              <button onClick={confirm} style={tp.confirm} aria-label="Confirm time">✓</button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </span>
  )
}

// Tee Times meal row — plain, indented, secondary to the tee-time card above:
// "restaurant · type" muted on the left, muted time on the right. No card, no tag.
function MealTeeRow({ meal }) {
  const name = (meal.location || '').trim() || mealTypeLabel(meal)
  const type = mealTypeLabel(meal)
  const label = type && name !== type ? `${name} · ${type}` : name
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '4px 14px 4px 26px' }}>
      <span style={{ fontSize: 12, color: '#7A8FA6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontSize: 12, color: '#7A8FA6', flexShrink: 0 }}>{meal.meal_time || ''}</span>
    </div>
  )
}

const teeRoundCardStyle = { background: 'var(--bg2)', border: '1px solid var(--bg3)', borderRadius: 10, margin: '10px 12px', overflow: 'hidden' }
const teeRoundHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '10px 12px', borderBottom: '1px solid var(--bg3)' }
const teePairingLabelStyle = { fontSize: 13, fontWeight: 600, color: '#2C3E50' }
const teeTodayBadgeStyle = { fontSize: 10, fontWeight: 800, letterSpacing: '0.5px', color: 'var(--navy)', background: '#fff', borderRadius: 10, padding: '1px 8px' }

function TabTeeTimes({ rounds, meals = [], trip, isCommissioner, onUpdateRound, playerCount = 0 }) {
  // One tee-time row per pairing — a pairing is a 2v2 foursome, so pairings
  // scale by GROUPS of 4 (1-4 players → 1, 5-8 → 2, …), matching the count
  // ScoringTab shows. Bounded at 5 (the 20-player max ⇒ 5 pairings; storage is
  // tee_time_1…tee_time_5).
  const numPairings = Math.min(5, Math.max(1, Math.ceil(playerCount / 4)))
  // 'none' rounds are placeholders ("not decided yet") — not shown in tee times.
  const teeRounds = rounds.filter(r => r.round_type !== 'none')

  // Days = union of golf-round days and meal days (lodging is deliberately NOT
  // shown here — a stay isn't a "be here at time X" event).
  const dayMap = {} // date -> { rounds: [], meals: [] }
  teeRounds.forEach(r => { (dayMap[r.date] ??= { rounds: [], meals: [] }).rounds.push(r) })
  meals.forEach(m => { if (m.day) (dayMap[m.day] ??= { rounds: [], meals: [] }).meals.push(m) })
  const days = Object.keys(dayMap).filter(Boolean).sort()

  if (days.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon">⏰</span>
        No rounds scheduled.
      </div>
    )
  }

  async function saveTeeTime(roundId, col, display) {
    await supabase.from('rounds').update({ [col]: display }).eq('id', roundId)
    onUpdateRound(roundId, { [col]: display })
  }

  const teeMinutes = t => (t ? parseTeeTimeToMinutes(t) : Infinity) // unset → bottom
  // Local "today" — recomputed each render so past/today flips at midnight.
  const now = new Date()
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  return (
    <div>
      {days.map(date => {
        const { rounds: dayRounds, meals: dayMeals } = dayMap[date]
        const sortedMeals = [...dayMeals].sort((a, b) => teeMinutes(a.meal_time) - teeMinutes(b.meal_time))
        const isPast = date < todayIso
        const isToday = date === todayIso
        return (
          // Past days render as one dimmed, non-interactive unit.
          <div key={date} className="tee-group" style={isPast ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
            <div className="tee-group-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{fmtDayHeader(date)}</span>
              {isToday && <span style={teeTodayBadgeStyle}>Today</span>}
            </div>
            <div style={{ background: 'var(--bg1)', padding: '2px 0 6px' }}>
              {dayRounds.map(r => {
                const isTournament = r.round_type !== 'practice'
                const primary = r.club_name || r.course_name
                const secondary = (r.club_name && r.course_name && r.course_name !== r.club_name) ? r.course_name : null
                return (
                  // Each round is one light-gray card that grows a row per pairing.
                  <div key={r.id} style={teeRoundCardStyle}>
                    <div style={teeRoundHeaderStyle}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#0D1B2A' }}>{primary}</div>
                        {secondary && <div style={{ fontSize: 12, color: '#7A8FA6', marginTop: 1 }}>{secondary}</div>}
                      </div>
                      <span className={`type-pill ${isTournament ? 'tournament' : 'practice'}`}>
                        {isTournament ? 'Tournament' : 'Practice'}
                      </span>
                    </div>
                    {Array.from({ length: numPairings }, (_, i) => i + 1).map((slot, idx) => (
                      <div key={slot} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', borderTop: idx === 0 ? 'none' : '1px solid var(--bg3)' }}>
                        <span style={teePairingLabelStyle}>Pairing {slot}</span>
                        <TimeCell round={r} slot={slot} isCommissioner={isCommissioner} onSave={saveTeeTime} />
                      </div>
                    ))}
                  </div>
                )
              })}
              {/* Meals for the day — below the round card(s), plain & secondary. */}
              {sortedMeals.length > 0 && (
                <div style={{ padding: '2px 0' }}>
                  {sortedMeals.map(m => <MealTeeRow key={m.id} meal={m} />)}
                </div>
              )}
            </div>
          </div>
        )
      })}
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
  { id: 'stats',       label: 'Stats'       },
  { id: 'tee-times',   label: 'Tee Times'   },
  { id: 'menu',        label: 'Menu'        },
]

export default function TripDashboard() {
  const { user } = useAuth()
  const { activeTrip, activeGroup, tripsLoaded } = useGroup()
  const navigate = useNavigate()
  const location = useLocation()

  const [activeTab, setActiveTab] = useState('dashboard')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerPage, setDrawerPage] = useState(null) // deep-link target when opening the drawer
  const openMenuPage = (pageId) => { setDrawerPage(pageId); setDrawerOpen(true) }
  const [showTripBanner, setShowTripBanner] = useState(location.state?.singleTripWarning ?? false)
  const [trip, setTrip] = useState(null)
  const [rounds, setRounds] = useState([])
  const [meals, setMeals] = useState([]) // trip meals, woven into the Tee Times list
  const [players, setPlayers] = useState([])
  const [teams, setTeams] = useState([])
  const [isCommissioner, setIsCommissioner] = useState(false)
  const [scoringInit, setScoringInit] = useState(null) // { roundId, pairingNum } — active round to auto-open
  const [scoreConnStatus, setScoreConnStatus] = useState('connecting') // realtime status from ScoringTab
  const autoNavedRef = React.useRef(false)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)

  useEffect(() => {
    // Wait until the trip list has loaded; if there is genuinely no trip to show,
    // route to /groups (which forwards to the wizard when the user has none).
    if (!activeTrip) {
      if (tripsLoaded) navigate('/groups', { replace: true })
      return
    }
    fetchAll()
  }, [activeTrip?.id, tripsLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

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
      // Load the selected trip by id (fresh copy — allowance/format may have changed).
      const { data: tripData, error: tripErr } = await supabase
        .from('trips').select('*').eq('id', activeTrip.id).maybeSingle()
      if (tripErr) throw tripErr
      if (!tripData) { setLoading(false); return }
      setTrip(tripData)

      const [roundsRes, playersRes, teamsRes, memberRes, mealsRes] = await Promise.all([
        // Calendar order (date asc); round_number only breaks ties within a day.
        supabase.from('rounds').select('*').eq('trip_id', tripData.id).order('date').order('round_number'),
        supabase.from('trip_players').select('id, user_id, guest_name, handicap_index').eq('trip_id', tripData.id),
        supabase.from('teams').select('*').eq('trip_id', tripData.id).order('team_index'),
        user?.id
          ? supabase.from('group_members').select('role').eq('group_id', tripData.group_id).eq('user_id', user.id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('meals').select('*').eq('trip_id', tripData.id).order('day'),
      ])
      if (roundsRes.error) throw roundsRes.error
      setIsCommissioner(memberRes.data?.role === 'admin')
      setMeals(mealsRes.data || [])

      const rawPlayers = playersRes.data || []
      const userIds = rawPlayers.map(p => p.user_id).filter(Boolean)
      let profileMap = {}
      if (userIds.length > 0) {
        const { data: profileRows } = await supabase.from('profiles').select('id, display_name').in('id', userIds)
        if (profileRows) profileRows.forEach(pr => { profileMap[pr.id] = pr.display_name })
      }

      const roundList = sortRoundsByTee(roundsRes.data || [])
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

    // The user's OWN pairing for the active round — resolved from their
    // trip_player, never defaulted silently. Reused for the tee-time lookup, the
    // scores check, and the landing pairing (scoringInit).
    const myTp = rawPlayers.find(p => p.user_id === user?.id)?.id
    const myPairingId = myTp
      ? pp.find(x => x.trip_player_id === myTp && roundOfPairing[x.pairing_id] === active.id)?.pairing_id
      : null
    const pairingNum = pairings.find(p => p.id === myPairingId)?.pairing_number || 1
    setScoringInit({ roundId: active.id, pairingNum })

    // Auto-open Score if EITHER condition holds (else stay on Home):
    //   1. TIME — we're ≥5 min past the user's own scheduled tee time (pairing N
    //      tees off at tee_time_N, falling back to tee_time_1).
    //   2. DATA — the user's OWN pairing has already entered at least one score,
    //      even if the time window hasn't opened / a tee time isn't set. Scoped
    //      to their pairing so another group teeing off first doesn't pull in a
    //      user whose own group hasn't started. Reuses holesByRoundPlayer (built
    //      above from the scores query) — no extra query.
    const teeStr = active[`tee_time_${pairingNum}`] || active.tee_time_1
    const teeMinutes = parseTeeTimeToMinutes(teeStr)
    const now = new Date()
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    const pastTeeThreshold = teeMinutes > 0 && nowMinutes >= teeMinutes + 5

    const myPairPlayers = myPairingId ? pp.filter(x => x.pairing_id === myPairingId).map(x => x.trip_player_id) : []
    const myPairingHasScores = myPairPlayers.some(tp => (holesByRoundPlayer[`${active.id}:${tp}`]?.size ?? 0) > 0)

    if ((pastTeeThreshold || myPairingHasScores) && !autoNavedRef.current) {
      autoNavedRef.current = true
      setActiveTab('scores')
    }
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
    // Calendar order (date asc); round_number only breaks ties within a day.
    const { data } = await supabase.from('rounds').select('*').eq('trip_id', trip.id).order('date').order('round_number')
    if (data) setRounds(sortRoundsByTee(data))
    // Meals change via the Schedule page's onRoundsChanged too — keep Tee Times fresh.
    const { data: mealData } = await supabase.from('meals').select('*').eq('trip_id', trip.id).order('day')
    if (mealData) setMeals(mealData)
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
    stats:       { eyebrow: 'Trip Stats',    title: trip.name },
    'tee-times': { eyebrow: 'Tee Times',     title: trip.name },
    menu:        null,
  }
  const hdr = headers[activeTab]

  // Read-only mode: a trip whose end date is in the past. Editing is disabled
  // everywhere and commissioner tools are hidden (users are viewing history).
  const now = new Date()
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const readOnly = !!(trip.end_date && trip.end_date < todayIso)
  const canManage = isCommissioner && !readOnly

  return (
    <div className="dashboard-page">
      {/* ── Tab bar — sticky top ── */}
      <nav className="tab-bar">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn ${tab.id !== 'menu' && activeTab === tab.id ? 'active' : ''}`}
            onClick={() => tab.id === 'menu' ? openMenuPage(null) : setActiveTab(tab.id)}
          >
            <TabIcon id={tab.id} />
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Internal scroll region (headers + tab content). The page shell itself is
          fixed-height/overflow:hidden so the fixed bottom tab bar never drifts. */}
      <div className="dashboard-scroll">
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

      {/* ── Past-trip read-only indicator ── */}
      {readOnly && (
        <div className="readonly-banner">Past Trip — Read Only</div>
      )}

      {/* ── Tab content ── (keyed by trip so switching trips remounts everything;
          keys must be UNIQUE among siblings — see the banner/drawer below) */}
      <div className="dashboard-content" key={`content-${trip.id}`}>
        {activeTab === 'dashboard'   && <TabHome trip={trip} rounds={rounds} userId={user?.id} displayName={players.find(p => p.user_id === user?.id)?.displayName ?? user?.email?.split('@')[0] ?? 'You'} isCommissioner={canManage} onOpenMenuPage={openMenuPage} onNavigateTab={setActiveTab} />}
        {activeTab === 'scores'      && <ScoringTab trip={trip} rounds={rounds} currentUserId={user?.id} isCommissioner={isCommissioner} readOnly={readOnly} initialRoundId={scoringInit?.roundId} initialPairingNum={scoringInit?.pairingNum} onConnStatus={setScoreConnStatus} onOpenMenuPage={openMenuPage} />}
        {activeTab === 'leaderboard' && <TabLeaderboard trip={trip} teams={teams} rounds={rounds} />}
        {activeTab === 'stats'       && <StatsTab trip={trip} rounds={rounds} isCommissioner={canManage} currentUserId={user?.id} />}
        {activeTab === 'tee-times'   && <TabTeeTimes rounds={rounds} meals={meals} trip={trip} isCommissioner={canManage} playerCount={players.length} onUpdateRound={(id, patch) => setRounds(rs => sortRoundsByTee(rs.map(r => r.id === id ? { ...r, ...patch } : r)))} />}
      </div>
      </div>

      {/* Floating live-score banner — mounted once here so it persists across tabs */}
      <LiveScoreBanner key={`banner-${trip.id}`} trip={trip} rounds={rounds} teams={teams} />

      {/* Persistent feedback FAB — visible on every tab, floats above the tab bar
          and (when shown) the live-score banner. */}
      <FeedbackButton tripId={trip.id} userId={user?.id} />

      {/* Slide-out menu drawer (opened by the MENU tab) */}
      <MenuDrawer
        key={`drawer-${trip.id}`}
        open={drawerOpen}
        initialPage={drawerPage}
        onClose={() => { setDrawerOpen(false); setDrawerPage(null) }}
        tripId={trip.id}
        groupId={trip.group_id}
        groupName={activeGroup?.name ?? ''}
        tripName={trip.name}
        tripStartDate={trip.start_date}
        tripEndDate={trip.end_date}
        inviteToken={trip.invite_token}
        isCommissioner={canManage}
        readOnly={readOnly}
        currentUserId={user?.id}
        handicapAllowance={trip.handicap_allowance ?? 100}
        tournamentFormat={trip.format}
        bonusGames={trip.bonus_games}
        purseAmount={trip.purse_amount}
        showPurseOnHome={trip.show_purse_on_home}
        onTripUpdate={refetchTrip}
        onRoundsChanged={refreshRounds}
      />
    </div>
  )
}
