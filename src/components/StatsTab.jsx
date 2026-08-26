import { useEffect, useMemo, useState } from 'react'
import { supabase, uniqueChannelName } from '../lib/supabase'
import { useResumeRefetch } from '../lib/useResumeRefetch'
import {
  matchPlayPointsByPlayer, fireStatsByPlayer, resolvePlayerTee, rawCourseHandicapForTee, strokesOnHole, playerName, firstName, effectiveAllowance,
} from '../lib/scoring'

// ── Trip Stats ────────────────────────────────────────────────────
// All scoring reuses src/lib/scoring.js — no duplicate/divergent logic:
//   • Card 1 (mode-independent): the per-hole best-ball net point calc
//     (matchPlayPointsByPlayer) drives BOTH tournament types — only the label
//     differs (Standard Match Play → "Holes Won", Point Match Play →
//     "Points Won"). On each hole the winning side's best-net player(s) score
//     (both when tied for low); it's net-based by definition and never reads the
//     Gross/Net toggle.
//   • Gross/Net cards (eagles/birdies/…/best-worst round): each player's diff vs
//     par per hole, tracked INDEPENDENTLY for gross (raw − par) and net (own
//     absolute net − par). The two sets of counts are separate running totals.
//   • Best/Worst round: 18-hole totals for complete 18-hole rounds only, tracked
//     independently per mode (best gross round ≠ best net round in general).

// Absolute per-player playing handicap for a round: round(RAW course handicap ×
// allowance) per the official WHS order (single rounding, from the unrounded
// course handicap). Individual stat, not pairing-relative match play.
function absPlayingHandicap(round, teeRow, handicapIndex, allowance) {
  const tee = resolvePlayerTee(round, teeRow)
  const rawCH = rawCourseHandicapForTee(handicapIndex, tee.slope, tee.rating, tee.par)
  if (rawCH == null) return 0
  // A course-level allowance override wins over the trip default for this round.
  const alw = effectiveAllowance(round, allowance)
  return Math.max(0, Math.round(rawCH * (alw / 100)))
}

