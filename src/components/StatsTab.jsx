import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  analyzeScoring, standardHolesWonByPlayer, resolvePlayerTee, courseHandicapForTee, strokesOnHole, playerName, firstName,
} from '../lib/scoring'

// ── Trip Stats ────────────────────────────────────────────────────
// All scoring reuses src/lib/scoring.js — no duplicate/divergent logic:
//   • Points: analyzeScoring().pointsByPlayer (per-player match-play points,
//     best-ball hole wins across the multi-team pairing structure).
//   • Net-relative-to-par stats (eagles/birdies/…/fire): each player's ABSOLUTE
//     net (their own course handicap → strokesOnHole → gross − strokes), NOT the
//     pairing-relative net analyzeScoring uses for match play.
//   • Best/Worst round: gross 18-hole totals for complete 18-hole rounds only.

// Absolute per-player playing handicap for a round (course handicap × allowance,
// no pairing-relative subtraction — this is an individual stat, not match play).
function absPlayingHandicap(round, teeRow, handicapIndex, allowance) {
  const tee = resolvePlayerTee(round, teeRow)
  const ch = courseHandicapForTee(handicapIndex, tee.slope, tee.rating, tee.par)
  if (ch == null) return 0
  return Math.max(0, Math.round(ch * (allowance / 100)))
}

function computePlayerStats({ rounds, scores, courseHoles, pairings, pairingPlayers, tripPlayers, playerRounds, drinks }, allowance) {
  // Points — reuse the existing per-player match-play point logic.
  const bundle = { rounds, scores, courseHoles, pairings, pairingPlayers, tripPlayers, playerRounds }
  const { pointsByPlayer } = analyzeScoring(bundle, null, allowance)
  // Holes Won — per-player holes their side won (Standard Match Play card). Reuses
  // standardMatchTally's hole-win detection; computed for all trips, shown only
  // when the trip is Standard Match Play.
  const holesWonByPlayer = standardHolesWonByPlayer(bundle, allowance)

  // Lookups.
  const roundById = new Map(rounds.map(r => [r.id, r]))
  const hcpById = new Map(tripPlayers.map(p => [p.id, p.handicap_index]))
  const teeRowByRP = new Map()
  for (const pr of playerRounds) teeRowByRP.set(`${pr.round_id}:${pr.trip_player_id}`, pr)
  const holeInfo = new Map() // `${roundId}:${hole}` -> { par, stroke_index }
  for (const ch of courseHoles) holeInfo.set(`${ch.round_id}:${ch.hole_number}`, ch)
  const holesByRound = new Map() // roundId -> sorted [hole]
  for (const ch of courseHoles) {
    const arr = holesByRound.get(ch.round_id) || []
    arr.push(ch.hole_number); holesByRound.set(ch.round_id, arr)
  }
  for (const arr of holesByRound.values()) arr.sort((a, b) => a - b)
  const scoreMap = new Map()
  for (const s of scores) if (s.gross_score != null) scoreMap.set(`${s.round_id}:${s.trip_player_id}:${s.hole_number}`, s.gross_score)

  const blank = () => ({
    points: 0, holesWon: 0, eagles: 0, birdies: 0, pars: 0, parsOrBetter: 0,
    bogeys: 0, doubles: 0, triples: 0, fireStreak: 0, fireHoles: 0,
    bestRound: null, worstRound: null,
  })
  const stats = new Map(tripPlayers.map(p => [p.id, blank()]))
  for (const [tp, pts] of pointsByPlayer) { if (stats.has(tp)) stats.get(tp).points = pts }
  for (const [tp, hw] of holesWonByPlayer) { if (stats.has(tp)) stats.get(tp).holesWon = hw }

  let anyScore = false
  for (const r of rounds) {
    const holes = holesByRound.get(r.id)
    if (!holes || holes.length === 0) continue
    const round = roundById.get(r.id)
    const is18 = holes.length === 18
    for (const tp of tripPlayers) {
      const st = stats.get(tp.id)
      const ph = absPlayingHandicap(round, teeRowByRP.get(`${r.id}:${tp.id}`), hcpById.get(tp.id), allowance)
      let streak = 0
      let scoredHoles = 0
      let grossTotal = 0
      for (const hole of holes) {
        const gross = scoreMap.get(`${r.id}:${tp.id}:${hole}`)
        const info = holeInfo.get(`${r.id}:${hole}`)
        const par = info?.par
        if (gross == null || par == null) { streak = 0; continue }
        anyScore = true
        scoredHoles++; grossTotal += gross
        const vsPar = (gross - strokesOnHole(ph, info?.stroke_index)) - par
        if (vsPar <= -2) st.eagles++
        else if (vsPar === -1) st.birdies++
        else if (vsPar === 0) st.pars++
        else if (vsPar === 1) st.bogeys++
        else if (vsPar === 2) st.doubles++
        else if (vsPar >= 3) st.triples++
        if (vsPar <= 0) {
          st.parsOrBetter++; st.fireHoles++
          streak++
          if (streak > st.fireStreak) st.fireStreak = streak
        } else {
          streak = 0
        }
      }
      // Best/Worst: complete 18-hole rounds only (round has 18 holes AND the
      // player scored all 18).
      if (is18 && scoredHoles === 18) {
        if (st.bestRound == null || grossTotal < st.bestRound) st.bestRound = grossTotal
        if (st.worstRound == null || grossTotal > st.worstRound) st.worstRound = grossTotal
      }
    }
  }

  // Drink totals: per-hole drinks + manual tally.
  const drinkByPlayer = new Map()
  for (const d of drinks) drinkByPlayer.set(d.trip_player_id, (drinkByPlayer.get(d.trip_player_id) || 0) + (d.count || 0))

  return { stats, drinkByPlayer, anyScore }
}

