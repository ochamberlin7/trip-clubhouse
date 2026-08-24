// CTI Clubhouse countdown card — 3 states: pre-trip, during-trip, post-trip.

// Parse an ISO date string to a local-midnight Date (date-level, ignores time).
function parseDate(iso) {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00')
  return isNaN(d) ? null : d
}

// Today at local midnight.
function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

const styles = {
  container: {
    background: '#1B3F6E',
    borderRadius: '12px',
    padding: '16px',
    textAlign: 'center',
    marginBottom: '10px',
  },
  number: {
    fontSize: '52px',
    fontWeight: 900,
    color: '#fff',
    lineHeight: 1,
  },
  label: {
    fontSize: '12px',
    color: 'rgba(255,255,255,0.65)',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginTop: '4px',
  },
  // Override style used for during-trip / post-trip messages.
  message: {
    fontSize: '17px',
    letterSpacing: 0,
    textTransform: 'none',
    color: '#fff',
    fontWeight: 700,
    lineHeight: 1.4,
    marginTop: 0,
  },
}

export default function CountdownWidget({ tripName, startDate, endDate, rounds = [] }) {
  const start = parseDate(startDate)
  const end = parseDate(endDate)

  if (!start || !end) {
    return (
      <div style={styles.container}>
        <div style={styles.message}>Trip dates not set</div>
      </div>
    )
  }

  const today = startOfToday()

  // STATE 1: PRE-TRIP
  if (today < start) {
    const days = Math.max(0, Math.ceil((start - today) / 86400000))
    return (
      <div style={styles.container}>
        <div style={styles.number}>{days}</div>
        <div style={styles.label}>{days === 1 ? 'day until trip' : 'days until trip'}</div>
      </div>
    )
  }

  // STATE 3: POST-TRIP
  if (today > end) {
    return (
      <div style={styles.container}>
        <div style={styles.message}>Thanks for an amazing trip! See you next time</div>
      </div>
    )
  }

  // STATE 2: DURING TRIP
  let message
  if (sameDay(today, start)) {
    message = `Welcome to ${tripName || 'the trip'}!`
  } else if (sameDay(today, end)) {
    message = 'Final Day — Make It Count!'
  } else {
    const dayNum = Math.round((today - start) / 86400000) + 1
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const todaysCourses = rounds
      .filter(r => r.date === todayIso && r.course_name)
      .map(r => r.course_name)
    message = todaysCourses.length > 0
      ? `Day ${dayNum}: ${todaysCourses.join(' & ')}`
      : `Day ${dayNum}`
  }

  return (
    <div style={styles.container}>
      <div style={{ ...styles.number, display: 'none' }} />
      <div style={styles.message}>{message}</div>
    </div>
  )
}
