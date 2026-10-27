import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Small superscript "i" button for a stat title, plus the definition bubble it opens.
// The bubble floats over the card (it doesn't push the player list down) and is
// rendered on <body> so no card edge can clip it; its pointer comes straight out
// of the "i". The card owns open/closed and passes the same ref to both. Closes on
// a second tap of the "i", a tap anywhere else, a scroll, or a resize.

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

const BUBBLE_W = 280

export function InfoBubble({ anchorRef, onClose, children }) {
  const bubbleRef = useRef(null)
  const [pos, setPos] = useState(null) // { top, left, width, caret }

  // Place the bubble just under the "i", kept on screen, with the caret under it.
  useLayoutEffect(() => {
    const a = anchorRef?.current
    if (!a) return
    const r = a.getBoundingClientRect()
    const vw = window.innerWidth
    const width = Math.min(BUBBLE_W, vw - 24)
    const centre = r.left + r.width / 2
    const left = Math.max(12, Math.min(vw - width - 12, centre - 24))
    setPos({ top: r.bottom + 9, left, width, caret: Math.max(8, Math.min(width - 18, centre - left - 5)) })
  }, [anchorRef])

  // Tap anywhere else (not the "i", which toggles itself) → close. Scroll/resize → close.
  useEffect(() => {
    function onDown(e) {
      if (anchorRef?.current?.contains(e.target)) return
      if (bubbleRef.current?.contains(e.target)) return
      onClose?.()
    }
    const close = () => onClose?.()
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [anchorRef, onClose])

  if (!pos) return null
  return createPortal(
    <div ref={bubbleRef} role="note" style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 1100 }}>
      <span aria-hidden="true" style={{ position: 'absolute', top: -5, left: pos.caret, width: 10, height: 10, background: '#0D1B2A', transform: 'rotate(45deg)', borderRadius: 2 }} />
      <div style={{ position: 'relative', background: '#0D1B2A', color: '#fff', borderRadius: 10, padding: '9px 12px', fontSize: 12.5, lineHeight: 1.45, fontWeight: 500, boxShadow: '0 8px 24px rgba(13,27,42,0.28)' }}>
        {children}
      </div>
    </div>,
    document.body,
  )
}
