// Display-only US phone formatting. The stored/canonical value is always raw
// digits (see Signup.jsx, ProfilePage) — this just prettifies for display:
// 10 digits (or 11 with a leading country-code 1) → "(555) 123-4567".
// Anything else is returned trimmed, unchanged, so partial input still shows.
export function formatPhone(raw) {
  const trimmed = (raw || '').trim()
  let d = trimmed.replace(/\D/g, '')
  if (d.length === 11 && d[0] === '1') d = d.slice(1)
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  return trimmed
}
