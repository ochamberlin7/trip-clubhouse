// Segmented control for two to four equal choices (Pairing 1 | Pairing 2, Gross | Net,
// Tournament | Prince of Wales). The chosen segment gets the green tint plus a 2px
// green underline, so it never relies on color alone.
export default function Segmented({ options, value, onChange, ariaLabel, style }) {
  return (
    <div className="ds-seg" role="tablist" aria-label={ariaLabel} style={{ ...style, gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map(o => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id}
          className={`ds-seg-btn ${value === o.id ? 'on' : ''}`} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
