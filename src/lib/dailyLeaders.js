// Daily Leaders — one page per trip day that has at least one completed round
// (tournament or practice), with the day's leader in each category. Pure (no
// React, no Supabase); all the math reuses the shared functions:
//   • completeness              → analyzeScoring (scoring.js)
//   • Most Points               → matchPlayPointsByPlayer (scoring.js; tournament
//                                 rounds only — practice rounds aren't matches)
//   • best/worst round, birdies, pars, bogeys, doubles+ → computePlayerStats
//                                 (playerStats.js), gross and net, off-the-low strokes
//   • fire holes / fire streak  → computePlayerStats (net only, via fireStatsByPlayer)
// Each day says whether its rounds were practice (day.practice).
// Stableford / Stroke Play trips (opts.gameType): no matches, so Points Defended is
// left out; "Most Points" is net Stableford points (Stableford) or left out (stroke
// play); net stats use full playing handicaps (computePlayerStats).
// Days come from the rounds' own dates, so there is no "today" or clock here —
// a day appears once one of its rounds is fully scored, and stays for the trip.
import { analyzeScoring, matchPlayPointsByPlayer, isPracticeRound, isNoneRound, roundCourseName, isIndividualGameType } from './scoring.js'
import { computePlayerStats, courseHolesFromRounds } from './playerStats.js'

// Category rows, in display order. `hi` = higher is better (leader is the max).
// `zeroIsNone`: a best value of 0 means nobody earned it (e.g. no birdies) → no leader.
export const LEADER_CATEGORIES = [
  { key: 'points',      label: 'Most Points',  hi: true,  zeroIsNone: false, format: v => `${v}` },
  { key: 'defended',    label: 'Points Defended', hi: true, zeroIsNone: true, format: v => `${v}` },
  // Best / worst single 18-hole round that day (not a total across rounds).
  { key: 'bestGross',   label: 'Best Score',   mode: 'Gross', hi: false, zeroIsNone: false, format: v => `${v}` },
  { key: 'bestNet',     label: 'Best Score',   mode: 'Net',   hi: false, zeroIsNone: false, format: v => `${v}` },
  { key: 'birdiesGross', label: 'Most Birdies', mode: 'Gross', hi: true, zeroIsNone: true, format: v => `${v}` },
  { key: 'birdiesNet',   label: 'Most Birdies', mode: 'Net',   hi: true, zeroIsNone: true, format: v => `${v}` },
  { key: 'parsGross',    label: 'Most Pars',    mode: 'Gross', hi: true, zeroIsNone: true, format: v => `${v}` },
  { key: 'parsNet',      label: 'Most Pars',    mode: 'Net',   hi: true, zeroIsNone: true, format: v => `${v}` },
  // Fire is net-only (matches the scorecard): holes lit once a player has 3+ net
  // par-or-better in a row; the streak is the longest lit run in one round.
  { key: 'fireHoles',   label: 'Most Fire Holes',     hi: true, zeroIsNone: true, format: v => `${v}` },
  { key: 'fireStreak',  label: 'Longest Fire Streak', hi: true, zeroIsNone: true, format: v => `${v}` },
  { key: 'bogeysGross',  label: 'Most Bogeys',  mode: 'Gross', hi: true, zeroIsNone: true, format: v => `${v}` },
  { key: 'bogeysNet',    label: 'Most Bogeys',  mode: 'Net',   hi: true, zeroIsNone: true, format: v => `${v}` },
  { key: 'doublesGross', label: 'Most Doubles or Worse', mode: 'Gross', hi: true, zeroIsNone: true, format: v => `${v}` },
  { key: 'doublesNet',   label: 'Most Doubles or Worse', mode: 'Net',   hi: true, zeroIsNone: true, format: v => `${v}` },
  { key: 'worstGross',   label: 'Worst Round',  mode: 'Gross', hi: true, zeroIsNone: false, format: v => `${v}` },
  { key: 'worstNet',     label: 'Worst Round',  mode: 'Net',   hi: true, zeroIsNone: false, format: v => `${v}` },
  { key: 'drinks',      label: 'Most Drinks',  hi: true,  zeroIsNone: true,  format: v => `${v}` },
]

// Leader(s) of one category: every player tied at the best value.
// values: Map(tripPlayerId -> number|null). Returns { value, ids } or null.
export function leadersOf(values, { hi, zeroIsNone }) {
  let best = null
  for (const v of values.values()) {
    if (v == null) continue
    if (best == null || (hi ? v > best : v < best)) best = v
  }
  if (best == null || (zeroIsNone && best === 0)) return null
  const ids = [...values].filter(([, v]) => v === best).map(([id]) => id)
  return { value: best, ids }
}

