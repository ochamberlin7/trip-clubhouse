// CTI Clubhouse header — eyebrow trip name, serif "Clubhouse" title, date range subtitle.

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function parseDate(iso) {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00')
  return isNaN(d) ? null : d
}

// "Sep 29 - Oct 4, 2026" — both month abbreviations always shown, year only on the end date.
function formatRange(startDate, endDate) {
  const s = parseDate(startDate)
  const e = parseDate(endDate)
  if (!s && !e) return ''
  if (s && !e) return `${MONTHS[s.getMonth()]} ${s.getDate()}, ${s.getFullYear()}`
  if (!s && e) return `${MONTHS[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`
  return `${MONTHS[s.getMonth()]} ${s.getDate()} - ${MONTHS[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`
}

const styles = {
  container: {
    background: '#FFFFFF',
    // Top-most element on the Home tab now (tab bar moved to the bottom), so it
    // carries the status-bar / notch inset; white bg fills the safe area.
    padding: 'max(env(safe-area-inset-top), 20px) 16px 16px',
    borderBottom: '1px solid #DDE3EA',
    textAlign: 'center',
  },
  // Trip name — now the PRIMARY headline (large, dominant). Same colour/styling
  // as before, just the larger of the two.
  eyebrow: {
    fontSize: '40px',
    fontWeight: 700,
    letterSpacing: '2px',
    textTransform: 'uppercase',
    color: '#1B3F6E',
    marginBottom: '5px',
  },
  // "Clubhouse" wordmark — now the SECONDARY label (small subtitle-style) under
  // the trip name. Same serif/colour as before, just the smaller of the two.
  title: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: '15px',
    fontWeight: 700,
    color: '#0D1B2A',
    letterSpacing: '2px',
    lineHeight: 1,
  },
  subtitle: {
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '2px',
    textTransform: 'uppercase',
    color: '#5A7290',
    marginTop: '7px',
  },
}

export default function TripHeader({ tripName, startDate, endDate }) {
  const range = formatRange(startDate, endDate)
  return (
    <div style={styles.container}>
      {tripName && <div style={styles.eyebrow}>{tripName}</div>}
      <div style={styles.title}>Clubhouse</div>
      {range && <div style={styles.subtitle}>{range}</div>}
    </div>
  )
}
