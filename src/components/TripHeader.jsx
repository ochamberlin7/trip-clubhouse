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
    padding: '20px 16px 16px',
    borderBottom: '1px solid #DDE3EA',
    textAlign: 'center',
  },
  eyebrow: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '2.5px',
    textTransform: 'uppercase',
    color: '#1B3F6E',
    marginBottom: '4px',
  },
  title: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: '44px',
    fontWeight: 700,
    color: '#0D1B2A',
    letterSpacing: '2px',
    lineHeight: 1,
  },
  subtitle: {
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '2.5px',
    textTransform: 'uppercase',
    color: '#7A8FA6',
    marginTop: '6px',
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
