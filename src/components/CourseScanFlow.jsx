import { useMemo, useRef, useState } from 'react'
import { fileToImageBlock, extractScorecard, toReview, resizeHoles, blockingIssues, buildCourseData, makeTee } from '../lib/scanCourse'

// "Scan a scorecard" flow — rendered inside the Edit Course modal shell. States:
// choice → upload → loading → review. Extraction runs server-side; nothing is
// saved until the user taps Save Course with an unblocked form. Amber
// "double-check" flags never block save; only orange "missing" cells do.

const INK = '#16213a', NAVY = '#1B3F6E', MUTED = '#8a96a3', BORDER = '#e2e6ec'
const AMBER = '#f2b23d', AMBER_BG = '#fffbf0'
const MISS = '#d97757', MISS_DK = '#b25a41', MISS_BG = '#fdf3f0'

const st = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  hLeft: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
  back: { width: 28, height: 28, borderRadius: '50%', background: '#E8EDF3', border: 'none', color: '#7A8FA6', fontSize: 20, lineHeight: 1, cursor: 'pointer', flexShrink: 0 },
  close: { width: 28, height: 28, borderRadius: '50%', background: '#E8EDF3', border: 'none', color: '#7A8FA6', fontSize: 16, cursor: 'pointer', flexShrink: 0 },
  title: { fontSize: 18, fontWeight: 700, color: INK },
  sub: { fontSize: 13, color: MUTED, marginBottom: 14, lineHeight: 1.5 },
  row: { position: 'relative', display: 'flex', flexDirection: 'column', padding: '15px 14px', border: `1px solid ${NAVY}`, borderRadius: 10, background: '#E8EDF3', cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: 'inherit', marginBottom: 10 },
  rowTitle: { fontSize: 15, fontWeight: 700, color: INK, display: 'flex', alignItems: 'center', gap: 8 },
  rowSub: { fontSize: 13, color: MUTED, marginTop: 3, paddingRight: 44 },
  betaBadge: { position: 'absolute', top: 12, right: 12, fontSize: 9, fontWeight: 800, color: '#fff', background: '#C0392B', borderRadius: 5, padding: '2px 6px', letterSpacing: '0.5px', textTransform: 'uppercase' },
  cta: { width: '100%', padding: 13, background: NAVY, border: 'none', borderRadius: 8, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginTop: 16 },
  ctaDisabled: { width: '100%', padding: 13, background: '#C4CEDA', border: 'none', borderRadius: 8, color: '#fff', fontSize: 15, fontWeight: 700, marginTop: 16, cursor: 'not-allowed', fontFamily: 'inherit' },
  slotLabel: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: MUTED, marginBottom: 6 },
  drop: { border: `2px dashed ${BORDER}`, borderRadius: 10, padding: '26px 12px', textAlign: 'center', cursor: 'pointer', color: NAVY, fontSize: 14, fontWeight: 600, background: '#F8FAFC' },
  thumbWrap: { position: 'relative', borderRadius: 10, overflow: 'hidden', border: `1px solid ${BORDER}` },
  thumb: { display: 'block', width: '100%', maxHeight: 200, objectFit: 'cover' },
  badgeOk: { position: 'absolute', top: 6, left: 6, width: 22, height: 22, borderRadius: '50%', background: '#0F6E56', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800 },
  badgeX: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, lineHeight: 1 },
  addMore: { display: 'block', width: '100%', border: `2px dashed ${BORDER}`, borderRadius: 10, padding: '10px', background: 'none', color: NAVY, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginTop: 12 },
  hint: { fontSize: 11, color: MUTED, marginTop: 6, lineHeight: 1.4, fontStyle: 'italic' },
  center: { textAlign: 'center', padding: '32px 12px' },
  spinner: { width: 34, height: 34, borderRadius: '50%', border: '3px solid rgba(27,63,110,0.2)', borderTopColor: NAVY, margin: '0 auto 14px', animation: 'ptr-spin 0.8s linear infinite' },
  legend: { display: 'flex', gap: 14, alignItems: 'center', background: '#F5F8FA', borderRadius: 8, padding: '7px 10px', marginBottom: 14 },
  legendItem: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: MUTED },
  dot: w => ({ width: 8, height: 8, borderRadius: '50%', background: w }),
  fieldLabel: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: MUTED, marginBottom: 4 },
  input: { width: '100%', border: `1px solid ${BORDER}`, borderRadius: 4, padding: '8px 10px', fontSize: 13, color: NAVY, fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff' },
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: MUTED, margin: '0 0 8px' },
  teeCard: { display: 'grid', gridTemplateColumns: '16px 1fr 1fr 1fr 24px', gap: 8, alignItems: 'center', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px', marginBottom: 8 },
  teeX: { width: 24, height: 24, borderRadius: '50%', background: '#F0F2F5', border: 'none', color: MUTED, fontSize: 14, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'end', marginBottom: 1 },
  addTee: { display: 'block', width: '100%', border: `2px dashed ${BORDER}`, borderRadius: 8, padding: '9px', background: 'none', color: NAVY, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginTop: 2 },
  tabs: { display: 'flex', gap: 0, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden', marginBottom: 10 },
  tab: on => ({ flex: 1, padding: 8, border: 'none', background: on ? NAVY : '#fff', color: on ? '#fff' : MUTED, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }),
  hcell: { fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: MUTED, padding: '2px 4px', textAlign: 'center' },
  warnNote: { background: AMBER_BG, border: `1px solid ${AMBER}`, borderRadius: 8, padding: '10px 12px', marginTop: 14, fontSize: 12.5, color: '#8a6a12', lineHeight: 1.5 },
  errNote: { background: MISS_BG, border: `1px solid ${MISS}`, borderRadius: 8, padding: '10px 12px', marginTop: 14, fontSize: 12.5, color: MISS_DK, lineHeight: 1.5 },
}

// A number cell that flags missing (orange) / low-confidence (amber). Editing
// clears the low flag and, once a value is entered, the missing state.
// `decimal` allows a decimal point (course ratings are e.g. 72.5) — integers
// (par, stroke index, slope) strip to digits. A local text buffer lets a decimal
// like "62." be typed without the trailing dot being parsed away mid-entry.
function NumCell({ value, low, onChange, decimal, width }) {
  const [text, setText] = useState(value == null ? '' : String(value))
  const missing = value == null
  const border = missing ? MISS : low ? AMBER : BORDER
  const bg = missing ? MISS_BG : low ? AMBER_BG : '#fff'
  function handle(e) {
    let v = e.target.value
    if (decimal) {
      v = v.replace(/[^\d.]/g, '')
      const dot = v.indexOf('.')
      if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '') // keep only the first dot
    } else {
      v = v.replace(/[^\d]/g, '')
    }
    setText(v)
    onChange(v === '' || v === '.' ? null : Number(v))
  }
  return (
    <input
      inputMode={decimal ? 'decimal' : 'numeric'} value={text} onChange={handle}
      style={{ ...st.input, width: width || '100%', textAlign: 'center', borderColor: border, background: bg, color: missing ? MISS_DK : NAVY, fontWeight: 600 }}
    />
  )
}

