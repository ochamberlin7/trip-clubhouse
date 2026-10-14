// CTI Clubhouse Home banner.
//  - Pre-trip  : the day countdown (unchanged copy).
//  - Post-trip : the thank-you message (unchanged copy).
//  - In-trip   : the day strip — which day of the trip it is + where you're playing.
// Facts come from getTripPhase (dayNumber / totalDays / todaysRounds / phase), fed the
// trip's time zone exactly like the routing code, so an out-of-zone viewer sees the
// trip's day. This is the Home banner only — the live-score banner is a separate
// component and is untouched.

import { getTripPhase, homeBannerModel, bannerGridColumns } from '../lib/scoring'

// Parse an ISO date string to a local-midnight Date (date-level, ignores time).
function parseDate(iso) {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00')
  return isNaN(d) ? null : d
}

// Whole days from today (local midnight) until a start date; 0 when past/invalid.
function daysUntil(startIso) {
  const start = parseDate(startIso)
  if (!start) return 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.max(0, Math.ceil((start - today) / 86400000))
}

const styles = {
  container: {
    background: '#1B3F6E',
    borderRadius: '20px',
    boxShadow: '0 18px 32px -12px rgba(15,30,51,.42), 0 4px 10px rgba(15,30,51,.18)',
    padding: '16px',
    marginBottom: '14px',
  },
  // Pre-trip countdown + post-trip message keep their original centered styling.
  centered: { textAlign: 'center' },
  number: { fontSize: '44px', fontWeight: 700, color: '#fff', lineHeight: 1 },
  label: { fontSize: '12px', color: '#C7D6EA', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '6px', fontWeight: 600 },
  message: { fontSize: '17px', color: '#fff', fontWeight: 700, lineHeight: 1.4 },

  // Day-strip layout.
  welcome: { fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.14em', color: '#C9D6E8', fontWeight: 600, marginBottom: '12px' },
  strip: { display: 'grid', gap: '8px', marginBottom: '14px' },
  dotCell: { display: 'flex', justifyContent: 'center' },
  dotBase: { width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', boxSizing: 'border-box' },
  dotToday: { background: '#E7EDF5', color: '#1B3F6E', fontWeight: 800 },
  dotPast: { background: 'rgba(255,255,255,0.18)', color: '#DCE5F1', fontWeight: 700 },
  dotFuture: { border: '1px solid rgba(255,255,255,0.4)', color: '#C9D6E8', fontWeight: 700 },
  title: { fontSize: '20px', fontWeight: 700, color: '#fff', lineHeight: 1.2 },
  courseLine: { fontSize: '15px', color: '#DCE5F1', marginTop: '3px', lineHeight: 1.3 },
}

function dotStyle(state) {
  return { ...styles.dotBase, ...(state === 'today' ? styles.dotToday : state === 'past' ? styles.dotPast : styles.dotFuture) }
}

export default function CountdownWidget({ trip, rounds = [] }) {
  const tripName = trip?.name
  const phase = getTripPhase({ trip, rounds, now: new Date(), timeZone: trip?.time_zone ?? undefined })

  // Pre-trip: keep the existing countdown copy.
  if (phase.phase === 'before-trip') {
    const days = daysUntil(trip?.start_date)
    return (
      <div style={{ ...styles.container, ...styles.centered }}>
        <div style={styles.number}>{days}</div>
        <div style={styles.label}>{days === 1 ? 'day until trip' : 'days until trip'}</div>
      </div>
    )
  }

  // Post-trip: keep the existing copy.
  if (phase.phase === 'after-trip') {
    return (
      <div style={{ ...styles.container, ...styles.centered }}>
        <div style={styles.message}>Thanks for an amazing trip! See you next time</div>
      </div>
    )
  }

  // In-trip (and dateless trips) — the day strip.
  const { showWelcome, dots, title, lines } = homeBannerModel(phase)
  const columns = bannerGridColumns(dots.length)
  return (
    <div style={styles.container}>
      {showWelcome && <div style={styles.welcome}>Welcome to {tripName || 'the trip'}</div>}
      {dots.length > 0 && (
        <div style={{ ...styles.strip, gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
          {dots.map(d => (
            <div key={d.n} style={styles.dotCell}>
              <div style={dotStyle(d.state)}>{d.n}</div>
            </div>
          ))}
        </div>
      )}
      {title && <div style={styles.title}>{title}</div>}
      {lines.map((line, i) => <div key={i} style={styles.courseLine}>{line}</div>)}
    </div>
  )
}