function computePlayerStats({ rounds, scores, pairings, pairingPlayers, tripPlayers, playerRounds, drinks }, allowance) {
  // Hole par + stroke index live on rounds.holes — a positional JSON array where
  // index i is hole i+1 (par via `.par`, stroke index via `.handicap`). This is
  // the SAME source the scorecard reads. The course_holes table is never
  // populated by any code, so building hole info from it (as this function used
  // to) left every round with no holes → the per-round loop skipped everything
  // and all 12 cards showed "No data yet". Derive the { round_id, hole_number,
  // par, stroke_index } shape the scoring helpers expect from rounds.holes.
  const courseHoles = []
  for (const r of rounds) {
    if (!Array.isArray(r.holes)) continue
    r.holes.forEach((h, i) => {
      courseHoles.push({
        round_id: r.id,
        hole_number: i + 1,
        par: h?.par ?? null,
        stroke_index: h?.stroke_index ?? h?.handicap ?? h?.strokeIndex ?? null,
      })
    })
  }

  // Card 1 value (mode-independent). Identical net best-ball point calc for both
  // tournament types — Standard Match Play labels it "Holes Won", Point Match
  // Play "Points Won". Accrues hole-by-hole across all tournament rounds: on each
  // decided hole the winning side's best-net player(s) score (both when tied).
  const bundle = { rounds, scores, courseHoles, pairings, pairingPlayers, tripPlayers, playerRounds }
  const primaryByPlayer = matchPlayPointsByPlayer(bundle, allowance)
  // Fire stats (mode-independent, net-based) — matches the scorecard's fire display.
  const fireByPlayer = fireStatsByPlayer(bundle, allowance)

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

  // Six vs-par categories + best/worst round, tracked separately for gross and
  // net (never derived from each other).
  const emptyMode = () => ({ eagles: 0, birdies: 0, pars: 0, parsOrBetter: 0, bogeys: 0, doubles: 0, triples: 0, bestRound: null, worstRound: null })
  const blank = () => ({ primary: 0, fireStreak: 0, fireHolesTotal: 0, gross: emptyMode(), net: emptyMode() })
  const stats = new Map(tripPlayers.map(p => [p.id, blank()]))
  for (const [tp, v] of primaryByPlayer) { if (stats.has(tp)) stats.get(tp).primary = v }
  for (const [tp, f] of fireByPlayer) { if (stats.has(tp)) { stats.get(tp).fireStreak = f.maxStreak; stats.get(tp).fireHolesTotal = f.fireHolesTotal } }

  const bucket = (m, diff) => {
    if (diff <= -2) m.eagles++
    else if (diff === -1) m.birdies++
    else if (diff === 0) m.pars++
    else if (diff === 1) m.bogeys++
    else if (diff === 2) m.doubles++
    else if (diff >= 3) m.triples++
    if (diff <= 0) m.parsOrBetter++
  }
  const noteRound = (m, total) => {
    if (m.bestRound == null || total < m.bestRound) m.bestRound = total
    if (m.worstRound == null || total > m.worstRound) m.worstRound = total
  }

  let anyScore = false
  for (const r of rounds) {
    const holes = holesByRound.get(r.id)
    if (!holes || holes.length === 0) continue
    const round = roundById.get(r.id)
    const is18 = holes.length === 18
    for (const tp of tripPlayers) {
      const st = stats.get(tp.id)
      const ph = absPlayingHandicap(round, teeRowByRP.get(`${r.id}:${tp.id}`), hcpById.get(tp.id), allowance)
      let scoredHoles = 0, grossTotal = 0, netTotal = 0
      for (const hole of holes) {
        const gross = scoreMap.get(`${r.id}:${tp.id}:${hole}`)
        if (gross == null) continue
        anyScore = true
        const info = holeInfo.get(`${r.id}:${hole}`)
        const net = gross - strokesOnHole(ph, info?.stroke_index)
        scoredHoles++; grossTotal += gross; netTotal += net
        const par = info?.par
        if (par == null) continue // can't bucket vs-par without a par (round totals still count)
        bucket(st.gross, gross - par)
        bucket(st.net, net - par)
      }
      // Best/Worst: complete 18-hole rounds only (round has 18 holes AND the
      // player scored all 18). Gross and net totals recorded independently, so a
      // player's best gross round and best net round can be different rounds.
      if (is18 && scoredHoles === 18) {
        noteRound(st.gross, grossTotal)
        noteRound(st.net, netTotal)
      }
    }
  }

  // Drink totals: per-hole drinks + manual tally.
  const drinkByPlayer = new Map()
  for (const d of drinks) drinkByPlayer.set(d.trip_player_id, (drinkByPlayer.get(d.trip_player_id) || 0) + (d.count || 0))

  return { stats, drinkByPlayer, anyScore }
}

// Cards 2–10, re-rendered per Gross/Net mode. hi = sort high-first; dash = the
// value is a round total (show "—" when the player has no qualifying 18-hole
// round, and rank those "—" players last).
const TOGGLE_CARDS = [
  { title: 'Eagles', icon: '🦅', key: 'eagles', hi: true },
  { title: 'Birdies', icon: '🐦', key: 'birdies', hi: true },
  { title: 'Pars', icon: '⛳', key: 'pars', hi: true },
  { title: 'Pars or Better', icon: '✅', key: 'parsOrBetter', hi: true },
  { title: 'Bogeys', icon: '😬', key: 'bogeys', hi: false },
  { title: 'Doubles', icon: '✌️', key: 'doubles', hi: false },
  { title: 'Triples+', icon: '💀', key: 'triples', hi: false },
  { title: 'Best Round', icon: '📉', key: 'bestRound', hi: false, dash: true },
  { title: 'Worst Round', icon: '📈', key: 'worstRound', hi: true, dash: true },
]

