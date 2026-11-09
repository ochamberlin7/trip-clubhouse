// Pill row: a horizontally scrolling set of choices (rounds, stat categories, leaderboard
// views). The chosen pill is filled green; the others are outlined. Never color alone:
// the filled state also changes the text color to white.
//   options : [{ id, label, badge }]   value : chosen id   onChange(id)
export default function Pills({ options, value, onChange, ariaLabel, style, className = '' }) {
  return (
    <div className={`ds-pills ${className}`.trim()} style={style} role="tablist" aria-label={ariaLabel}>
      {options.map(o => (
        <button key={o.id ?? 'all'} type="button" role="tab" aria-selected={value === o.id}
          className={`ds-pill ${value === o.id ? 'on' : ''}`} onClick={() => onChange(o.id)}>
          {o.label}
          {o.badge && <span className="ds-pill-badge">{o.badge}</span>}
        </button>
      ))}
    </div>
  )
}
