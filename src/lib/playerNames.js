// Short player names for leaderboards — one rule everywhere (Daily Leaders, Stats):
// first name only ("Jeff"); when two or more players on the trip share that first
// name, add the last initial ("Mike S.", "Mike T.") so nobody is ambiguous.

export const firstWord = name => (name || '').trim().split(/\s+/)[0] || ''

function firstAndInitial(name) {
  const parts = (name || '').trim().split(/\s+/)
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0] || ''
}

// rosterNames: every player's full name on the trip. Returns name => short name.
export function shortNameResolver(rosterNames = []) {
  const counts = new Map()
  for (const n of rosterNames) {
    const f = firstWord(n).toLowerCase()
    if (f) counts.set(f, (counts.get(f) || 0) + 1)
  }
  return name => (counts.get(firstWord(name).toLowerCase()) > 1 ? firstAndInitial(name) : firstWord(name))
}
