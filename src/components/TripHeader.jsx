// Home banner — "Trip Clubhouse" small-caps wordmark, auto-fit trip name, date range.
import { useLayoutEffect, useRef, useState } from 'react'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// Trip-name headline auto-sizing bounds (px). Shrinks from MAX to fit one line;
// won't go below MIN (below that it wraps to 2 lines rather than truncating).
const TRIP_NAME_MAX = 34
const TRIP_NAME_MIN = 22

function parseDate(iso) {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00')
  return isNaN(d) ? null : d
}

// "Sep 29 - Oct 4, 2026" — both month abbreviations always shown, year only on the end date.
function formatRange(startDate, endDate) {
  const s = parseDate(startDate)
  const e = parseDate(endDate)
  if (!s && !e) return ''
  if (s && !e) return `${MONTHS[s.getMonth()]} ${s.getDate()}, ${s.getFullYear()}`
  if (!s && e) return `${MONTHS[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`
  return `${MONTHS[s.getMonth()]} ${s.getDate()} - ${MONTHS[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`
}

const styles = {
  container: {
    background: '#FFFFFF',
    // Top-most element on the Home tab now (tab bar moved to the bottom), so it
    // carries the status-bar / notch inset; white bg fills the safe area.
    padding: 'max(env(safe-area-inset-top), 20px) 16px 16px',
    borderBottom: '1px solid #DDE3EA',
    textAlign: 'center',
  },
  // "Trip Clubhouse" wordmark — TOP, small small-caps serif label. Navy to match
  // the trip name and other banner elements (var(--navy), not a hardcoded hex).
  wordmark: {
    fontFamily: "'Playfair Display SC', serif",
    fontStyle: 'normal',
    fontSize: '15px',
    fontWeight: 700,
    color: 'var(--navy)',
    letterSpacing: '0.5px',
    lineHeight: 1,
    marginBottom: '5px',
  },
  // Trip name — MIDDLE, the large dominant headline. Playfair Display (serif) to
  // match the "Trip Clubhouse" wordmark's type language. font-size is set
  // dynamically by TripNameFit so it always stays on one line.
  tripName: {
    fontFamily: "'Playfair Display', serif",
    fontWeight: 700,
    // Normal tracking — Playfair Display bold's default. (The old 2px tracking
    // was for the sans-serif look and stretched the serif caps.)
    letterSpacing: 'normal',
    // Display exactly as entered (title case) — no forced uppercase.
    color: 'var(--navy)',
    lineHeight: 1.05,
  },
  subtitle: {
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '2px',
    textTransform: 'uppercase',
    color: '#5A7290',
    marginTop: '7px',
  },
}

// Shrink-to-fit trip name: measure the rendered text (nowrap) against the
// container width and step the font-size down from MAX until it fits on one
// line, floored at MIN. Below the floor it wraps rather than shrinking further.
// Runs in useLayoutEffect (pre-paint, so no flash) and on container/window resize.
function TripNameFit({ text }) {
  const ref = useRef(null)
  const [fontSize, setFontSize] = useState(TRIP_NAME_MAX)
  const [wrap, setWrap] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    let cancelled = false
    function fit() {
      if (cancelled || !el.isConnected) return
      el.style.whiteSpace = 'nowrap'
      let size = TRIP_NAME_MAX
      el.style.fontSize = `${size}px`
      while (size > TRIP_NAME_MIN && el.scrollWidth > el.clientWidth) {
        size -= 1
        el.style.fontSize = `${size}px`
      }
      const overflow = el.scrollWidth > el.clientWidth // still too long at the floor
      el.style.whiteSpace = overflow ? 'normal' : 'nowrap'
      setFontSize(size)
      setWrap(overflow)
    }
    fit()
    // The trip name is now Playfair Display (a web font), so re-measure once fonts
    // finish loading — the first pass may measure against the fallback metrics.
    if (document.fonts?.ready) document.fonts.ready.then(fit)
    // Observe the container width (not this element, which would loop on font change).
    const parent = el.parentElement
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null
    if (ro && parent) ro.observe(parent)
    window.addEventListener('resize', fit)
    return () => { cancelled = true; ro?.disconnect(); window.removeEventListener('resize', fit) }
  }, [text])

  return (
    <div ref={ref} style={{ ...styles.tripName, fontSize: `${fontSize}px`, whiteSpace: wrap ? 'normal' : 'nowrap' }}>
      {text}
    </div>
  )
}

export default function TripHeader({ tripName, startDate, endDate }) {
  const range = formatRange(startDate, endDate)
  return (
    <div style={styles.container}>
      <div style={styles.wordmark}>Trip Clubhouse</div>
      {tripName && <TripNameFit text={tripName} />}
      {range && <div style={styles.subtitle}>{range}</div>}
    </div>
  )
}
