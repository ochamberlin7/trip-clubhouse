import { useState } from 'react'

// Month calendar for picking a trip's date range (no external dependency).
// Used by the trip wizard and Commissioner Tools → Trip Dates.
// Optional `markStart` / `markEnd` outline another range (e.g. the current trip
// dates while picking new ones).

const CAL_DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const CAL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
// Local YYYY-MM-DD (never UTC, so the calendar day matches what the user tapped).
function isoOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function parseIso(s) { return s ? new Date(s + 'T00:00:00') : null }

// Editorial style (matches the wizard): hairline frame, serif month,
// small-caps weekdays, square day cells.
const cal = {
  wrap: { border: '1px solid #D5D9DF', borderRadius: 3, padding: '12px 10px', background: '#fff' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #E3E1DA' },
  nav: { width: 34, height: 34, border: 'none', background: 'none', fontSize: 22, lineHeight: 1, color: '#1B3F6E', cursor: 'pointer', fontFamily: 'inherit' },
  monthLabel: { fontFamily: 'var(--font-serif)', fontSize: 18, color: '#0D1B2A' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center' },
  dow: { fontSize: 10, fontWeight: 700, letterSpacing: '1.4px', color: '#8C97A6', padding: '4px 0 6px' },
  day: { border: 'none', background: 'none', borderRadius: 2, padding: '9px 0', fontSize: 14, fontWeight: 500, color: '#0D1B2A', cursor: 'pointer', fontFamily: 'inherit' },
  // Every date in the range (start, end and the days between) is solid navy.
  selected: { background: '#1B3F6E', color: '#fff', fontWeight: 700 },
  marked: { boxShadow: 'inset 0 0 0 1px #C9A84C' },
}

export default function RangeCalendar({ startDate, endDate, onSelect, markStart, markEnd }) {
  const [view, setView] = useState(() => {
    const base = parseIso(startDate) || parseIso(markStart) || new Date()
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })
  const year = view.getFullYear()
  const month = view.getMonth()
  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div style={cal.wrap}>
      <div style={cal.header}>
        <button type="button" style={cal.nav} onClick={() => setView(new Date(year, month - 1, 1))} aria-label="Previous month">‹</button>
        <span style={cal.monthLabel}>{CAL_MONTHS[month]} {year}</span>
        <button type="button" style={cal.nav} onClick={() => setView(new Date(year, month + 1, 1))} aria-label="Next month">›</button>
      </div>
      <div style={cal.grid}>
        {CAL_DOW.map((d, i) => <span key={`h${i}`} style={cal.dow}>{d}</span>)}
        {cells.map((d, i) => {
          if (d == null) return <span key={i} />
          const iso = isoOf(new Date(year, month, d))
          const isSelected = iso === startDate || iso === endDate || (startDate && endDate && iso > startDate && iso < endDate)
          const isMarked = !isSelected && markStart && markEnd && iso >= markStart && iso <= markEnd
          return (
            <button
              type="button"
              key={i}
              onClick={() => onSelect(iso)}
              style={{ ...cal.day, ...(isMarked ? cal.marked : null), ...(isSelected ? cal.selected : null) }}
            >
              {d}
            </button>
          )
        })}
      </div>
    </div>
  )
}
