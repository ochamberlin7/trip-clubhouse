const PROXY_BASE = '/.netlify/functions/golf-course-proxy';
const DIRECT_BASE = 'https://api.golfcourseapi.com';

// GolfCourseAPI matches the query as a literal, case-insensitive substring of the
// course name — hyphens and other punctuation are matched as-is (e.g. "ak-chin"
// matches "Ak-Chin Southern Dunes", but "ak chin" does not). So DON'T rewrite
// hyphens to spaces or strip punctuation — that turns matching queries into
// non-matching ones. The only cleanup: drop a leading article ("the"/"a"/"an"),
// which never appears mid-name and otherwise breaks the substring match
// (e.g. "the raven golf club" → 0, but "raven golf club" → the real results).
function normalizeQuery(query) {
  return query
    .replace(/^\s*(?:the|a|an)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// One API call for a single (already-normalized) query. Proxy first (works on
// netlify dev + production, keeps the key server-side), then a direct call with
// VITE_GOLF_API_KEY (works on plain `npm run dev`).
async function runSearch(searchQuery) {
  try {
    const res = await fetch(`${PROXY_BASE}?endpoint=search&search_query=${encodeURIComponent(searchQuery)}`);
    if (res.ok) {
      const data = await res.json();
      return data.courses || [];
    }
  } catch {
    // proxy not available — fall through to direct
  }

  const key = import.meta.env.VITE_GOLF_API_KEY;
  if (!key) throw new Error('No API key');
  const res = await fetch(
    `${DIRECT_BASE}/v1/search?search_query=${encodeURIComponent(searchQuery)}`,
    { headers: { Authorization: `Key ${key}` } }
  );
  if (!res.ok) throw new Error('Search failed');
  const data = await res.json();
  return data.courses || [];
}

export async function searchCourses(query) {
  const normalized = normalizeQuery(query);
  if (!normalized || normalized.length < 2) return [];

  const courses = await runSearch(normalized);
  if (courses.length > 0) return courses;

  // Dual-query fallback: the API matches literally, so a space where the real
  // name has a hyphen (or vice-versa) matches nothing — e.g. "ak chin" misses
  // "Ak-Chin". Only when the literal query found nothing, retry with spaces and
  // hyphens swapped and merge the results (dedup by id).
  const variants = [normalized.replace(/ /g, '-'), normalized.replace(/-/g, ' ')]
    .filter(v => v !== normalized);
  const seen = new Set();
  const merged = [];
  for (const v of variants) {
    for (const c of await runSearch(v)) {
      if (!seen.has(c.id)) { seen.add(c.id); merged.push(c); }
    }
  }
  return merged;
}

export async function getCourseDetails(id) {
  let data;

  try {
    const res = await fetch(`${PROXY_BASE}?endpoint=course&id=${id}`);
    if (res.ok) data = await res.json();
  } catch {
    // proxy not available — fall through to direct
  }

  if (!data) {
    const key = import.meta.env.VITE_GOLF_API_KEY;
    if (!key) throw new Error('No API key');
    const res = await fetch(`${DIRECT_BASE}/v1/courses/${id}`, {
      headers: { Authorization: `Key ${key}` },
    });
    if (!res.ok) throw new Error('Course fetch failed');
    data = await res.json();
  }

  // eslint-disable-next-line no-console
  console.log('[getCourseDetails] raw response:', data);
  // The API wraps the course as { course: { ...tees } }; unwrap it.
  return data.course || data;
}
