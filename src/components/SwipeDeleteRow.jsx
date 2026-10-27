import { useEffect, useRef, useState } from 'react'

// iMessage-style swipe-to-delete row, shared by the Clubhouse home page and the
// menu's trip switcher. Drag left (touch or mouse) OR two-finger swipe left on a
// trackpad to reveal a red trash button; tapping it calls onDelete. A tap (no
// drag) calls onPick; keyboard Enter/Space also picks (it's a real <button>).
// Vertical gestures fall through to page scroll. When canDelete is false it
// renders a plain button.
//   rowStyle: the row's own look (padding, layout, divider)
//   coverBg:  opaque background of the sliding row — must match what's behind it
//             so the red action stays hidden until swiped
export const SWIPE_OPEN = 76 // px of red delete action revealed when a row is swiped left

const outer = { position: 'relative', overflow: 'hidden' }
const action = { position: 'absolute', top: 0, right: 0, bottom: 0, width: SWIPE_OPEN, background: '#C0392B', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }

function TrashIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  )
}

export default function SwipeDeleteRow({ canDelete, rowStyle, outerStyle, coverBg = '#F0F4F8', deleteLabel = 'Delete trip', onPick, onDelete, children }) {
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const st = useRef({ x0: 0, y0: 0, base: 0, axis: null, drag: false })
  const dxRef = useRef(0)              // current dx, readable in the native wheel handler
  const fgRef = useRef(null)          // foreground row element (wheel target)

  useEffect(() => { dxRef.current = dx }, [dx])

  // Two-finger trackpad swipe: horizontal wheel events (deltaX). A native,
  // non-passive listener is required so preventDefault() can stop the browser's
  // back/forward swipe-navigation; React's synthetic onWheel is passive. Only
  // horizontal-dominant gestures are hijacked, so vertical scroll still works;
  // the row snaps open/closed ~140ms after the gesture settles.
  useEffect(() => {
    const el = fgRef.current
    if (!el) return
    let settle
    function onWheel(e) {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return // vertical → scroll
      e.preventDefault()
      setDragging(true)
      const next = Math.max(-SWIPE_OPEN, Math.min(0, dxRef.current - e.deltaX))
      dxRef.current = next
      setDx(next)
      clearTimeout(settle)
      settle = setTimeout(() => {
        const snapped = dxRef.current < -SWIPE_OPEN / 2 ? -SWIPE_OPEN : 0
        dxRef.current = snapped
        setDragging(false)
        setDx(snapped)
      }, 140)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => { el.removeEventListener('wheel', onWheel); clearTimeout(settle) }
  }, [canDelete])

  if (!canDelete) {
    return <button style={rowStyle} onClick={onPick}>{children}</button>
  }

  // The drag-active guard lives in the ref, NOT the `dragging` state: setDragging
  // is async, so a mouse (which fires pointermove immediately, unlike touch) would
  // have its first moves dropped by a stale state closure. The state only toggles
  // the CSS transition.
  function down(e) {
    st.current = { x0: e.clientX, y0: e.clientY, base: dx, axis: null, drag: false, active: true }
    setDragging(true)
  }
  function move(e) {
    const s = st.current
    if (!s.active) return
    const ddx = e.clientX - s.x0, ddy = e.clientY - s.y0
    if (!s.axis && (Math.abs(ddx) > 6 || Math.abs(ddy) > 6)) {
      s.axis = Math.abs(ddx) > Math.abs(ddy) ? 'x' : 'y'
      // Capture only once we've committed to a horizontal swipe, so vertical
      // drags keep scrolling the list normally.
      if (s.axis === 'x') e.currentTarget.setPointerCapture?.(e.pointerId)
    }
    if (s.axis !== 'x') return // vertical → let the list scroll
    s.drag = true
    setDx(Math.max(-SWIPE_OPEN, Math.min(0, s.base + ddx)))
  }
  function end() {
    const s = st.current
    if (!s.active) return
    s.active = false
    setDragging(false)
    if (s.axis === 'x') setDx(prev => (prev < -SWIPE_OPEN / 2 ? -SWIPE_OPEN : 0))
  }
  function click(e) {
    // Suppress the click that follows a horizontal drag; otherwise tap = pick
    // (when closed) or close (when open).
    if (st.current.drag) { e.preventDefault(); st.current.drag = false; return }
    if (dx !== 0) { setDx(0); return }
    onPick()
  }

  return (
    <div style={{ ...outer, background: coverBg, ...outerStyle }}>
      {/* Only mount the red action while the row is actually swiped — otherwise a
          1px sliver of its left edge shows as a vertical line at rest. */}
      {dx !== 0 && <button style={action} onClick={() => { setDx(0); onDelete() }} aria-label={deleteLabel}><TrashIcon /></button>}
      <button
        ref={fgRef}
        style={{ ...rowStyle, borderBottom: 'none', borderTop: 'none',
          // Opaque background so the row hides the red action until swiped left.
          background: coverBg,
          transform: `translateX(${dx}px)`, transition: dragging ? 'none' : 'transform 0.2s ease', touchAction: 'pan-y', willChange: 'transform',
          userSelect: 'none', WebkitUserSelect: 'none' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onClick={click}
        onDragStart={e => e.preventDefault()}
      >
        {children}
      </button>
    </div>
  )
}
