import { useEffect, useRef, useState } from 'react'

// Left/right paging for a Home card (Weather locations, Daily Leaders days).
// Touch / mouse drag past 40px, or a trackpad two-finger horizontal swipe, moves
// one page; the card renders a translateX track for the slide. Returns:
//   ref            → callback ref; attach to the card element (trackpad listener)
//   onPointerDown / onPointerUp → attach to the card
//   consumeSwipe() → true once right after a swipe, so a card that also opens on
//                    tap can ignore the click that ends a swipe.
export function useSwipePager({ count, index, onIndex }) {
  const [el, setEl] = useState(null)
  const swipe = useRef({ x0: 0, y0: 0, did: false })
  const latest = useRef({ count, index, onIndex })
  useEffect(() => { latest.current = { count, index, onIndex } })

  function go(delta) {
    const { count: n, index: i, onIndex: set } = latest.current
    if (n < 2) return
    const next = Math.min(n - 1, Math.max(0, i + delta))
    if (next !== i) set(next)
  }

  // Native non-passive listener so preventDefault stops the browser's
  // back/forward swipe navigation.
  useEffect(() => {
    if (!el || count < 2) return
    let settle, acc = 0
    function onWheel(e) {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
      e.preventDefault()
      acc += e.deltaX
      clearTimeout(settle)
      settle = setTimeout(() => { if (Math.abs(acc) > 40) go(acc < 0 ? -1 : 1); acc = 0 }, 90)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => { el.removeEventListener('wheel', onWheel); clearTimeout(settle) }
  }, [el, count])

  function onPointerDown(e) { swipe.current = { x0: e.clientX, y0: e.clientY, did: false } }
  function onPointerUp(e) {
    const s = swipe.current
    const dx = e.clientX - s.x0, dy = e.clientY - s.y0
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { s.did = true; go(dx < 0 ? 1 : -1) }
  }
  function consumeSwipe() {
    if (!swipe.current.did) return false
    swipe.current.did = false
    return true
  }
  return { ref: setEl, onPointerDown, onPointerUp, consumeSwipe }
}
