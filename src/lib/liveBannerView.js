// What the floating live-score banner says on Stableford / Stroke Play trips
// (decided 2026-10-29). Pure, so it's tested; the per-hole math is the shared
// strokeRoundResult (scoring.js), the same numbers as the Leaderboard.
//
// Each format speaks its own scoreboard language:
//   • Stroke play  → net score vs par: "Owen leads at -2", "2 back", "by 6 shots"
//   • Stableford   → points:           "Owen leads with 24 pts", "3 back"
// ("Up" / "All square" are match-play words and never appear here.)
//
// Shows TODAY's round only (the trip race lives on the Leaderboard).
//   • Team trips: one line, the teams' round totals (members added up).
//   • Individual trips: the leader, then "You" (where the viewer stands); a viewer
//     who isn't playing or hasn't teed off sees the next player instead.
// Mid-round, Stableford compares players on points with "Thru N" beside them.
// When everyone who started has holed out, the round is over: "wins the round".
import { strokeRoundResult, formatVsPar, firstName, playerName } from './scoring.js'
import { getTeamDisplayName, isDefaultTeamName } from './teamColors.js'

const ordinal = n => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th'
  return `${n}${s}`
}
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// Short names for the banner: first names, with a last initial where two players
// share a first name ("Owen C.", "Owen M.").
function shortNames(players) {
  const full = new Map(players.map(p => [p.id, playerName(p)]))
  const firsts = new Map()
  for (const n of full.values()) { const f = firstName(n); firsts.set(f, (firsts.get(f) || 0) + 1) }
  const out = new Map()
  for (const [id, n] of full) {
    const f = firstName(n) || n
    const last = n.trim().split(/\s+/).slice(1).join(' ')
    out.set(id, firsts.get(f) > 1 && last ? `${f} ${last[0]}.` : f)
  }
  return out
}

// "Owen, Monty" for two; "3 players" beyond that (the banner is one line).
function namesOf(ids, nameById) {
  return ids.length <= 2 ? ids.map(id => nameById.get(id)).join(', ') : `${ids.length} players`
}

// Competition ranking over [{ id, value }] (best first). Returns [{ id, value, rank }].
function rank(entries, higherWins) {
  const sorted = entries.slice().sort((a, b) => (higherWins ? b.value - a.value : a.value - b.value))
  let r = 0
  return sorted.map((e, i) => { if (i === 0 || e.value !== sorted[i - 1].value) r = i + 1; return { ...e, rank: r } })
}

