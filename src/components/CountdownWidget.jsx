// Home banner (trip Home tab).
//  - Pre-trip  : the day countdown.
//  - Post-trip : "Trip complete" with a pointer to Standings.
//  - In-trip   : today's title + course, then the day strip: one labelled segment per
//                trip day (weekday and date side by side through 6 days, date only
//                from 7), today's segment in brass.
// Facts come from getTripPhase (dayNumber / totalDays / todaysRounds / phase), fed the
// trip's time zone exactly like the routing code, so an out-of-zone viewer sees the
// trip's day. The live-score banner is a separate component.

import { getTripPhase, homeBannerModel, bannerDayLabels } from '../lib/scoring'

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
  container: { background: 'var(--primary)', borderRadius: 'var(--card-radius)', padding: '14px 16px 12px', marginBottom: 12, color: '#fff' },
  centered: { textAlign: 'center', padding: '18px 16px' },
  number: { fontFamily: 'var(--font-serif)', fontSize: 48, fontWeight: 700, color: '#fff', lineHeight: 1, fontVariantNumeric: 'lining-nums' },
  label: { fontSize: 11, color: 'var(--on-primary-soft)', textTransform: 'uppercase', letterSpacing: '.14em', marginTop: 8, fontWeight: 600 },
  message: { fontFamily: 'var(--font-serif)', fontSize: 20, color: '#fff', fontWeight: 700, lineHeight: 1.3 },
  messageSub: { fontSize: 13, color: 'var(--on-primary)', marginTop: 6 },
  eyebrow: { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.14em', color: 'var(--on-primary-soft)', fontWeight: 600 },
  title: { fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 700, color: '#fff', lineHeight: 1.2, marginTop: 6 },
  courseLine: { fontSize: 14, color: 'var(--on-primary)', marginTop: 2, lineHeight: 1.3 },
}

export default function CountdownWidget({ trip, rounds = [] }) {
  const tripName = trip?.name
  const phase = getTripPhase({ trip, rounds, now: new Date(), timeZone: trip?.time_zone ?? undefined })

  if (phase.phase === 'before-trip') {
    const days = daysUntil(trip?.start_date)
    return (
      <div style={{ ...styles.container, ...styles.centered }}>
        <div style={styles.number}>{days}</div>
        <div style={styles.label}>{days === 1 ? 'day until the trip' : 'days until the trip'}</div>
      </div>
    )
  }

  if (phase.phase === 'after-trip') {
    return (
      <div style={{ ...styles.container, ...styles.centered }}>
        <div style={styles.message}>Trip complete</div>
        <div style={styles.messageSub}>Final standings are on the Standings tab.</div>
      </div>
    )
  }

  const { showWelcome, dots, title, lines } = homeBannerModel(phase)
  const labels = bannerDayLabels(trip?.start_date, dots.length)
  const eyebrow = [showWelcome ? `Welcome to ${tripName || 'the trip'}` : null, title ? `${title} of ${dots.length}` : null].filter(Boolean).join(' · ')
  return (
    <div style={styles.container}>
      {eyebrow && <div style={styles.eyebrow}>{eyebrow}</div>}
      {lines.map((line, i) => <div key={i} style={i === 0 ? styles.title : styles.courseLine}>{line}</div>)}
      {dots.length > 0 && labels.length === dots.length && (
        <div className="ds-dseg" style={{ gridTemplateColumns: `repeat(${dots.length}, 1fr)` }} aria-label={`Day ${phase.dayNumber ?? ''} of ${dots.length}`}>
          {dots.map((d, i) => (
            <div key={d.n} className={`ds-ds ${d.state === 'past' ? 'past' : d.state === 'today' ? 'now' : ''}`} aria-current={d.state === 'today' ? 'date' : undefined}>
              <i />
              <b>{labels[i].weekday && labels[i].label !== labels[i].date ? <>{labels[i].weekday}<span>{labels[i].date}</span></> : labels[i].date}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
