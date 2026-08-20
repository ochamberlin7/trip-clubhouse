// Tee labelling shared by course setup (CourseSearchInput) and per-player tee
// selection (MenuDrawer). Gender is kept in the data but never shown as a label
// on its own — the app only cares which tee box you play from. The one exception
// is a genuine collision: the SAME colour exists for both men and women with a
// DIFFERENT course rating/slope (standard WHS — ratings are gender-specific). In
// that case ONLY the women's box is marked "(W)"; men's boxes are never marked
// "(M)" (most players are men, so the unqualified colour reads as men's). If two
// same-gender boxes still collide, a rating suffix disambiguates them.

// "Men's Gold" / "Women's Gold" / "Gold (W)" → "Gold".
export function stripTeeGender(name) {
  return String(name || '')
    .replace(/\b(men['’]?s?|women['’]?s?|ladies|mens|womens|male|female)\b/gi, '')
    .replace(/\((?:m|w|men|women|male|female)\)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// Tolerant field readers — call sites pass either the GolfCourseAPI raw shape
// ({tee_name, course_rating, slope_rating}) or the normalised cache shape
// ({name, rating, slope}).
const teeRawName = t => t?.name ?? t?.tee_name ?? ''
const teeRating = t => t?.rating ?? t?.course_rating ?? null
const teeSlope = t => t?.slope ?? t?.slope_rating ?? null
const genderAbbr = g => {
  const v = String(g || '').toLowerCase()
  if (v === 'female' || v === 'women' || v === 'w' || v === 'f') return 'W'
  if (v === 'male' || v === 'men' || v === 'm') return 'M'
  return null
}

// Collapse a tee list to one entry per distinct box and attach a display `label`
// and a gender-stripped `color`, preserving every other field (rating, slope,
// par, holes, gender, …) untouched:
//   • non-colliding colour → clean label ("White")
//   • colour present for both genders with differing rating/slope → men's stays
//     "White", women's becomes "White (W)". Any remaining duplicate labels (rare
//     same-gender collision) fall back to a rating suffix ("White · 71.8").
// Identical boxes (same gender + rating + slope) are de-duplicated to one.
export function labelTees(tees) {
  const list = (Array.isArray(tees) ? tees : []).filter(t => t && teeRawName(t))

  // Group by gender-stripped colour (case-insensitive), preserving first-seen order.
  const groups = new Map()
  for (const t of list) {
    const color = stripTeeGender(teeRawName(t)) || teeRawName(t)
    const key = color.toLowerCase()
    if (!groups.has(key)) groups.set(key, { color, items: [] })
    groups.get(key).items.push({ ...t, color })
  }

  const out = []
  for (const { color, items } of groups.values()) {
    // Drop exact-duplicate boxes (same gender + rating + slope).
    const uniq = []
    const seen = new Set()
    for (const t of items) {
      const sig = `${String(t.gender || '').toLowerCase()}|${teeRating(t) ?? ''}|${teeSlope(t) ?? ''}`
      if (seen.has(sig)) continue
      seen.add(sig)
      uniq.push(t)
    }
    const collision = uniq.length > 1
    // Only women's boxes get a "(W)" qualifier; men's/unknown stay the bare colour.
    const labeled = uniq.map(t => {
      const abbr = genderAbbr(t.gender)
      const label = (collision && abbr === 'W') ? `${color} (W)` : color
      return { ...t, color, label }
    })
    // Guard against identical labels (e.g. two same-gender boxes that collide, or
    // a man + gender-unknown box): disambiguate with a rating suffix — never "(M)".
    const counts = {}
    labeled.forEach(t => { counts[t.label] = (counts[t.label] || 0) + 1 })
    for (const t of labeled) {
      if (counts[t.label] > 1) {
        const r = teeRating(t) ?? teeSlope(t) ?? ''
        if (r !== '') t.label = `${color} · ${r}`
      }
      out.push(t)
    }
  }
  return out
}
