import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { searchCourses, getCourseDetails } from '../lib/courseApi'

// Self-contained course typeahead → tee picker.
// Phase 1: debounced search with a results dropdown anchored directly below the
//          input (absolute, full width) so it always reads clearly.
// Phase 2: selected-course card + men's/women's tee sections, then "Add".

// Tee color coding by name.
function teeStyle(name) {
  const n = (name || '').toLowerCase()
  if (n.includes('black')) return { background: '#222', color: '#fff', border: '1px solid #222' }
  if (n.includes('blue')) return { background: '#1B3F6E', color: '#fff', border: '1px solid #1B3F6E' }
  if (n.includes('white')) return { background: '#fff', color: '#0D1B2A', border: '1px solid #DDE3EA' }
  if (n.includes('gold')) return { background: '#D4A017', color: '#fff', border: '1px solid #D4A017' }
  if (n.includes('red')) return { background: '#C0392B', color: '#fff', border: '1px solid #C0392B' }
  return { background: '#E8EDF3', color: '#0D1B2A', border: '1px solid #DDE3EA' }
}

const s = {
  wrap: { position: 'relative' },
  input: { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #DDE3EA', background: '#fff', fontSize: '14px', color: '#0D1B2A', fontFamily: 'inherit', outline: 'none' },
  // Portaled to document.body with position:fixed (coords computed from the input
  // rect) so an overflow:hidden/auto ancestor — the course-edit modal sheet, the
  // wizard cards — can never clip it. zIndex sits above the modal overlay (400).
  dropdown: { position: 'fixed', zIndex: 4000, background: '#fff', border: '1px solid #DDE3EA', borderRadius: '8px', boxShadow: '0 6px 20px rgba(0,0,0,0.18)', maxHeight: '240px', overflowY: 'auto' },
  resultRow: { padding: '12px 14px', borderBottom: '1px solid #E8EDF3', cursor: 'pointer', background: '#fff' },
  resultName: { fontSize: '14px', fontWeight: 600, color: '#0D1B2A' },
  resultSub: { fontSize: '12px', color: '#7A8FA6', marginTop: '1px' },
  msg: { padding: '12px 14px', fontSize: '13px', color: '#7A8FA6', fontStyle: 'italic' },
  selectedCard: { background: '#E8EDF3', borderRadius: '8px', padding: '12px 14px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' },
  selName: { fontSize: '14px', fontWeight: 600, color: '#0D1B2A' },
  selSub: { fontSize: '12px', color: '#7A8FA6', marginTop: '1px' },
  clearBtn: { background: 'none', border: 'none', color: '#7A8FA6', fontSize: '18px', cursor: 'pointer', flexShrink: 0, lineHeight: 1, padding: 0 },
  teeLabel: { fontSize: '12px', textTransform: 'uppercase', color: '#7A8FA6', letterSpacing: '0.8px', marginBottom: '8px' },
  sectionHeader: { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.8px', color: '#7A8FA6', marginBottom: '6px' },
  teeGrid: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' },
  teeBtn: { borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', textAlign: 'left', minWidth: '92px', transition: 'transform 0.1s' },
  teeName: { fontSize: '13px', fontWeight: 700 },
  teeMeta: { fontSize: '10px', opacity: 0.85, marginTop: '2px' },
  confirm: { width: '100%', padding: '12px', borderRadius: '8px', border: 'none', background: '#1B3F6E', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  loadingCard: { padding: '14px', fontSize: '13px', color: '#7A8FA6', textAlign: 'center' },
}

function courseLocation(course) {
  const loc = course?.location
  if (!loc) return ''
  return [loc.city, loc.state].filter(Boolean).join(', ')
}

export default function CourseSearchInput({ onCourseSelected, onQueryChange, placeholder = 'Search for a course...', initialValue = '' }) {
  // initialValue indicates the currently-selected course but never pre-fills
  // the input — the field always starts empty.
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null) // null | 'rate' | 'error'
  const [course, setCourse] = useState(null)      // full selected course (Phase 2)
  const [maleTees, setMaleTees] = useState([])
  const [femaleTees, setFemaleTees] = useState([])
  const [selectedTee, setSelectedTee] = useState(null)
  const [loadingCourse, setLoadingCourse] = useState(false)
  const [rect, setRect] = useState(null) // input position, for the portaled dropdown
  const wrapRef = useRef(null)
  const dropRef = useRef(null)
  const typedRef = useRef(false) // only search after the user actively types

  // Snapshot the input's viewport rect so the fixed-position portal anchors to it.
  const captureRect = () => { if (wrapRef.current) setRect(wrapRef.current.getBoundingClientRect()) }

  // Debounced search.
  useEffect(() => {
    if (course) return
    if (!typedRef.current) return // skip the initial mount / prefilled value
    const q = query.trim()
    if (q.length < 2) { setResults([]); setOpen(false); return }
    setLoading(true); setError(null)
    const t = setTimeout(async () => {
      try {
        const found = await searchCourses(q)
        setResults(found.slice(0, 10))
        captureRect(); setOpen(true)
      } catch (err) {
        setError(err?.status === 429 ? 'rate' : 'error')
        setResults([]); captureRect(); setOpen(true)
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [query, course])

  // Close dropdown on outside click / ESC (ignore clicks inside the dropdown).
  useEffect(() => {
    function onDocClick(e) {
      const inWrap = wrapRef.current && wrapRef.current.contains(e.target)
      const inDrop = dropRef.current && dropRef.current.contains(e.target)
      if (!inWrap && !inDrop) setOpen(false)
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDocClick); document.removeEventListener('keydown', onKey) }
  }, [])

  // While the dropdown is open, keep it pinned to the input as the page/modal
  // scrolls or the viewport resizes (capture:true catches scrolls on the modal
  // sheet's own overflow container, not just window).
  useEffect(() => {
    if (!open) return
    const reposition = () => captureRect()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open])

  async function selectCourse(result) {
    setOpen(false)
    setLoadingCourse(true)
    let full = result
    try {
      // Always fetch full details so tees + holes are guaranteed before the
      // tee picker is shown.
      const detail = await getCourseDetails(result.id)
      if (detail) full = detail
    } catch {
      // Fall back to the search row (it often already includes tees/holes).
    }
    setCourse(full)
    const male = full?.tees?.male || []
    const female = full?.tees?.female || []
    setMaleTees(male)
    setFemaleTees(female)
    // Auto-select the first available tee so "Add This Course" is never blocked
    // (the button is disabled until a tee is selected).
    setSelectedTee(male[0] || female[0] || null)
    setLoadingCourse(false)
  }

  function clearSelection() {
    setCourse(null)
    setMaleTees([])
    setFemaleTees([])
    setSelectedTee(null)
    setResults([])
  }

  // Hand the full selection to the parent and let it decide what happens next
  // (e.g. the edit flow saves and closes the modal). No internal confirmation UI.
  function confirm() {
    console.log('[CourseSearchInput] Add This Course clicked; selectedTee =', selectedTee)
    if (!selectedTee) return
    const loc = course.location || {}
    // Cache every available tee (men's + women's) so per-player tee selection
    // in Commissioner Tools can offer them all. Normalised to {name,slope,rating,par}.
    const allTees = [...maleTees, ...femaleTees]
      .filter(t => t && t.tee_name)
      .map(t => ({ name: t.tee_name, slope: t.slope_rating, rating: t.course_rating, par: t.par_total }))
    onCourseSelected({
      golfcourse_id: course.id,
      club_name: course.club_name,
      course_name: course.course_name,
      location: courseLocation(course),
      location_city: loc.city ?? null,
      location_state: loc.state ?? null,
      location_lat: loc.latitude ?? null,
      location_lon: loc.longitude ?? null,
      tee_name: selectedTee.tee_name,
      course_rating: selectedTee.course_rating,
      slope_rating: selectedTee.slope_rating,
      par_total: selectedTee.par_total,
      number_of_holes: selectedTee.number_of_holes || 18,
      holes: selectedTee.holes,
      tees: allTees,
    })
    setOpen(false)
  }

  function TeeSection({ title, tees, topMargin }) {
    if (!tees || tees.length === 0) return null
    return (
      <div>
        <div style={{ ...s.sectionHeader, ...(topMargin ? { marginTop: '10px' } : null) }}>{title}</div>
        <div style={s.teeGrid}>
          {tees.map((tee, i) => {
            const active = selectedTee === tee
            return (
              <button
                key={`${title}-${tee.tee_name}-${i}`}
                style={{
                  ...s.teeBtn, ...teeStyle(tee.tee_name),
                  boxShadow: active ? '0 0 0 2px #1B3F6E' : 'none',
                  transform: active ? 'scale(1.03)' : 'none',
                }}
                onClick={() => setSelectedTee(tee)}
              >
                <div style={s.teeName}>{tee.tee_name}</div>
                <div style={s.teeMeta}>Rating: {tee.course_rating} / Slope: {tee.slope_rating}</div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Phase 2: tee selection ──
  if (course) {
    const hasTees = maleTees.length > 0 || femaleTees.length > 0
    return (
      <div>
        <div style={s.selectedCard}>
          <div>
            <div style={s.selName}>{course.club_name}</div>
            <div style={s.selSub}>
              {[course.course_name && course.course_name !== course.club_name ? course.course_name : null, courseLocation(course)]
                .filter(Boolean).join(' · ')}
            </div>
          </div>
          <button style={s.clearBtn} onClick={clearSelection} aria-label="Clear selection">✕</button>
        </div>

        <div style={s.teeLabel}>Select tees</div>
        {!hasTees ? (
          <div style={s.msg}>No tee data available for this course.</div>
        ) : (
          <>
            <TeeSection title="Men's Tees" tees={maleTees} topMargin={false} />
            <TeeSection title="Women's Tees" tees={femaleTees} topMargin={maleTees.length > 0} />
          </>
        )}

        <button style={{ ...s.confirm, opacity: selectedTee ? 1 : 0.4, cursor: selectedTee ? 'pointer' : 'not-allowed' }}
          onClick={confirm} disabled={!selectedTee}>
          Add This Course
        </button>
      </div>
    )
  }

  // ── Phase 1: search ──
  // Anchor the fixed portal to the input rect; flip upward when there's little
  // room below so the list is never pushed off-screen.
  let dropPos = null
  if (rect) {
    const spaceBelow = window.innerHeight - rect.bottom
    const dropUp = spaceBelow < 260 && rect.top > spaceBelow
    const room = (dropUp ? rect.top : spaceBelow) - 12
    dropPos = {
      left: rect.left,
      width: rect.width,
      maxHeight: Math.max(120, Math.min(240, room)),
      ...(dropUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    }
  }
  const dropdown = open && dropPos ? createPortal(
    <div ref={dropRef} style={{ ...s.dropdown, ...dropPos }}>
      {loading && <div style={s.msg}>Searching…</div>}
      {!loading && error === 'rate' && <div style={s.msg}>Search rate-limited — wait a moment and try again</div>}
      {!loading && error === 'error' && <div style={s.msg}>Search unavailable</div>}
      {!loading && !error && results.length === 0 && <div style={s.msg}>No courses found</div>}
      {!loading && !error && results.map(r => {
        const sub = [r.course_name && r.course_name !== r.club_name ? r.course_name : null, courseLocation(r)]
          .filter(Boolean).join(' · ')
        return (
          <div
            key={r.id}
            style={s.resultRow}
            onMouseEnter={e => { e.currentTarget.style.background = '#F5F8FA' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}
            onClick={() => selectCourse(r)}
          >
            <div style={s.resultName}>{r.club_name}</div>
            {sub && <div style={s.resultSub}>{sub}</div>}
          </div>
        )
      })}
    </div>,
    document.body,
  ) : null

  return (
    <div style={s.wrap} ref={wrapRef}>
      <input
        type="text"
        style={s.input}
        placeholder={placeholder || 'Search for a course...'}
        value={query}
        onChange={e => { typedRef.current = true; setQuery(e.target.value); onQueryChange?.(e.target.value) }}
        onFocus={() => { if (results.length) { captureRect(); setOpen(true) } }}
      />
      {loadingCourse && <div style={s.loadingCard}>Loading course…</div>}
      {dropdown}
    </div>
  )
}
