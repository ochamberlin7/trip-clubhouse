// Home banner — "Trip Clubhouse" small-caps wordmark, auto-fit trip name, date range.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

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
    color: '#000000',
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
  // Commissioner-only pencil, pinned to the header's upper-right (aligned with the
  // wordmark row so it never overlaps the centered trip name). Subtle rounded
  // button with a faint tint so it reads as tappable without shouting.
  editBtn: {
    position: 'absolute',
    top: 'max(env(safe-area-inset-top), 20px)',
    right: 12,
    width: 30,
    height: 30,
    background: '#F1F4F8',
    border: '1px solid #E1E7EE',
    borderRadius: '50%',
    padding: 0,
    cursor: 'pointer',
    color: '#5A7290',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 0,
  },
  // Inline editor (shown in place of the name while renaming): a soft rounded
  // field in the header's serif type, with Save / Cancel beneath it.
  editWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, margin: '4px auto 2px', width: 'min(92%, 380px)' },
  editInput: {
    width: '100%', boxSizing: 'border-box', textAlign: 'center',
    fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 22, color: '#0D1B2A',
    border: '1px solid #CBD5E1', borderRadius: 12, background: '#F7F9FB',
    padding: '9px 14px', outline: 'none',
  },
  editActions: { display: 'flex', alignItems: 'center', gap: 8 },
  saveBtn: {
    background: '#1B3F6E', color: '#fff', border: 'none', borderRadius: 8,
    padding: '7px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  },
  cancelBtn: {
    background: 'transparent', color: '#7A8FA6', border: 'none',
    padding: '7px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  },
  editErr: { fontSize: 11, color: '#C0392B', marginTop: -2 },
}

function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
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

export default function TripHeader({ tripName, startDate, endDate, tripId, canEdit = false, onRenamed }) {
  const range = formatRange(startDate, endDate)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(tripName || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const inputRef = useRef(null)

  // Keep the draft in sync when not actively editing (e.g. after a refetch).
  useEffect(() => { if (!editing) setName(tripName || '') }, [tripName, editing])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  function startEdit() { setErr(''); setName(tripName || ''); setEditing(true) }
  function cancel() { setEditing(false); setErr(''); setName(tripName || '') }

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) { setErr('Name can’t be empty'); return }
    if (trimmed === (tripName || '').trim()) { setEditing(false); return }
    setSaving(true)
    const { error } = await supabase.from('trips').update({ name: trimmed }).eq('id', tripId)
    setSaving(false)
    if (error) { setErr('Couldn’t save — try again'); return }
    setEditing(false)
    onRenamed?.()
  }

  return (
    <div style={{ ...styles.container, position: 'relative' }}>
      <div style={styles.wordmark}>Trip Clubhouse</div>

      {editing ? (
        <div style={styles.editWrap}>
          <input
            ref={inputRef} style={styles.editInput} value={name} maxLength={80}
            placeholder="Trip name"
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); else if (e.key === 'Escape') cancel() }}
          />
          {err && <div style={styles.editErr}>{err}</div>}
          <div style={styles.editActions}>
            <button style={styles.saveBtn} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            <button style={styles.cancelBtn} onClick={cancel} disabled={saving}>Cancel</button>
          </div>
        </div>
      ) : (
        tripName && <TripNameFit text={tripName} />
      )}

      {range && <div style={styles.subtitle}>{range}</div>}

      {canEdit && !editing && (
        <button style={styles.editBtn} onClick={startEdit} aria-label="Edit trip name"><PencilIcon /></button>
      )}
    </div>
  )
}
