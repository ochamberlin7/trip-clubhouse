import { useRef } from 'react'

// Page-level horizontal swipe navigation (threshold-commit — decides on release,
// no live drag). Deliberately hand-rolled to match the app's existing gesture
// idiom (weather widget, Stats carousel) rather than pulling in a library, and to
// stay easy to adapt when the app is later wrapped in Capacitor.
//
// Two hard rules baked in:
//   • Edge-strip exclusion — a gesture that STARTS within `edge` px of either
//     screen edge is ignored, so it falls through to the browser/OS back-swipe
//     (worse to fight inside an installed PWA). We never out-compete that zone.
//   • Direction-lock — only a gesture that ends clearly more horizontal than
//     vertical (and past `threshold`) commits, so vertical scrolling is untouched.
//     We never call preventDefault, so the scroll container keeps working.
//
// "Innermost wins": a component that owns its own horizontal swipe (a carousel,
// a tab strip) calls e.stopPropagation() on pointerdown so this outer handler
// never sees the gesture. At its boundary it can call the page nav explicitly.
//
// onNext fires on a left drag (dx < 0 → go forward); onPrev on a right drag.
export function useSwipeNav({ onNext, onPrev, edge = 28, threshold = 55, enabled = true }) {
  const ref = useRef({ x0: 0, y0: 0, active: false, skip: true, id: null })

  function onPointerDown(e) {
    const w = typeof window !== 'undefined' ? window.innerWidth : 0
    const inEdge = e.clientX <= edge || e.clientX >= w - edge
    ref.current = { x0: e.clientX, y0: e.clientY, active: true, skip: !enabled || inEdge, id: e.pointerId }
  }

  function onPointerUp(e) {
    const s = ref.current
    // Require a matching pointerdown on THIS element for THIS pointer. If an inner
    // owned surface stopped propagation of its pointerdown, `active` was never set
    // here, so a bubbled pointerup can't misfire on stale coordinates.
    if (!s.active || s.id !== e.pointerId) return
    s.active = false
    if (s.skip) return
    const dx = e.clientX - s.x0
    const dy = e.clientY - s.y0
    if (Math.abs(dx) < threshold || Math.abs(dx) <= Math.abs(dy)) return
    if (dx < 0) onNext && onNext()
    else onPrev && onPrev()
  }

  return { onPointerDown, onPointerUp }
}

// Shared helper for the owned surfaces (Stats / Leaderboard tab strips): is this
// pointer starting inside the OS back-swipe edge strip? If so they bow out too, so
// an edge swipe always reaches the browser regardless of where it lands.
export function inEdgeZone(clientX, edge = 28) {
  const w = typeof window !== 'undefined' ? window.innerWidth : 0
  return clientX <= edge || clientX >= w - edge
}
