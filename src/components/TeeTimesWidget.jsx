import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Tee Times card for the dashboard home tab — shows today's tee times if any
// round today is still incomplete, otherwise the next upcoming day's tee times.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// Local-midnight ISO date string for a Date.
function toIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// "Mon, Oct 1" — abbreviated weekday + month + day (no leading zero).
function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d)) return ''
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`
}

const styles = {
  card: {
    background: '#FFFFFF',
    border: '1px solid #DDE3EA',
    borderRadius: '10px',
    padding: 0,
    overflow: 'hidden',
    marginBottom: '10px',
  },
  header: {
    background: '#1B3F6E',
    padding: '10px 14px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    color: '#fff',
    fontSize: '12px',
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '1px',
  },
  headerRight: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: '11px',
    fontWeight: 600,
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    borderBottom: '1px solid #E8EDF3',
  },
  rowLast: {
    borderBottom: 'none',
  },
  course: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#0D1B2A',
  },
  teeTime: {
    fontSize: '18px',
    fontWeight: 800,
    color: '#0D1B2A',
    textAlign: 'right',
  },
}

const BADGE = {
  tournament: {
    label: 'Tournament',
    style: { background: 'rgba(27,63,110,0.06)', color: '#5A7699', border: '1px solid rgba(27,63,110,0.2)' },
  },
  practice: {
    label: 'Practice',
    style: { background: '#E8EDF3', color: '#7A8FA6', border: '1px solid #DDE3EA' },
  },
}

const badgeBase = {
  fontSize: '10px',
  padding: '1px 6px',
  borderRadius: '10px',
  fontWeight: 500,
  marginTop: '3px',
  display: 'inline-block',
}

function Badge({ type }) {
  const cfg = BADGE[type] ?? BADGE.practice
  return <span style={{ ...badgeBase, ...cfg.style }}>{cfg.label}</span>
}

// `rounds` comes from the shared dashboard state so course edits reflect
// instantly; only per-round completeness (scores) is fetched here.
export default function TeeTimesWidget({ rounds = [], tripStartDate, tripEndDate, today }) {
  const [completeMap, setCompleteMap] = useState({})
  const [loaded, setLoaded] = useState(false)

  const roundIdsKey = rounds.map(r => r.id).join(',')
  useEffect(() => {
    let cancelled = false
    async function load() {
      const roundIds = rounds.map(r => r.id)
      if (roundIds.length === 0) { setCompleteMap({}); setLoaded(true); return }
      const { data: scoreData } = await supabase
        .from('scores')
        .select('round_id, hole_number')
        .in('round_id', roundIds)
      if (cancelled) return
      const holes = {}
      ;(scoreData || []).forEach(s => { (holes[s.round_id] ??= new Set()).add(s.hole_number) })
      const map = {}
      roundIds.forEach(id => { map[id] = (holes[id]?.size ?? 0) >= 18 })
      setCompleteMap(map)
      setLoaded(true)
    }
    load()
    return () => { cancelled = true }
  }, [roundIdsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Hide once the trip is over.
  const todayIso = toIso(today)
  if (tripEndDate && todayIso > tripEndDate) return null
  if (!loaded) return null

  // 'none' rounds are placeholders ("not decided yet") — never shown here.
  const teeRounds = rounds.filter(r => r.round_type !== 'none')

  // 1. Today's rounds, if at least one isn't complete yet.
  const todaysRounds = teeRounds.filter(r => r.date === todayIso)
  const todayHasIncomplete = todaysRounds.some(r => !completeMap[r.id])

  let label, dateIso, displayRounds
  if (todaysRounds.length > 0 && todayHasIncomplete) {
    label = "Today's Tee Time"
    dateIso = todayIso
    displayRounds = todaysRounds
  } else {
    // 2. Next future date that has rounds.
    const futureRounds = teeRounds.filter(r => r.date && r.date > todayIso)
    if (futureRounds.length === 0) return null
    const nextDate = futureRounds[0].date
    label = 'Next Tee Time'
    dateIso = nextDate
    displayRounds = teeRounds.filter(r => r.date === nextDate)
  }

  if (displayRounds.length === 0) return null

  // Pluralize.
  const heading = displayRounds.length >= 2 ? `${label}s` : label

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <span style={styles.headerLeft}>{heading}</span>
        <span style={styles.headerRight}>{formatDate(dateIso)}</span>
      </div>
      {displayRounds.map((r, i) => {
        const type = r.round_type === 'practice' ? 'practice' : 'tournament'
        const isLast = i === displayRounds.length - 1
        const times = [r.tee_time_1, r.tee_time_2].filter(Boolean)
        // "{Club Name} - {Course Name}", collapsing to a single name when a
        // field is missing or the two are identical.
        const courseLabel = r.club_name && r.course_name && r.club_name !== r.course_name
          ? `${r.club_name} - ${r.course_name}`
          : (r.club_name || r.course_name)
        return (
          <div key={r.id} style={{ ...styles.row, ...(isLast ? styles.rowLast : null) }}>
            <div>
              <div style={styles.course}>{courseLabel}</div>
              <Badge type={type} />
            </div>
            {times.length > 0
              ? <div style={{ textAlign: 'right' }}>{times.map((t, j) => <div key={j} style={styles.teeTime}>{t}</div>)}</div>
              : <div style={styles.teeTime}>TBD</div>}
          </div>
        )
      })}
    </div>
  )
}