// `valueOf(player)` returns the ranked value (number, or null → "—"). `anyScore`
// gates the whole card: with no scores entered anywhere, show "No data yet".
function StatCard({ title, icon, players, valueOf, hi, anyScore }) {
  const nameOf = p => firstName(p.name) || p.name || ''
  const rows = players.map(p => ({ p, v: valueOf(p) }))
  // Rank by value in the card's natural direction; null values ("—") sort last;
  // ties broken alphabetically.
  rows.sort((a, b) => {
    if (a.v == null && b.v == null) return nameOf(a.p).localeCompare(nameOf(b.p))
    if (a.v == null) return 1
    if (b.v == null) return -1
    if (a.v !== b.v) return hi ? b.v - a.v : a.v - b.v
    return nameOf(a.p).localeCompare(nameOf(b.p))
  })
  return (
    <div className="stat-card">
      <div className="stat-card-header">
        <span className="stat-card-icon">{icon}</span>
        <span className="stat-card-title">{title}</span>
      </div>
      {!anyScore
        ? <div className="stat-empty">No data yet</div>
        : rows.map((row, i) => (
          <div className="stat-row-item" key={row.p.id}>
            <span className="stat-rank">{i + 1}</span>
            <span className="stat-player-name">{firstName(row.p.name) || row.p.name}</span>
            <span className="stat-value">{row.v == null ? '—' : row.v}</span>
          </div>
        ))}
    </div>
  )
}

