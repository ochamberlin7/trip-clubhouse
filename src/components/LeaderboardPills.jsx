// The Leaderboard's tab row — one look for every leaderboard (decided 2026-10-29):
// the Stableford / Stroke Play round tabs (Trip Total + each course) and the
// Tournament | Prince of Wales switch. Rounded pills; the chosen one is navy.
// Scrolls sideways when there are more tabs than fit.
//   options : [{ id, label }]   value : the chosen id   onChange(id)
const st = {
  row: { display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' },
  pill: { flexShrink: 0, padding: '6px 12px', borderRadius: 999, border: '1px solid var(--bg3)', background: 'var(--bg1)', color: 'var(--muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  // Full `border` (not borderColor): mixing the two left a de-selected tab's border black.
  on: { background: '#1B3F6E', border: '1px solid #1B3F6E', color: '#fff' },
}

export default function LeaderboardPills({ options, value, onChange, ariaLabel, style }) {
  return (
    <div style={{ ...st.row, ...style }} role="tablist" aria-label={ariaLabel}>
      {options.map(o => (
        <button key={o.id ?? 'all'} type="button" role="tab" aria-selected={value === o.id}
          style={{ ...st.pill, ...(value === o.id ? st.on : null) }} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