// The banner for one round.
//   gameType : 'stableford' | 'stroke'
//   players  : trip_players rows ({ id, first_name, last_name, guest_name, team_id, user_id, claimed_user_id })
//   teams    : team rows ([] on an individual trip)
//   meId     : the viewer's auth user id (matched to user_id / claimed_user_id)
// Returns { started, finished, rows: [{ label, text, teamId?, accent, thru }] }.
//   accent: true → colour as the leader (team colour, or navy with no teams).
export function liveBannerModel({ gameType, round, players = [], teams = [], scoresMap = {}, hcpByPlayer = {}, teeRowMap = {}, allowance = 100, meId = null }) {
  const stableford = gameType === 'stableford'
  const results = new Map()
  for (const p of players) {
    const res = strokeRoundResult({ round, playerId: p.id, scoresMap, hcpByPlayer, teeRowMap, allowance })
    if (res) results.set(p.id, res)
  }
  const started = results.size > 0
  const finished = started && [...results.values()].every(r => r.complete)
  if (!started) return { started, finished, rows: [] }

  const valueOf = r => (stableford ? r.points : (r.netToPar ?? 0))
  const fmt = v => (stableford ? `${v} pts` : formatVsPar(v))
  const at = v => (stableford ? `on ${v} pts` : `at ${formatVsPar(v)}`)
  const thruOf = r => (r.complete ? 'F' : `Thru ${r.holes}`)
  const maxThru = Math.max(...[...results.values()].map(r => r.holes))
  const playedTeams = teams.filter(t => players.some(p => p.team_id === t.id && results.has(p.id)))

  // ── Team trips: one line with the teams' round totals ──
  if (teams.length > 0) {
    const totals = playedTeams.map(t => {
      let v = 0
      for (const p of players) if (p.team_id === t.id && results.has(p.id)) v += valueOf(results.get(p.id))
      return { id: t.id, value: v }
    })
    if (!totals.length) return { started, finished, rows: [] }
    const ranked = rank(totals, stableford)
    const top = ranked.filter(t => t.rank === 1)
    const nameOf = id => getTeamDisplayName(teams.find(t => t.id === id))
    const thru = finished ? '' : `Thru ${maxThru}`
    let text, teamId = null
    if (top.length > 1) {
      const who = top.length === teams.length && teams.length === 2 ? 'Teams' : top.map(t => nameOf(t.id)).join(', ')
      text = finished ? `Round tied ${at(top[0].value)}` : `${who} tied ${at(top[0].value)}`
    } else {
      const lead = top[0]; const next = ranked.find(t => t.rank > 1)
      const name = nameOf(lead.id); teamId = lead.id
      const sing = isDefaultTeamName(name)
      const margin = next ? Math.abs(lead.value - next.value) : 0
      if (finished) {
        const win = sing ? 'wins' : 'win'
        text = stableford
          ? (ranked.length === 2 ? `${name} ${win} the round ${lead.value}–${next.value}` : `${name} ${win} the round, ${lead.value} pts`)
          : `${name} ${win} the round by ${plural(margin, 'shot')}`
      } else {
        const verb = sing ? 'leads' : 'lead'
        text = stableford
          ? (ranked.length === 2 ? `${name} ${verb} ${lead.value}–${next.value}` : `${name} ${verb} with ${lead.value} pts`)
          : (next ? `${name} ${verb} by ${plural(margin, 'shot')}` : `${name} ${verb} at ${formatVsPar(lead.value)}`)
      }
    }
    return { started, finished, rows: [{ label: 'Today', text, teamId, accent: !!teamId, thru }] }
  }

  // ── Individual trips: the leader, then "You" (or the next player) ──
  const nameById = shortNames(players.filter(p => results.has(p.id)))
  const ranked = rank([...results].map(([id, r]) => ({ id, value: valueOf(r) })), stableford)
  const leaders = ranked.filter(e => e.rank === 1)
  const best = leaders[0].value
  const rows = []
  if (finished) {
    const who = namesOf(leaders.map(e => e.id), nameById)
    rows.push({
      label: 'Round', accent: true, thru: '',
      text: leaders.length > 1
        ? `${who} tie the round ${at(best)}`
        : (stableford ? `${who} wins the round, ${fmt(best)}` : `${who} wins the round at ${formatVsPar(best)}`),
    })
  } else if (leaders.length > 1) {
    rows.push({ label: 'Leader', accent: true, thru: '', text: `${namesOf(leaders.map(e => e.id), nameById)} tied ${at(best)}` })
  } else {
    const r = results.get(leaders[0].id)
    rows.push({ label: 'Leader', accent: true, thru: thruOf(r), text: `${nameById.get(leaders[0].id)} leads ${stableford ? 'with' : 'at'} ${fmt(best)}` })
  }

  // Where one entry stands: "T3 at E · 2 back" / "2nd, 21 pts · 3 back" /
  // "1st at -2 · 1 ahead". Gaps drop once the round is over.
  const tied = e => ranked.filter(x => x.rank === e.rank).length > 1
  const place = e => (tied(e) ? `T${e.rank}` : ordinal(e.rank))
  const gap = e => {
    if (finished) return ''
    if (e.rank > 1) return ` · ${Math.abs(best - e.value)} back`
    if (tied(e)) return ''
    const next = ranked.find(x => x.rank > 1)
    return next ? ` · ${Math.abs(best - next.value)} ahead` : ''
  }
  const standing = e => (stableford ? `${place(e)}, ${fmt(e.value)}${gap(e)}` : `${place(e)} at ${fmt(e.value)}${gap(e)}`)

  const me = meId ? players.find(p => p.user_id === meId || p.claimed_user_id === meId) : null
  const mine = me && ranked.find(e => e.id === me.id)
  if (mine) {
    rows.push({ label: 'You', accent: mine.rank === 1, thru: finished ? '' : thruOf(results.get(mine.id)), text: standing(mine) })
  } else {
    // Not playing (or not started): show the next player behind the lead instead.
    const next = ranked.find(e => e.rank > 1)
    if (next) {
      rows.push({ label: place(next), accent: false, thru: finished ? '' : thruOf(results.get(next.id)), text: `${nameById.get(next.id)} ${stableford ? `${fmt(next.value)}` : `at ${fmt(next.value)}`}${gap(next)}` })
    }
  }
  return { started, finished, rows }
}
