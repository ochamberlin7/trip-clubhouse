import { useEffect, useRef, useState } from 'react'
import Icon from './ui/Icon'
import { searchCourses, getCourseDetails } from '../lib/courseApi'
import { labelTees } from '../lib/tees'

// Suggestion-list height cap; longer lists scroll inside it.
const DROPDOWN_MAX = 240

// Self-contained course typeahead → tee picker.
// Phase 1: debounced search with the results list rendered in place, directly
//          under the input (normal flow, full width), so it can never detach.
// Phase 2: selected-course card + a single tee grid, then "Add". Tees show only
//          the colour/name — no men's/women's heading — with a minimal (M)/(W)
//          qualifier only where a colour collides across genders (see lib/tees).

// Tee color coding by name.
// Neutral style shared by every tee option; only the selected tee is
// highlighted (see the render). Tee names like "Black"/"Blue" are labels, not
// theming — they must not drive the box color.
const TEE_NEUTRAL = { background: 'var(--paper-2)', color: 'var(--ink)', border: '1px solid var(--line)' }
const TEE_SELECTED = { background: 'var(--primary)', color: '#fff', border: '1px solid var(--primary)' }

const s = {
  input: { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--line)', background: '#fff', fontSize: '14px', color: 'var(--ink)', fontFamily: 'inherit', outline: 'none' },
  // In normal flow right under the input. It used to be portaled with
  // position:fixed, but on iOS the keyboard shifts the visual viewport and the
  // fixed list landed at the top of the screen, far from the field. In flow it
  // moves with the input and takes part in its container's height and scroll.
  wrap: { position: 'relative', scrollMarginTop: '16px' },
  dropdown: { marginTop: '4px', background: '#fff', border: '1px solid var(--line)', borderRadius: '4px', maxHeight: `${DROPDOWN_MAX}px`, overflowY: 'auto', WebkitOverflowScrolling: 'touch' },
  resultRow: { padding: '12px 14px', borderBottom: '1px solid var(--paper-2)', cursor: 'pointer', background: '#fff' },
  resultName: { fontSize: '14px', fontWeight: 600, color: 'var(--ink)' },
  resultSub: { fontSize: '12px', color: 'var(--slate)', marginTop: '1px' },
  msg: { padding: '12px 14px', fontSize: '13px', color: 'var(--slate)', fontStyle: 'italic' },
  selectedCard: { background: 'var(--paper-2)', borderRadius: '8px', padding: '12px 14px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' },
  selName: { fontSize: '14px', fontWeight: 600, color: 'var(--ink)' },
  selSub: { fontSize: '12px', color: 'var(--slate)', marginTop: '1px' },
  clearBtn: { background: 'none', border: 'none', color: 'var(--slate)', fontSize: '18px', cursor: 'pointer', flexShrink: 0, lineHeight: 1, padding: 0 },
  teeLabel: { fontSize: '12px', textTransform: 'uppercase', color: 'var(--slate)', letterSpacing: '0.8px', marginBottom: '8px' },
  sectionHeader: { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--slate)', marginBottom: '6px' },
  teeGrid: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' },
  teeBtn: { borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', textAlign: 'left', minWidth: '92px', transition: 'transform 0.1s' },
  teeName: { fontSize: '13px', fontWeight: 700 },
  teeMeta: { fontSize: '10px', opacity: 0.85, marginTop: '2px' },
  confirm: { width: '100%', padding: '12px', borderRadius: '8px', border: 'none', background: 'var(--primary)', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  loadingCard: { padding: '14px', fontSize: '13px', color: 'var(--slate)', textAlign: 'center' },
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
  const [tees, setTees] = useState([])            // labelled tee boxes (men's + women's, deduped)
  const [selectedTee, setSelectedTee] = useState(null)
  const [loadingCourse, setLoadingCourse] = useState(false)
  const wrapRef = useRef(null)
  const dropRef = useRef(null)
  const typedRef = useRef(false) // only search after the user actively types

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
        setOpen(true)
      } catch (err) {
        setError(err?.status === 429 ? 'rate' : 'error')
        setResults([]); setOpen(true)
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [query, course])

  // When the list opens, make sure it's visible. On a phone the keyboard covers
  // the bottom of the screen, so if the list wouldn't fit between the input and
  // the bottom of the visible area, scroll the field to the top of its scroll
  // container. Runs once per open, not on every keystroke.
  useEffect(() => {
    if (!open) return
    const el = wrapRef.current
    if (!el) return
    const vv = window.visualViewport
    const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight
    const spaceBelow = visibleBottom - el.getBoundingClientRect().bottom
    if (spaceBelow < DROPDOWN_MAX + 8) {
      el.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
  }, [open])

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
    // Tag each tee with its gender, then collapse to one grid — labelTees marks
    // only the women's box "(W)" where a colour exists for both genders with a
    // different rating/slope, so distinct tees never look like duplicates.
    const male = (full?.tees?.male || []).map(t => ({ ...t, gender: 'male' }))
    const female = (full?.tees?.female || []).map(t => ({ ...t, gender: 'female' }))
    const labelled = labelTees([...male, ...female])
    setTees(labelled)
    // Auto-select the first available tee so "Add This Course" is never blocked
    // (the button is disabled until a tee is selected).
    setSelectedTee(labelled[0] || null)
    setLoadingCourse(false)
  }

  function clearSelection() {
    setCourse(null)
    setTees([])
    setSelectedTee(null)
    setResults([])
  }

  // Hand the full selection to the parent and let it decide what happens next
  // (e.g. the edit flow saves and closes the modal). No internal confirmation UI.
  function confirm() {
    console.log('[CourseSearchInput] Add This Course clicked; selectedTee =', selectedTee)
    if (!selectedTee) return
    const loc = course.location || {}
    // Cache every available tee (men's + women's) so per-player tee selection in
    // Commissioner Tools can offer them all. Normalised to {name,slope,rating,par,
    // gender}; `name` is the display label (colour, plus a (M)/(W) qualifier only
    // on a gender collision) and gender is retained for future re-labelling.
    const allTees = tees
      .filter(t => t && t.label)
      .map(t => ({ name: t.label, slope: t.slope_rating, rating: t.course_rating, par: t.par_total, gender: t.gender ?? null }))
    onCourseSelected({
      golfcourse_id: course.id,
      club_name: course.club_name,
      course_name: course.course_name,
      location: courseLocation(course),
      location_city: loc.city ?? null,
      location_state: loc.state ?? null,
      location_lat: loc.latitude ?? null,
      location_lon: loc.longitude ?? null,
      tee_name: selectedTee.label,
      course_rating: selectedTee.course_rating,
      slope_rating: selectedTee.slope_rating,
      par_total: selectedTee.par_total,
      number_of_holes: selectedTee.number_of_holes || 18,
      holes: selectedTee.holes,
      tees: allTees,
    })
    setOpen(false)
  }

  // One grid, no gender heading — the colour chip uses the gender-stripped colour
  // so "White (W)" still renders as a white swatch; the button label carries the
  // (M)/(W) qualifier only on a collision.
  function TeeGrid({ tees }) {
    if (!tees || tees.length === 0) return null
    return (
      <div style={s.teeGrid}>
        {tees.map((tee, i) => {
          const active = selectedTee === tee
          return (
            <button
              key={`${tee.label}-${i}`}
              style={{
                ...s.teeBtn, ...(active ? TEE_SELECTED : TEE_NEUTRAL),
                boxShadow: active ? '0 0 0 2px var(--primary)' : 'none',
                transform: active ? 'scale(1.03)' : 'none',
              }}
              onClick={() => setSelectedTee(tee)}
            >
              <div style={s.teeName}>{tee.label}</div>
              <div style={s.teeMeta}>Rating: {tee.course_rating} / Slope: {tee.slope_rating}</div>
            </button>
          )
        })}
      </div>
    )
  }

  // ── Phase 2: tee selection ──
  if (course) {
    const hasTees = tees.length > 0
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
          <button style={s.clearBtn} onClick={clearSelection} aria-label="Clear selection"><Icon name="close" size={14} /></button>
        </div>

        <div style={s.teeLabel}>Select tees</div>
        {!hasTees ? (
          <div style={s.msg}>No tee data available for this course.</div>
        ) : (
          <TeeGrid tees={tees} />
        )}

        <button style={{ ...s.confirm, opacity: selectedTee ? 1 : 0.4, cursor: selectedTee ? 'pointer' : 'not-allowed' }}
          onClick={confirm} disabled={!selectedTee}>
          Add This Course
        </button>
      </div>
    )
  }

  // ── Phase 1: search ──
  const dropdown = open ? (
    <div ref={dropRef} style={s.dropdown} role="listbox" aria-label="Course results">
      {loading && <div style={s.msg}>Searching…</div>}
      {!loading && error === 'rate' && <div style={s.msg}>Search is rate-limited. Wait a moment and try again.</div>}
      {!loading && error === 'error' && <div style={s.msg}>Search unavailable</div>}
      {!loading && !error && results.length === 0 && <div style={s.msg}>No courses found</div>}
      {!loading && !error && results.map(r => {
        const sub = [r.course_name && r.course_name !== r.club_name ? r.course_name : null, courseLocation(r)]
          .filter(Boolean).join(' · ')
        return (
          <div
            key={r.id}
            style={s.resultRow}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--paper-2)' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}
            // onMouseDown + preventDefault: fires before the input blurs, so the
            // list doesn't unmount out from under the tap (onClick does nothing on
            // mobile here). preventDefault keeps focus off the input during select.
            onMouseDown={e => { e.preventDefault(); selectCourse(r) }}
          >
            <div style={s.resultName}>{r.club_name}</div>
            {sub && <div style={s.resultSub}>{sub}</div>}
          </div>
        )
      })}
    </div>
  ) : null

  return (
    <div style={s.wrap} ref={wrapRef}>
      <input
        type="text"
        style={s.input}
        placeholder={placeholder || 'Search for a course...'}
        value={query}
        onChange={e => { typedRef.current = true; setQuery(e.target.value); onQueryChange?.(e.target.value) }}
        onFocus={() => { if (results.length) setOpen(true) }}
      />
      {dropdown}
      {loadingCourse && <div style={s.loadingCard}>Loading course…</div>}
    </div>
  )
}