function PhotoSlot({ index, photo, onPick, onRemove }) {
  const ref = useRef(null)
  const onDrop = e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onPick(index, f) }
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={st.slotLabel}>Photo {index + 1}</div>
      {photo ? (
        <div style={st.thumbWrap}>
          <img src={photo.dataUrl} alt={`Scorecard ${index + 1}`} style={st.thumb} />
          <span style={st.badgeOk} aria-hidden="true">✓</span>
          <button style={st.badgeX} onClick={() => onRemove(index)} aria-label="Remove photo">✕</button>
        </div>
      ) : (
        <div
          style={st.drop} onClick={() => ref.current?.click()}
          onDragOver={e => e.preventDefault()} onDrop={onDrop}
        >
          + Add photo or drag one here
          <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) onPick(index, f); e.target.value = '' }} />
        </div>
      )}
    </div>
  )
}

const teeDot = name => {
  const n = (name || '').toLowerCase()
  if (n.includes('blue')) return '#2b6cb0'
  if (n.includes('white')) return '#cbd5e0'
  if (n.includes('red')) return '#c0392b'
  if (n.includes('gold') || n.includes('yellow')) return '#d4a017'
  if (n.includes('black')) return '#111'
  if (n.includes('green')) return '#0F6E56'
  return MUTED
}

