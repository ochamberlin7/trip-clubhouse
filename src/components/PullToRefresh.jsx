import { useRef, useState } from 'react'

// Lightweight pull-to-refresh for window-scrolled pages. When the page is
// scrolled to the very top and the user drags down past a threshold, calls
// onRefresh() (which may be async) and shows a spinner until it resolves.
//
// `disabled` suppresses activation (e.g. while a modal/overlay is open). Keeps
// the touch handlers passive-friendly: it never calls preventDefault, so it
// coexists with the browser's own overscroll without fighting it.
const THRESHOLD = 64   // px of pull needed to trigger a refresh
const MAX_PULL = 90    // px cap on the visible pull distance

export default function PullToRefresh({ onRefresh, disabled = false, children }) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(null)

  // The dashboard scrolls inside .dashboard-scroll (the page shell is fixed-height),
  // so check that container's scrollTop; fall back to the window for other layouts.
  const atTop = () => {
    const sc = typeof document !== 'undefined' && document.querySelector('.dashboard-scroll')
    if (sc) return sc.scrollTop <= 0
    return (window.scrollY || document.documentElement.scrollTop || 0) <= 0
  }

  function onTouchStart(e) {
    if (disabled || refreshing) { startY.current = null; return }
    // Only arm a pull when we begin at the top of the page.
    startY.current = atTop() ? e.touches[0].clientY : null
  }
  function onTouchMove(e) {
    if (startY.current == null || refreshing) return
    const dy = e.touches[0].clientY - startY.current
    if (dy > 0 && atTop()) {
      setPull(Math.min(dy * 0.5, MAX_PULL)) // resistance so it feels rubbery
    } else {
      // Scrolled up / not a downward pull → abandon this gesture.
      startY.current = null
      setPull(0)
    }
  }
  async function onTouchEnd() {
    if (startY.current == null) return
    startY.current = null
    if (pull >= THRESHOLD && !refreshing) {
      setRefreshing(true)
      setPull(THRESHOLD)
      try { await onRefresh?.() } finally { setRefreshing(false); setPull(0) }
    } else {
      setPull(0)
    }
  }

  const show = refreshing || pull > 0
  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {show && (
        <div style={{ height: pull, overflow: 'hidden', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 6 }}>
          <div style={{
            width: 22, height: 22, borderRadius: '50%',
            border: '2.5px solid rgba(27,63,110,0.2)', borderTopColor: '#1B3F6E',
            animation: refreshing ? 'ptr-spin 0.7s linear infinite' : 'none',
            transform: refreshing ? 'none' : `rotate(${pull * 3}deg)`,
            opacity: Math.min(1, pull / THRESHOLD),
          }} />
        </div>
      )}
      {children}
    </div>
  )
}
