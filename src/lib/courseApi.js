const PROXY_BASE = '/.netlify/functions/golf-course-proxy';

function normalizeQuery(query) {
  return query
    .replace(/[-_]/g, ' ')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function searchCourses(query) {
  const normalized = normalizeQuery(query);
  if (!normalized || normalized.length < 2) return [];
  const res = await fetch(
    `${PROXY_BASE}?endpoint=search&search_query=${encodeURIComponent(normalized)}`
  );
  if (!res.ok) throw new Error('Search failed');
  const data = await res.json();
  return data.courses || [];
}

export async function getCourseDetails(id) {
  const res = await fetch(`${PROXY_BASE}?endpoint=course&id=${id}`);
  if (!res.ok) throw new Error('Course fetch failed');
  return res.json();
}
