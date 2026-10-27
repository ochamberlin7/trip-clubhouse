// Small superscript "i" button for a stat title, plus the definition bubble it opens. The
// bubble renders inline under the title (not floating), so it can't be clipped by
// the card. The card owns the open/closed state; tap the "i" again to close.

export function InfoButton({ open, onToggle, color = 'currentColor', label = 'What does this mean?' }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={open}
      onClick={e => { e.stopPropagation(); onToggle() }}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 13, height: 13, borderRadius: '50%', padding: 0, marginLeft: 2, flexShrink: 0,
        // Superscript: sits up against the end of the title, not centred beside it.
        alignSelf: 'flex-start', position: 'relative', top: -2, verticalAlign: 'super',
        border: `1.2px solid ${color}`, background: open ? color : 'transparent',
        color: open ? '#fff' : color, fontSize: 8.5, fontWeight: 800, fontStyle: 'italic',
        fontFamily: 'Georgia, serif', lineHeight: 1, cursor: 'pointer', opacity: open ? 1 : 0.8,
      }}
    >
      i
    </button>
  )
}

export function InfoBubble({ children }) {
  return (
    <div style={{ position: 'relative', margin: '8px 12px 2px' }}>
      {/* little pointer up toward the title */}
      <span aria-hidden="true" style={{ position: 'absolute', top: -5, left: 18, width: 10, height: 10, background: '#0D1B2A', transform: 'rotate(45deg)', borderRadius: 2 }} />
      <div role="note" style={{ position: 'relative', background: '#0D1B2A', color: '#fff', borderRadius: 10, padding: '9px 12px', fontSize: 12.5, lineHeight: 1.45, fontWeight: 500 }}>
        {children}
      </div>
    </div>
  )
}
