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

// Extraction result → editable review state.
export function toReview(result) {
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
  const tees = (result?.tees || []).map(t => ({
    name: (t.name || '').trim() || 'Tee',
    rating: numOrNull(t.rating),
    slope: numOrNull(t.slope),
    ratingLow: low.has(`tee_${t.name}.rating`),
    slopeLow: low.has(`tee_${t.name}.slope`),
  }))
  return { courseName: result?.course_name || '', location: result?.location || '', holes, tees }
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
    number_of_holes: holes.length,
    location_city: city,
    location_state: state,
  }
}
