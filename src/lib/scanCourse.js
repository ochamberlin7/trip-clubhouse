// Client helpers for the "scan a scorecard" feature. Images are re-encoded to
// JPEG via canvas before upload — this normalises HEIC (iOS camera) and PNG/WEBP
// screenshots to a format the vision API accepts, and downscales to keep well
// under the 10MB cap. The base64 payload is sent to the server-side Netlify
// function, which holds the Anthropic key and does the extraction.

const ENDPOINT = '/.netlify/functions/scan-scorecard'
const MAX_DIM = 2200 // px on the long edge — plenty for legibility, keeps size down

// File → { media_type: 'image/jpeg', data: <base64>, dataUrl } via a canvas
// re-encode. Rejects if the browser can't decode the image (rare desktop HEIC).
export function fileToImageBlock(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('Canvas unavailable')); return }
      ctx.drawImage(img, 0, 0, w, h)
      let dataUrl
      try { dataUrl = canvas.toDataURL('image/jpeg', 0.9) } catch { reject(new Error('Could not process image')); return }
      const data = dataUrl.split(',')[1] || ''
      resolve({ media_type: 'image/jpeg', data, dataUrl })
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That image couldn't be read — try a JPG or PNG.")) }
    img.src = url
  })
}

// POST the images to the extraction function. Returns the raw extraction JSON.
export async function extractScorecard(imageBlocks) {
  const images = imageBlocks.map(b => ({ media_type: b.media_type, data: b.data }))
  let res
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images }),
    })
  } catch {
    throw new Error('Network error — check your connection and try again.')
  }
  let body = {}
  try { body = await res.json() } catch { /* fall through */ }
  if (!res.ok) throw new Error(body?.error || `Extraction failed (${res.status})`)
  return body
}

const numOrNull = v => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))

// Stable per-tee identity for React keys. Tees have no natural id and can be
// removed/re-added on the review screen; keying by array index would let a
// NumCell (which caches its text in local state) show a stale rating/slope after
// a removal shifts indices. A monotonic uid keeps each card's state pinned to
// its data. Exported so the review screen can mint one for a freshly added tee.
let _teeUid = 0
export const makeTee = (props = {}) => ({
  _uid: `tee${_teeUid++}`, name: '', rating: null, slope: null, ratingLow: false, slopeLow: false, ...props,
})

// Models sometimes write the literal string "null" / "none" / "n/a" into a
// string field instead of JSON null — treat those (and blanks) as empty so they
// never render or save as text.
const cleanStr = v => {
  const s = (v == null ? '' : String(v)).trim()
  return /^(null|none|n\/a|undefined|-)$/i.test(s) ? '' : s
}

// Extraction result → editable review state. `globalAllowance` seeds the
// Handicap Allowance % field (scans never read an allowance off the card, so it
// always starts at the trip default until the user overrides it).
export function toReview(result, globalAllowance = 100) {
  const low = new Set(result?.low_confidence_fields || [])
  const holes = (result?.holes || [])
    .slice()
    .sort((a, b) => (a.hole_number || 0) - (b.hole_number || 0))
    .map((h, i) => ({
      hole_number: h.hole_number ?? i + 1,
      par: numOrNull(h.par),
      stroke_index: numOrNull(h.stroke_index),
      parLow: low.has(`hole_${h.hole_number}.par`),
      siLow: low.has(`hole_${h.hole_number}.stroke_index`),
    }))
  holes.forEach((h, i) => { h.hole_number = i + 1 })
  const tees = (result?.tees || []).map(t => makeTee({
    name: cleanStr(t.name) || 'Tee',
    rating: numOrNull(t.rating),
    slope: numOrNull(t.slope),
    ratingLow: low.has(`tee_${t.name}.rating`),
    slopeLow: low.has(`tee_${t.name}.slope`),
  }))
  const actualPar = holes.reduce((a, h) => a + (h.par ?? 0), 0)
  const hp = numOrNull(result?.handicap_par)
  return {
    courseName: cleanStr(result?.course_name), location: cleanStr(result?.location), holes, tees,
    handicapPar: hp != null ? hp : actualPar,
    handicapParOverridden: hp != null && hp !== actualPar,
    handicapAllowance: globalAllowance,
    handicapAllowanceOverridden: false,
  }
}