// 12 stat cards, in order. hi = sort high-first.
const STAT_CARDS = [
  { title: 'Points', icon: '🏆', key: 'points', hi: true },
  { title: 'Eagles', icon: '🦅', key: 'eagles', hi: true },
  { title: 'Birdies', icon: '🐦', key: 'birdies', hi: true },
  { title: 'Pars', icon: '⛳', key: 'pars', hi: true },
  { title: 'Pars or Better', icon: '✅', key: 'parsOrBetter', hi: true },
  { title: 'Bogeys', icon: '😬', key: 'bogeys', hi: false },
  { title: 'Doubles', icon: '✌️', key: 'doubles', hi: false },
  { title: 'Triples+', icon: '💀', key: 'triples', hi: false },
  { title: 'Fire Streak', icon: '🔥', key: 'fireStreak', hi: true },
  { title: 'Fire Holes', icon: '🔥', key: 'fireHoles', hi: true },
  { title: 'Best Round', icon: '📉', key: 'bestRound', hi: false, dash: true },
  { title: 'Worst Round', icon: '📈', key: 'worstRound', hi: true, dash: true },
]

function StatCard({ title, icon, players, stats, statKey, hi, dash }) {
  const rows = players.map(p => ({ p, v: stats.get(p.id)?.[statKey] ?? (dash ? null : 0) }))
  rows.sort((a, b) => {
    const an = a.v == null, bn = b.v == null
    if (an && bn) return 0
    if (an) return 1
    if (bn) return -1
    return hi ? b.v - a.v : a.v - b.v
  })
  // "No data yet" when nobody has qualifying data for THIS stat — all zero for a
  // counting stat, or all null for a dash stat (e.g. no complete 18-hole round).
  const hasData = rows.some(r => r.v != null && r.v !== 0)
  return (
    <div className="stat-card">
      <div className="stat-card-header">
        <span className="stat-card-icon">{icon}</span>
        <span className="stat-card-title">{title}</span>
      </div>
      {hasData ? (
        rows.map((row, i) => (
          <div className="stat-row-item" key={row.p.id}>
            <span className={`stat-rank ${i === 0 ? 'gold' : ''}`}>{i + 1}</span>
            <span className="stat-player-name">{firstName(row.p.name) || row.p.name}</span>
            <span className={`stat-value ${i === 0 ? 'highlight' : ''}`}>{row.v == null ? '—' : row.v}</span>
          </div>
        ))
      ) : (
        <div className="stat-empty">No data yet</div>
      )}
    </div>
  )
}