function dayNumberOf(date, tripStartDate) {
  if (!date || !tripStartDate) return null
  const ms = Date.UTC(...date.split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n)))) -
    Date.UTC(...tripStartDate.split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))))
  const n = Math.round(ms / 86400000) + 1
  return n >= 1 ? n : null
}

// data: { rounds, scores, pairings, pairingPlayers, tripPlayers, playerRounds, drinks }
//   (drinks rows need round_id). Returns days in date order:
//   [{ date, dayNumber, roundCount, courseName, practice, leaders: [{ ...category, leader }] }]
//   practice: 'all' (every completed round was practice) | 'some' | null
//   where leader is { value, ids } or null.
export function buildDailyLeaders(data, { allowance = 100, tripStartDate = null, gameType = null } = {}) {
  const individual = isIndividualGameType(gameType)
  const categories = LEADER_CATEGORIES.filter(c =>
    !(individual && c.key === 'defended') && !(gameType === 'stroke' && c.key === 'points'))
  const rounds = (data.rounds || []).filter(r => r && r.date && !isNoneRound(r))
  const byDate = new Map()
  for (const r of rounds) {
    if (!byDate.has(r.date)) byDate.set(r.date, [])
    byDate.get(r.date).push(r)
  }
  const tripPlayers = data.tripPlayers || []
  const base = {
    scores: data.scores || [], pairings: data.pairings || [], pairingPlayers: data.pairingPlayers || [],
    tripPlayers, playerRounds: data.playerRounds || [],
  }

  const days = []
  for (const date of [...byDate.keys()].sort()) {
    const dayRounds = byDate.get(date)
    const dayIds = new Set(dayRounds.map(r => r.id))
    const bundle = { ...base, rounds: dayRounds, courseHoles: courseHolesFromRounds(dayRounds) }
    const { completeRoundIds } = analyzeScoring(bundle, dayIds, allowance)
    const complete = dayRounds.filter(r => completeRoundIds.has(r.id))
    if (complete.length === 0) continue

    const completeBundle = { ...base, rounds: complete, courseHoles: courseHolesFromRounds(complete) }
    const { stats } = computePlayerStats({ ...completeBundle, drinks: [] }, allowance, { gameType })
    const points = gameType === 'stableford'
      ? new Map(tripPlayers.map(p => [p.id, stats.get(p.id)?.stableford ?? null]))
      : matchPlayPointsByPlayer(completeBundle, allowance)

    // Drinks are a whole-day thing: every round that day, finished or not.
    const drinks = new Map()
    for (const d of (data.drinks || [])) {
      if (!dayIds.has(d.round_id)) continue
      drinks.set(d.trip_player_id, (drinks.get(d.trip_player_id) || 0) + (d.count || 0))
    }

    const pick = fn => new Map(tripPlayers.map(p => [p.id, fn(stats.get(p.id))]))
    const values = {
      points,
      defended: pick(s => s?.defended ?? null),
      bestGross: pick(s => s?.gross.bestRound ?? null),
      bestNet: pick(s => s?.net.bestRound ?? null),
      birdiesGross: pick(s => s?.gross.birdies ?? null),
      birdiesNet: pick(s => s?.net.birdies ?? null),
      parsGross: pick(s => s?.gross.pars ?? null),
      parsNet: pick(s => s?.net.pars ?? null),
      fireHoles: pick(s => s?.fireHolesTotal ?? null),
      fireStreak: pick(s => s?.fireStreak ?? null),
      bogeysGross: pick(s => s?.gross.bogeys ?? null),
      bogeysNet: pick(s => s?.net.bogeys ?? null),
      doublesGross: pick(s => (s ? s.gross.doubles + s.gross.triples : null)),
      doublesNet: pick(s => (s ? s.net.doubles + s.net.triples : null)),
      worstGross: pick(s => s?.gross.worstRound ?? null),
      worstNet: pick(s => s?.net.worstRound ?? null),
      drinks,
    }

    days.push({
      date,
      dayNumber: dayNumberOf(date, tripStartDate),
      roundCount: complete.length,
      practice: (() => { const n = complete.filter(isPracticeRound).length; return n === 0 ? null : n === complete.length ? 'all' : 'some' })(),
      courseName: complete.length === 1 ? (roundCourseName(complete[0]) || null) : null,
      leaders: categories.map(c => ({ ...c, leader: leadersOf(values[c.key] || new Map(), c) })),
    })
  }
  return days
}
