const PROXY_BASE = '/.netlify/functions/golf-course-proxy';
const DIRECT_BASE = 'https://api.golfcourseapi.com';

function normalizeQuery(query) {
  return query
    .replace(/[-_]/g, ' ')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Proxy first (works on netlify dev + production, keeps the key server-side),
// then a direct call with VITE_GOLF_API_KEY (works on plain `npm run dev`).
export async function searchCourses(query) {
  const normalized = normalizeQuery(query);
  if (!normalized || normalized.length < 2) return [];

  try {
    const res = await fetch(`${PROXY_BASE}?endpoint=search&search_query=${encodeURIComponent(normalized)}`);
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
    `${DIRECT_BASE}/v1/search?search_query=${encodeURIComponent(normalized)}`,
    { headers: { Authorization: `Key ${key}` } }
  );
  if (!res.ok) throw new Error('Search failed');
  const data = await res.json();
  return data.courses || [];
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