export default function StatsTab({ trip, rounds = [], isCommissioner, currentUserId }) {
  const [data, setData] = useState(null)
  const [openDrinkPopup, setOpenDrinkPopup] = useState(null) // trip_player_id
  const allowance = trip?.handicap_allowance ?? 100

  const roundIds = rounds.map(r => r.id)
  const roundKey = roundIds.join(',')

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!trip?.id) { if (!cancelled) setData({ tripPlayers: [], profileMap: {}, scores: [], courseHoles: [], pairings: [], pairingPlayers: [], playerRounds: [], drinks: [] }); return }

      // Players load ALWAYS (the drink leaderboard is independent of scoring).
      const { data: tpData } = await supabase.from('trip_players')
        .select('id, user_id, claimed_user_id, guest_name, handicap_index, team_id, manual_drinks').eq('trip_id', trip.id)
      const tripPlayers = tpData || []
      const userIds = tripPlayers.map(p => p.user_id).filter(Boolean)
      const profileMap = {}
      if (userIds.length) {
        const { data: profs } = await supabase.from('profiles').select('id, display_name').in('id', userIds)
        if (profs) profs.forEach(p => { profileMap[p.id] = p.display_name })
      }

      // Round-scoped scoring data — empty when the trip has no rounds yet.
      let scores = [], courseHoles = [], pairings = [], pairingPlayers = [], playerRounds = [], drinks = []
      if (roundIds.length) {
        const [scoresRes, holesRes, pairingsRes, prRes, drinksRes] = await Promise.all([
          supabase.from('scores').select('round_id, hole_number, trip_player_id, gross_score').in('round_id', roundIds),
          supabase.from('course_holes').select('round_id, hole_number, par, stroke_index').in('round_id', roundIds),
          supabase.from('pairings').select('id, round_id, pairing_number, team1_id, team2_id').in('round_id', roundIds),
          supabase.from('player_rounds').select('trip_player_id, round_id, tee_name, slope, rating, par').in('round_id', roundIds),
          supabase.from('drinks').select('trip_player_id, count').in('round_id', roundIds),
        ])
        scores = scoresRes.data || []; courseHoles = holesRes.data || []
        pairings = pairingsRes.data || []; playerRounds = prRes.data || []; drinks = drinksRes.data || []
        const pairIds = pairings.map(p => p.id)
        if (pairIds.length) {
          const r = await supabase.from('pairing_players').select('id, pairing_id, trip_player_id, team_slot').in('pairing_id', pairIds)
          pairingPlayers = r.data || []
        }
      }
      if (cancelled) return
      setData({ scores, courseHoles, pairings, pairingPlayers, tripPlayers, playerRounds, drinks, profileMap })
    }
    load()
    return () => { cancelled = true }
  }, [trip?.id, roundKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const computed = useMemo(() => {
    if (!data) return null
    return computePlayerStats({ rounds, ...data }, allowance)
  }, [data, roundKey, allowance]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <div className="empty-state">Loading stats…</div>

  const players = data.tripPlayers.map(p => ({ ...p, name: playerName(p, data.profileMap) }))
  const { stats, drinkByPlayer } = computed

  const totalDrinks = p => (drinkByPlayer.get(p.id) || 0) + (p.manual_drinks || 0)
  // Drinks descending; ties broken alphabetically by first name.
  const drinkRows = players.slice().sort((a, b) => {
    const d = totalDrinks(b) - totalDrinks(a)
    if (d !== 0) return d
    return (firstName(a.name) || a.name).localeCompare(firstName(b.name) || b.name)
  })

  // Standard Match Play trips show "Holes Won" in place of the 🏆 Points card
  // (same icon and first-slot position); every other card is unchanged.
  const isStandard = trip?.format === 'standard_match_play'
  const statCards = isStandard
    ? [{ title: 'Holes Won', icon: '🏆', key: 'holesWon', hi: true }, ...STAT_CARDS.slice(1)]
    : STAT_CARDS

  const canEditDrinks = p => !!isCommissioner || (!!currentUserId && (p.user_id === currentUserId || p.claimed_user_id === currentUserId))

  async function adjustManual(p, delta) {
    const next = Math.max(0, (p.manual_drinks || 0) + delta)
    setData(prev => ({ ...prev, tripPlayers: prev.tripPlayers.map(x => x.id === p.id ? { ...x, manual_drinks: next } : x) }))
    await supabase.from('trip_players').update({ manual_drinks: next }).eq('id', p.id)
  }

  if (!players.length) {
    return <div className="empty-state"><span className="empty-state-icon">📊</span>No players on this trip yet.</div>
  }

  return (
    <div>
      {/* Drink leaderboard */}
      <div className="drink-lb-card">
        <div className="drink-lb-header">
          <div>
            <div className="drink-lb-title">🍺 Drink Leaderboard</div>
            <div className="drink-lb-subtitle">Total drinks this trip</div>
          </div>
        </div>
        {drinkRows.map((p, i) => {
          const editable = canEditDrinks(p)
          const open = openDrinkPopup === p.id
          return (
            <div className="stat-row-item" key={p.id} style={{ position: 'relative' }}>
              <span className="stat-rank">{i + 1}</span>
              {editable ? (
                <button
                  className="stat-player-name"
                  style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
                  onClick={() => setOpenDrinkPopup(open ? null : p.id)}
                >
                  {firstName(p.name) || p.name}
                </button>
              ) : (
                <span className="stat-player-name">{firstName(p.name) || p.name}</span>
              )}
              <span className="stat-value">{totalDrinks(p)}</span>
              {open && (
                <>
                  {/* Tap anywhere else to close. */}
                  <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setOpenDrinkPopup(null)} />
                  <div className="drink-inline-popup open">
                    <button className="dip-btn" aria-label="Remove a drink" onClick={() => adjustManual(p, -1)}>−</button>
                    <span className="dip-val">{p.manual_drinks || 0}</span>
                    <button className="dip-btn" aria-label="Add a drink" onClick={() => adjustManual(p, +1)}>+</button>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Stat grid — all 12 cards always render; each shows its own "No data yet"
          body until that specific stat has qualifying data. */}
      <div className="stats-grid">
        {statCards.map(c => (
          <StatCard
            key={c.key}
            title={c.title} icon={c.icon} statKey={c.key} hi={c.hi} dash={c.dash}
            players={players} stats={stats}
          />
        ))}
      </div>
    </div>
  )
}
