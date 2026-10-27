// Ranked rows for a stat leaderboard. Standard competition ranking: players with
// the same value share a rank and the next rank skips (1, 2, 2, 4). Players with
// no value (null) go last with rank null. Ties list A–Z by `nameOf`.
//   items:   anything (players);  valueOf(item) → number | null
//   hi:      true = higher is better
export function rankRows(items, valueOf, { hi = true, nameOf = () => '' } = {}) {
  const rows = items.map(item => ({ item, v: valueOf(item) }))
  rows.sort((a, b) => {
    if (a.v == null && b.v == null) return nameOf(a.item).localeCompare(nameOf(b.item))
    if (a.v == null) return 1
    if (b.v == null) return -1
    if (a.v !== b.v) return hi ? b.v - a.v : a.v - b.v
    return nameOf(a.item).localeCompare(nameOf(b.item))
  })
  let rank = 0
  rows.forEach((r, i) => {
    if (r.v == null) { r.rank = null; return }
    if (i === 0 || r.v !== rows[i - 1].v) rank = i + 1
    r.rank = rank
  })
  return rows
}