// A saved round's inline course data → the review shape, so the Review screen can
// reopen an already-saved course for correction (bad scan, typo, later update).
// Inverse of buildCourseData: round.holes stores stroke index as `handicap`.
export function roundToReview(round, globalAllowance = 100) {
  const holes = (Array.isArray(round?.holes) ? round.holes : []).map((h, i) => ({
    hole_number: i + 1,
    par: numOrNull(h?.par),
    stroke_index: numOrNull(h?.handicap ?? h?.stroke_index),
    parLow: false, siLow: false,
  }))
  const tees = (Array.isArray(round?.tees) ? round.tees : []).map(t => makeTee({
    name: cleanStr(t?.name) || 'Tee',
    rating: numOrNull(t?.rating),
    slope: numOrNull(t?.slope),
  }))
  // No cached tees array but a round-level default rating/slope exists → seed one.
  if (tees.length === 0 && (round?.course_rating != null || round?.slope_rating != null)) {
    tees.push(makeTee({ name: cleanStr(round?.tee_name) || 'Default', rating: numOrNull(round?.course_rating), slope: numOrNull(round?.slope_rating) }))
  }
  const courseName = cleanStr(round?.club_name) || cleanStr(round?.course_name)
  const location = [cleanStr(round?.location_city), cleanStr(round?.location_state)].filter(Boolean).join(', ')
  const actualPar = holes.reduce((a, h) => a + (h.par || 0), 0)
  const savedHcpPar = numOrNull(round?.handicap_par)
  const savedAllowance = numOrNull(round?.handicap_allowance)
  return {
    courseName, location, holes, tees,
    handicapPar: savedHcpPar != null ? savedHcpPar : actualPar,
    handicapParOverridden: savedHcpPar != null && savedHcpPar !== actualPar,
    // A saved override wins; otherwise the field shows the trip default and is
    // treated as un-overridden (so it keeps tracking the global until changed).
    handicapAllowance: savedAllowance != null ? savedAllowance : globalAllowance,
    handicapAllowanceOverridden: savedAllowance != null,
  }
}

// Grow/shrink the holes list to `n` (Total Holes edit). Preserves existing rows.
export function resizeHoles(holes, n) {
  const next = holes.slice(0, n)
  for (let i = next.length; i < n; i++) next.push({ hole_number: i + 1, par: null, stroke_index: null, parLow: false, siLow: false })
  next.forEach((h, i) => { h.hole_number = i + 1 })
  return next
}

// Blocking issues (orange/missing). Amber/double-check never appears here.
export function blockingIssues(rv) {
  const issues = []
  const missPar = rv.holes.filter(h => h.par == null).map(h => h.hole_number)
  const missSI = rv.holes.filter(h => h.stroke_index == null).map(h => h.hole_number)
  if (missPar.length) issues.push(`Add par for hole${missPar.length > 1 ? 's' : ''} ${missPar.join(', ')} before saving.`)
  if (missSI.length) issues.push(`Hole${missSI.length > 1 ? 's' : ''} ${missSI.join(', ')} stroke index wasn't legible — fill ${missSI.length > 1 ? 'them' : 'it'} in before saving.`)
  const present = rv.holes.map(h => h.stroke_index).filter(v => v != null)
  if (new Set(present).size !== present.length) issues.push('Stroke index values must each be unique.')
  if (!rv.tees.some(t => t.rating != null && t.slope != null)) issues.push('At least one tee needs both a rating and a slope.')
  return issues
}

function splitLocation(loc) {
  const s = (loc || '').trim()
  if (!s) return [null, null]
  const parts = s.split(',').map(p => p.trim()).filter(Boolean)
  if (parts.length >= 2) return [parts.slice(0, -1).join(', '), parts[parts.length - 1]]
  return [s, null]
}

// Review state → the courseData shape saveCourseEdit expects (inline round fields).
// holes: [{par, handicap(=stroke index), yardage}]; tees: [{name, rating, slope, par}].
export function buildCourseData(rv) {
  const holes = rv.holes.map(h => ({ par: h.par, handicap: h.stroke_index, yardage: null }))
  const par_total = holes.reduce((a, h) => a + (h.par || 0), 0)
  const tees = rv.tees.map(t => ({ name: t.name, rating: t.rating, slope: t.slope, par: par_total }))
  const primary = rv.tees.find(t => t.rating != null && t.slope != null) || rv.tees[0] || null
  const [city, state] = splitLocation(rv.location)
  const name = (rv.courseName || '').trim() || 'Course'
  // Handicap par (18-hole-equivalent) is stored only when the user overrode it to
  // a value that differs from the actual par — NULL keeps normal courses on the
  // actual-par fallback. When not overridden it tracks the live hole-par sum.
  const hp = (rv.handicapParOverridden && rv.handicapPar != null) ? Number(rv.handicapPar) : par_total
  const handicap_par = (Number.isFinite(hp) && hp !== par_total) ? hp : null
  // Handicap allowance % is stored only when overridden — NULL keeps the round on
  // the trip-wide default (resolved via effectiveAllowance at calc time).
  const ha = rv.handicapAllowanceOverridden && rv.handicapAllowance != null ? Number(rv.handicapAllowance) : null
  const handicap_allowance = Number.isFinite(ha) ? ha : null
  return {
    golfcourse_id: null,
    club_name: name,
    course_name: name,
    tee_name: primary?.name ?? null,
    course_rating: primary?.rating ?? null,
    slope_rating: primary?.slope ?? null,
    holes,
    tees,
    par_total,
    handicap_par,
    handicap_allowance,
    number_of_holes: holes.length,
    location_city: city,
    location_state: state,
  }
}
