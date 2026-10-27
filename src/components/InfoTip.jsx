import { forwardRef, useLayoutEffect, useRef, useState } from 'react'

// Small superscript "i" button for a stat title, plus the definition bubble it opens. The
// bubble renders inline under the title (not floating), so it can't be clipped by
// the card; its pointer is measured to sit right under the "i". The card owns the
// open/closed state and passes the same ref to both; tap the "i" again to close.

export const InfoButton = forwardRef(function InfoButton({ open, onToggle, color = 'currentColor', label = 'What does this mean?' }, ref) {
  return (
    <button
      ref={ref}
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
})

export function InfoBubble({ anchorRef, children }) {
  const wrapRef = useRef(null)
  const [caretLeft, setCaretLeft] = useState(18)
  // Point the caret at the centre of the "i" (re-measured on resize).
  useLayoutEffect(() => {
    function place() {
      const a = anchorRef?.current, w = wrapRef.current
      if (!a || !w) return
      const ar = a.getBoundingClientRect(), wr = w.getBoundingClientRect()
      setCaretLeft(Math.max(6, Math.min(wr.width - 16, ar.left + ar.width / 2 - wr.left - 5)))
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [anchorRef])
  return (
    <div ref={wrapRef} style={{ position: 'relative', margin: '8px 12px 2px' }}>
      {/* little pointer up toward the "i" */}
      <span aria-hidden="true" style={{ position: 'absolute', top: -5, left: caretLeft, width: 10, height: 10, background: '#0D1B2A', transform: 'rotate(45deg)', borderRadius: 2 }} />
      <div role="note" style={{ position: 'relative', background: '#0D1B2A', color: '#fff', borderRadius: 10, padding: '9px 12px', fontSize: 12.5, lineHeight: 1.45, fontWeight: 500 }}>
        {children}
      </div>
    </div>
  )
}
