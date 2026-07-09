// Tee labelling shared by course setup (CourseSearchInput) and per-player tee
// selection (MenuDrawer). Gender is kept in the data but never shown as a label
// on its own — the app only cares which tee box you play from. The one exception
// is a genuine collision: the SAME colour exists for both men and women with a
// DIFFERENT course rating/slope (standard WHS — ratings are gender-specific). In
// that case a minimal "(M)"/"(W)" qualifier is added so the two distinct tees
// don't render as identical duplicates.

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
//   • colour present for both genders with differing rating/slope → "White (M)" /
//     "White (W)"; falls back to a rating suffix ("White · 71.8") when the
//     collision carries no gender info (e.g. legacy cached data).
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
    for (const t of uniq) {
      let label = color
      if (collision) {
        const abbr = genderAbbr(t.gender)
        label = abbr ? `${color} (${abbr})` : `${color} · ${teeRating(t) ?? teeSlope(t) ?? ''}`.trim()
      }
      out.push({ ...t, color, label })
    }
  }
  return out
}