function Header({ back, title, onClose }) {
  return (
    <div style={st.header}>
      <div style={st.hLeft}>
        {back && <button style={st.back} onClick={back} aria-label="Back">‹</button>}
        <span style={st.title}>{title}</span>
      </div>
      <button style={st.close} onClick={onClose} aria-label="Close">✕</button>
    </div>
  )
}

export default function CourseScanFlow({ onBack, onClose, onSave, initialReview = null, globalAllowance = 100 }) {
  const editMode = !!initialReview // reopened from Edit Course to correct saved data
  const [step, setStep] = useState(editMode ? 'review' : 'choice')
  const [photos, setPhotos] = useState([]) // sparse array by slot index
  const [slots, setSlots] = useState(1)
  const [rv, setRv] = useState(initialReview)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState(0) // 0 = front, 1 = back (18-hole only)

  const filledPhotos = photos.filter(Boolean)

  async function pick(index, file) {
    setErr('')
    try {
      const block = await fileToImageBlock(file)
      setPhotos(prev => { const n = prev.slice(); n[index] = block; return n })
    } catch (e) { setErr(e.message || 'Could not read that image.') }
  }
  function remove(index) { setPhotos(prev => { const n = prev.slice(); n[index] = undefined; return n }) }

  async function runExtract() {
    setStep('loading'); setErr('')
    try {
      const result = await extractScorecard(filledPhotos)
      setRv(toReview(result, globalAllowance))
      setStep('review')
    } catch (e) { setErr(e.message || 'Extraction failed'); setStep('error') }
  }

  const issues = useMemo(() => (rv ? blockingIssues(rv) : []), [rv])
  const is18 = rv ? rv.holes.length === 18 : false
  const canSave = rv && issues.length === 0

  function patchHole(i, key, val) {
    setRv(v => {
      const holes = v.holes.slice()
      holes[i] = { ...holes[i], [key]: val, ...(key === 'par' ? { parLow: false } : { siLow: false }) }
      return { ...v, holes }
    })
  }
  function patchTee(i, key, val) {
    setRv(v => {
      const tees = v.tees.slice()
      tees[i] = { ...tees[i], [key]: val, ...(key === 'rating' ? { ratingLow: false } : { slopeLow: false }) }
      return { ...v, tees }
    })
  }
  function removeTee(i) {
    setRv(v => ({ ...v, tees: v.tees.filter((_, idx) => idx !== i) }))
  }
  function addTee() {
    setRv(v => ({ ...v, tees: [...v.tees, makeTee({ name: '' })] }))
  }
  function setTotal(n) {
    const total = Math.max(1, Math.min(36, Number(n) || 0))
    setRv(v => ({ ...v, holes: resizeHoles(v.holes, total) }))
    if (total !== 18) setTab(0)
  }

  async function save() {
    if (!canSave || saving) return
    setSaving(true)
    try { await onSave(buildCourseData(rv)) } finally { setSaving(false) }
  }

  // ── choice ──
  if (step === 'choice') {
    return (
      <div>
        <Header back={onBack} title="Add Course" onClose={onClose} />
        <button style={st.row} onClick={() => setStep('upload')}>
          <span style={st.betaBadge}>Beta</span>
          <span style={st.rowTitle}>Scan Scorecard</span>
          <span style={st.rowSub}>Take a photo and we'll fill in the details for you</span>
        </button>
        <button style={st.row} onClick={() => setStep('manual')}>
          <span style={st.rowTitle}>Type It In</span>
          <span style={st.rowSub}>Enter par, ratings and yardages yourself</span>
        </button>
      </div>
    )
  }

  // ── manual (stub — full manual entry is a separate build) ──
  if (step === 'manual') {
    return (
      <div>
        <Header back={() => setStep('choice')} title="Type It In" onClose={onClose} />
        <div style={st.sub}>Manual entry isn't available yet. Use <b>Scan Scorecard</b>, or search for the course from the previous screen.</div>
        <button style={st.cta} onClick={() => setStep('choice')}>Back</button>
      </div>
    )
  }

  // ── upload ──
  if (step === 'upload') {
    return (
      <div>
        <Header back={() => setStep('choice')} title="Scan Scorecard" onClose={onClose} />
        <div style={st.sub}>Add a photo or screenshot of the scorecard and we'll extract the course details automatically. Most scorecards fit in one photo.</div>
        <PhotoSlot index={0} photo={photos[0]} onPick={pick} onRemove={remove} />
        {slots >= 2 && <div style={{ marginTop: 12 }}><PhotoSlot index={1} photo={photos[1]} onPick={pick} onRemove={remove} /></div>}
        {slots < 2 && (
          <>
            <button style={st.addMore} onClick={() => setSlots(2)}>+ Add Another Photo</button>
            <div style={st.hint}>Only if the card is split into two sections — front nine and back nine don't need to line up with the photos.</div>
          </>
        )}
        {err && <div style={st.errNote}>{err}</div>}
        <button style={filledPhotos.length ? st.cta : st.ctaDisabled} disabled={!filledPhotos.length} onClick={runExtract}>Extract Course Data</button>
      </div>
    )
  }

  // ── loading ──
  if (step === 'loading') {
    return (
      <div>
        <Header title="Scan Scorecard" onClose={onClose} />
        <div style={st.center}>
          <div style={st.spinner} />
          <div style={{ fontSize: 15, fontWeight: 700, color: INK }}>Reading scorecard…</div>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 6, lineHeight: 1.5 }}>This usually takes a few seconds. We're pulling par, stroke index, ratings and yardages off the card.</div>
        </div>
      </div>
    )
  }

  // ── error ──
  if (step === 'error') {
    return (
      <div>
        <Header back={() => setStep('upload')} title="Scan Scorecard" onClose={onClose} />
        <div style={st.errNote}>{err || "We couldn't read that scorecard."}</div>
        <button style={st.cta} onClick={() => setStep('upload')}>Try again</button>
      </div>
    )
  }

  // ── review ──
  const holesForTab = is18 ? rv.holes.slice(tab === 0 ? 0 : 9, tab === 0 ? 9 : 18) : rv.holes
  const tabOffset = is18 && tab === 1 ? 9 : 0
  const actualPar = rv.holes.reduce((a, h) => a + (h.par || 0), 0) // sum of hole pars (the displayed par)
  const effectiveHcpPar = rv.handicapParOverridden ? rv.handicapPar : actualPar
  const effectiveAllow = rv.handicapAllowanceOverridden ? rv.handicapAllowance : globalAllowance
  return (
    <div>
      <Header back={() => editMode ? onBack() : setStep('upload')} title={editMode ? 'Edit Course Data' : 'Review Course Data'} onClose={onClose} />
      <div style={st.sub}>{editMode ? 'Update the course details below — ratings, par and stroke index drive scoring and handicaps.' : 'Extracted from your photo — check anything flagged below.'}</div>
      <div style={st.legend}>
        <span style={st.legendItem}><span style={st.dot(AMBER)} />Double-check</span>
        <span style={st.legendItem}><span style={st.dot(MISS)} />Missing</span>
      </div>

      {/* Course info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 118px', gap: 8 }}>
        <div>
          <div style={st.fieldLabel}>Course Name</div>
          <input style={st.input} value={rv.courseName} onChange={e => setRv(v => ({ ...v, courseName: e.target.value }))} placeholder="Not detected — enter manually" />
        </div>
        <div>
          <div style={st.fieldLabel}>Location</div>
          <input style={st.input} value={rv.location} onChange={e => setRv(v => ({ ...v, location: e.target.value }))} placeholder="Not detected — enter manually" />
        </div>
        <div>
          <div style={st.fieldLabel}>Total Holes</div>
          <input inputMode="numeric" value={rv.holes.length}
            onChange={e => setTotal(e.target.value.replace(/[^\d]/g, ''))}
            style={{ ...st.input, textAlign: 'center', borderColor: is18 ? BORDER : AMBER, background: is18 ? '#fff' : AMBER_BG }} />
        </div>
      </div>

      {/* Par (for handicap) — 18-hole-equivalent par used only in the Course
          Handicap formula. Defaults to the sum of hole pars; override for
          short/novelty courses that publish a separate handicap par. */}
      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 118px', gap: 8, alignItems: 'start' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: INK }}>Par (for handicap)</div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 2, lineHeight: 1.4 }}>
            Used only in the Course Handicap formula. Defaults to the sum of hole pars ({actualPar}); override only if this course publishes a separate handicap par.
          </div>
        </div>
        <input
          inputMode="numeric"
          value={effectiveHcpPar == null ? '' : effectiveHcpPar}
          onChange={e => {
            const digits = e.target.value.replace(/[^\d]/g, '')
            const v = digits === '' ? null : Number(digits)
            setRv(cur => ({ ...cur, handicapPar: v, handicapParOverridden: v != null }))
          }}
          style={{ ...st.input, textAlign: 'center', borderColor: rv.handicapParOverridden ? NAVY : BORDER }}
        />
      </div>

      {/* Handicap Allowance % — the share of Course Handicap each player receives
          for rounds at this course. Defaults to the trip-wide allowance; override
          for a short/shotgun course where the standard allowance over-concentrates
          strokes (e.g. a 12-hole course at ~65%). Blank reverts to the default. */}
      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 118px', gap: 8, alignItems: 'start' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: INK }}>Handicap Allowance %</div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 2, lineHeight: 1.4 }}>
            Share of Course Handicap used to set Playing Handicap for rounds here. Defaults to the trip setting ({globalAllowance}%); override for a shortened course. Clear to use the default.
          </div>
        </div>
        <input
          inputMode="numeric"
          value={effectiveAllow == null ? '' : effectiveAllow}
          onChange={e => {
            const digits = e.target.value.replace(/[^\d]/g, '')
            const v = digits === '' ? null : Number(digits)
            setRv(cur => ({ ...cur, handicapAllowance: v, handicapAllowanceOverridden: v != null }))
          }}
          style={{ ...st.input, textAlign: 'center', borderColor: rv.handicapAllowanceOverridden ? NAVY : BORDER }}
        />
      </div>

      {/* Tees */}
      <div style={st.section}>
        <div style={st.sectionTitle}>Tees</div>
        {rv.tees.length === 0 && <div style={{ fontSize: 12, color: MUTED, fontStyle: 'italic', marginBottom: 8 }}>No tees — add the one(s) your group plays below.</div>}
        {rv.tees.map((t, i) => (
          <div key={t._uid ?? i} style={st.teeCard}>
            <span style={st.dot(teeDot(t.name))} />
            <input style={st.input} value={t.name} onChange={e => patchTee(i, 'name', e.target.value)} placeholder="Tee" />
            <div><div style={st.fieldLabel}>Rating</div><NumCell value={t.rating} low={t.ratingLow} decimal onChange={v => patchTee(i, 'rating', v)} /></div>
            <div><div style={st.fieldLabel}>Slope</div><NumCell value={t.slope} low={t.slopeLow} onChange={v => patchTee(i, 'slope', v)} /></div>
            <button style={st.teeX} onClick={() => removeTee(i)} aria-label={`Remove ${t.name || 'tee'}`} title="Remove tee">✕</button>
          </div>
        ))}
        <button style={st.addTee} onClick={addTee}>+ Add Tee</button>
      </div>

      {/* Holes */}
      <div style={st.section}>
        <div style={st.sectionTitle}>Holes</div>
        {is18 && (
          <div style={st.tabs}>
            <button style={st.tab(tab === 0)} onClick={() => setTab(0)}>Holes 1–9</button>
            <button style={st.tab(tab === 1)} onClick={() => setTab(1)}>Holes 10–18</button>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
          <div style={st.hcell}>Hole</div><div style={st.hcell}>Par</div><div style={st.hcell}>S.I.</div>
          {holesForTab.map((h, idx) => {
            const i = tabOffset + idx
            return (
              <div key={h.hole_number} style={{ display: 'contents' }}>
                <div style={{ ...st.hcell, fontSize: 13, color: INK, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{h.hole_number}</div>
                <NumCell value={h.par} low={h.parLow} onChange={v => patchHole(i, 'par', v)} />
                <NumCell value={h.stroke_index} low={h.siLow} onChange={v => patchHole(i, 'stroke_index', v)} />
              </div>
            )
          })}
        </div>
      </div>

      {/* Amber nudge — hole count off 18 (does NOT block save) */}
      {!is18 && (
        <div style={st.warnNote}>This looks like a {rv.holes.length}-hole course — double-check the hole count above. You can still save.</div>
      )}
      {/* Blocking issues (orange/missing) */}
      {issues.length > 0 && (
        <div style={st.errNote}>{issues.map((m, i) => <div key={i}>{m}</div>)}</div>
      )}

      <button style={canSave && !saving ? st.cta : st.ctaDisabled} disabled={!canSave || saving} onClick={save}>
        {saving ? 'Saving…' : 'Save Course'}
      </button>
    </div>
  )
}