export default function StatsTab({ trip, rounds = [], isCommissioner, currentUserId }) {
  const [data, setData] = useState(null)
  const [openDrinkPopup, setOpenDrinkPopup] = useState(null) // trip_player_id
  const [refreshTick, setRefreshTick] = useState(0) // bumped by realtime score changes + resume to refetch
  const [mode, setMode] = useState('gross') // Gross/Net toggle — cards 2–10 only
  const allowance = trip?.handicap_allowance ?? 100

  const roundIds = rounds.map(r => r.id)
  const roundKey = roundIds.join(',')

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!trip?.id) { if (!cancelled) setData({ tripPlayers: [], profileMap: {}, scores: [], courseHoles: [], pairings: [], pairingPlayers: [], playerRounds: [], drinks: [] }); return }

      // Players load ALWAYS (the drink leaderboard is independent of scoring).
      const { data: tpData } = await supabase.from('trip_players')
        .select('id, user_id, claimed_user_id, first_name, last_name, guest_name, handicap_index, team_id, manual_drinks').eq('trip_id', trip.id)
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
  }, [trip?.id, roundKey, refreshTick]) // eslint-disable-line react-hooks/exhaustive-deps

  // Live updates: the 12 stat cards compute from `data.scores`, which is fetched
  // above and otherwise only refetched on trip/round change — so newly-entered
  // scores never reached them (the drink leaderboard only looked live because
  // manual_drinks updates optimistically). Subscribe to the scoring tables and
  // refetch (debounced) so the cards update as scores come in. Best Round /
  // Worst Round stay correct on their own: computePlayerStats only records them
  // for complete 18-hole rounds, so recomputing from fresh scores can't populate
  // them mid-round.
  useEffect(() => {
    if (!trip?.id || roundIds.length === 0) return
    const filter = `round_id=in.(${roundIds.join(',')})`
    let timer = null
    const bump = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => setRefreshTick(t => t + 1), 400) }
    const ch = supabase.channel(uniqueChannelName(`stats:${trip.id}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores', filter }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drinks', filter }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_rounds', filter }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pairing_players' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_players', filter: `trip_id=eq.${trip.id}` }, bump)
      .subscribe()
    return () => { if (timer) clearTimeout(timer); supabase.removeChannel(ch) }
  }, [trip?.id, roundKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Resume from background: the realtime socket may have stalled while suspended,
  // so refetch on return (covers the "switched apps and back" case).
  useResumeRefetch(() => setRefreshTick(t => t + 1))

  const computed = useMemo(() => {
    if (!data) return null
    return computePlayerStats({ rounds, ...data }, allowance)
  }, [data, roundKey, allowance]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <div className="empty-state">Loading stats…</div>

  const players = data.tripPlayers.map(p => ({ ...p, name: playerName(p, data.profileMap) }))
  const { stats, drinkByPlayer, anyScore } = computed

  const totalDrinks = p => (drinkByPlayer.get(p.id) || 0) + (p.manual_drinks || 0)
  // Drinks descending; ties broken alphabetically by first name.
  const drinkRows = players.slice().sort((a, b) => {
    const d = totalDrinks(b) - totalDrinks(a)
    if (d !== 0) return d
    return (firstName(a.name) || a.name).localeCompare(firstName(b.name) || b.name)
  })

  // Card 1 adapts to the tournament type: Standard Match Play tracks holes won,
  // Point Match Play tracks points earned. It's mode-independent (match-play
  // scoring is always net) so the Gross/Net toggle never changes it.
  const isStandard = trip?.format === 'standard_match_play'
  const primaryCard = { title: isStandard ? 'Holes Won' : 'Points Won', icon: '📊' }

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

      {/* Gross / Net toggle — controls cards 2–10 (not the primary card 1, and
          not the Drink Leaderboard). Default Gross. */}
      <div className="gross-net-toggle" role="tablist" aria-label="Gross or net stats">
        <button role="tab" aria-selected={mode === 'gross'} className={`gn-btn ${mode === 'gross' ? 'active' : ''}`} onClick={() => setMode('gross')}>Gross</button>
        <button role="tab" aria-selected={mode === 'net'} className={`gn-btn ${mode === 'net' ? 'active' : ''}`} onClick={() => setMode('net')}>Net</button>
      </div>

      {/* Stat grid. Card 1 (Holes Won / Points Won) is mode-independent; cards
          2–10 recompute from the active Gross/Net mode. Every player is listed
          (even at 0); Best/Worst Round show "—" without a qualifying 18-hole
          round; #1 is highlighted navy. All cards show "No data yet" until a
          score is entered anywhere. */}
      <div className="stats-grid">
        <StatCard
          key="primary"
          title={primaryCard.title} icon={primaryCard.icon} hi anyScore={anyScore}
          players={players}
          valueOf={p => stats.get(p.id)?.primary ?? 0}
        />
        {/* Counting cards (Eagles … Triples+) — Gross/Net mode-dependent. */}
        {TOGGLE_CARDS.slice(0, 7).map(c => (
          <StatCard
            key={c.key}
            title={c.title} icon={c.icon} hi={c.hi} anyScore={anyScore}
            players={players}
            valueOf={p => {
              const m = stats.get(p.id)?.[mode]
              if (!m) return c.dash ? null : 0
              return c.dash ? m[c.key] : (m[c.key] ?? 0)
            }}
          />
        ))}
        {/* Fire stats — mode-independent (net-based, like the primary card). */}
        <StatCard
          key="fireStreak"
          title="Longest Fire Streak" icon="🔥" hi anyScore={anyScore}
          players={players}
          valueOf={p => stats.get(p.id)?.fireStreak ?? 0}
        />
        <StatCard
          key="fireHoles"
          title="Total Fire Holes" icon="🔥" hi anyScore={anyScore}
          players={players}
          valueOf={p => stats.get(p.id)?.fireHolesTotal ?? 0}
        />
        {/* Best / Worst Round — Gross/Net mode-dependent. */}
        {TOGGLE_CARDS.slice(7).map(c => (
          <StatCard
            key={c.key}
            title={c.title} icon={c.icon} hi={c.hi} anyScore={anyScore}
            players={players}
            valueOf={p => {
              const m = stats.get(p.id)?.[mode]
              if (!m) return c.dash ? null : 0
              return c.dash ? m[c.key] : (m[c.key] ?? 0)
            }}
          />
        ))}
      </div>
    </div>
  )
}
