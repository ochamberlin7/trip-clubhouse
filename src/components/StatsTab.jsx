import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase, uniqueChannelName } from '../lib/supabase'
import { useResumeRefetch } from '../lib/useResumeRefetch'
import {
  matchPlayPointsByPlayer, fireStatsByPlayer, resolvePlayerTee, rawCourseHandicapForTee, strokesOnHole, playerName, firstName, effectiveAllowance, shotsGivenFromCourseHandicaps,
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
//     par per hole, tracked INDEPENDENTLY for gross (raw − par) and net (net −
//     par). Net uses the SAME match-play shots as the scorecard dots — strokes
//     off the pairing's low player — so "net birdies" here agree with the dots
//     shown on the card (not each player's full playing handicap).
//   • Best/Worst round: 18-hole totals for complete 18-hole rounds only, tracked
//     independently per mode (best gross round ≠ best net round in general).

// Off-low (match-play) shots per player per round, grouped by pairing — identical
// to the scorecard/match logic (shotsGivenFromCourseHandicaps): each player's
// playing handicap MINUS the pairing group's lowest, so the low player plays off
// scratch (0). Falls back to a single group of everyone who scored the round when
// no pairings exist. Returns Map(roundId -> Map(tripPlayerId -> shots)).
function offLowShotsByRound(rounds, { roundById, pairingsByRound, playersByPairing, scores, teeRowByRP, hcpById }, allowance) {
  const byRound = new Map()
  for (const r of rounds) {
    const round = roundById.get(r.id)
    const prs = pairingsByRound.get(r.id) || []
    let groups
    if (prs.length) {
      groups = prs.map(pr => playersByPairing.get(pr.id) || [])
    } else {
      const set = new Set()
      for (const s of scores) if (s.round_id === r.id && s.gross_score != null) set.add(s.trip_player_id)
      groups = [[...set]]
    }
    const shots = new Map()
    for (const group of groups) {
      const entries = group.map(tp => {
        const tee = resolvePlayerTee(round, teeRowByRP.get(`${r.id}:${tp}`))
        return { id: tp, ch: rawCourseHandicapForTee(hcpById.get(tp), tee.slope, tee.rating, tee.par) }
      })
      const m = shotsGivenFromCourseHandicaps(entries, effectiveAllowance(round, allowance))
      for (const [tp, v] of m) shots.set(tp, v)
    }
    byRound.set(r.id, shots)
  }
  return byRound
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

  // Pairing lookups → off-low match shots per round (same basis as the scorecard
  // dots), so the Net cards below strike Ben on SI 1-7 (off the low man), not on
  // his full 90% playing handicap.
  const playersByPairing = new Map()
  for (const pp of pairingPlayers) {
    if (!playersByPairing.has(pp.pairing_id)) playersByPairing.set(pp.pairing_id, [])
    playersByPairing.get(pp.pairing_id).push(pp.trip_player_id)
  }
  const pairingsByRound = new Map()
  for (const pr of pairings) {
    if (!pairingsByRound.has(pr.round_id)) pairingsByRound.set(pr.round_id, [])
    pairingsByRound.get(pr.round_id).push(pr)
  }
  const shotsByRound = offLowShotsByRound(rounds, { roundById, pairingsByRound, playersByPairing, scores, teeRowByRP, hcpById }, allowance)

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
    const is18 = holes.length === 18
    for (const tp of tripPlayers) {
      const st = stats.get(tp.id)
      const ph = shotsByRound.get(r.id)?.get(tp.id) ?? 0
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

// Category tabs (Drinks last). Each tab shows a 2-col grid of stat tiles.
const STAT_TABS = ['Scoring', 'Fire', 'Rounds', 'Drinks']

// Custom stat icon set — defined once as <symbol>s, referenced via <use>. White
// on the navy tile header (stroke: currentColor). "+1" (Points Won) is text, not
// an icon.
function StatSymbols() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <symbol id="ic-flag" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20.5V3" /><path d="M12 4l7 2.6-7 2.6z" /><path d="M8.3 20.5h7.4" /></symbol>
      <symbol id="ic-shieldcheck" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3.5l7 2.7v5.3c0 4.6-2.9 7.3-7 8.5-4.1-1.2-7-3.9-7-8.5V6.2l7-2.7z" /><path d="M8.7 12.3l2.2 2.2 4.4-4.4" /></symbol>
      <symbol id="ic-circle1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="7.5" /></symbol>
      <symbol id="ic-dcircle" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="8.2" /><circle cx="12" cy="12" r="5.2" /></symbol>
      <symbol id="ic-square1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5.5" y="5.5" width="13" height="13" rx="1.5" /></symbol>
      <symbol id="ic-dsquare" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="4.3" y="4.3" width="15.4" height="15.4" rx="1.8" /><rect x="7.5" y="7.5" width="9" height="9" rx="1.2" /></symbol>
      <symbol id="ic-xsquare" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="5.5" y="5.5" width="13" height="13" rx="1.5" /><path d="M7.3 7.3l9.4 9.4M16.7 7.3l-9.4 9.4" /></symbol>
      <symbol id="ic-chartup" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 16.5l6-6 4 4 8-8.5" /><path d="M14.5 6h6.5v6.5" /></symbol>
      <symbol id="ic-chartdown" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7.5l6 6 4-4 8 8.5" /><path d="M14.5 18h6.5v-6.5" /></symbol>
      <symbol id="ic-flameplain" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21.5c-4.2 0-7-2.9-7-6.8 0-2.7 1.7-4.6 2.8-6.3.2 1.8 1 2.9 2 2.9-.3-3.4-.6-5.6 1.6-8.8 1 3.2 3.8 5 3.8 8.6 0 1.1 1 1.9 1.9.9 1.2 2.9-.9 9.5-5.1 9.5z" /></symbol>
      <symbol id="ic-flamestreak" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13.5 21.5c-4.2 0-7-2.9-7-6.8 0-2.7 1.7-4.6 2.8-6.3.2 1.8 1 2.9 2 2.9-.3-3.4-.6-5.6 1.6-8.8 1 3.2 3.8 5 3.8 8.6 0 1.1 1 1.9 1.9.9 1.2 2.9-.9 9.5-5.1 9.5z" /><path d="M.3 9.8h6" /><path d="M3.3 14.3h3" /><path d="M.3 18.8h6" /></symbol>
      <symbol id="ic-cocktail" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5.3 7.3h12l-6 8.3z" /><path d="M11.3 15.6v5.7" /><path d="M7.8 21.3h7" /><path d="M17.2 4.3a3.2 3.2 0 0 1 3.2 3.2h-3.2z" /><path d="M17.9 6.9l1.8-1.8" /></symbol>
    </svg>
  )
}

// The skinny navy header's icon: "+1" renders as bold white text; anything else
// references a <symbol> by id.
function StatIcon({ icon }) {
  if (icon === '+1') return <span className="stat-tile-plus">+1</span>
  return <svg className="stat-tile-icon" viewBox="0 0 24 24" aria-hidden="true"><use href={`#${icon}`} /></svg>
}

function StatHeaderBar({ icon, title }) {
  return (
    <div className="stat-tile-header">
      <StatIcon icon={icon} />
      <span className="stat-tile-title">{title}</span>
    </div>
  )
}

function StatRow({ i, row }) {
  return (
    <div className="stat-tile-row">
      <span className="stat-tile-rank">{i + 1}</span>
      <span className="stat-tile-name">{firstName(row.p.name) || row.p.name}</span>
      <span className="stat-tile-val">{row.v == null ? '—' : row.v}</span>
    </div>
  )
}

// Rank players by a card's value (unchanged from before): high- or low-first per
// `hi`, null values ("—") last, ties broken alphabetically by first name.
function rankPlayers(players, valueOf, hi) {
  const nameOf = p => firstName(p.name) || p.name || ''
  const rows = players.map(p => ({ p, v: valueOf(p) }))
  rows.sort((a, b) => {
    if (a.v == null && b.v == null) return nameOf(a.p).localeCompare(nameOf(b.p))
    if (a.v == null) return 1
    if (b.v == null) return -1
    if (a.v !== b.v) return hi ? b.v - a.v : a.v - b.v
    return nameOf(a.p).localeCompare(nameOf(b.p))
  })
  return rows
}

// One podium tile: skinny navy header + top-3 rows + a "See all N ›" footer that
// opens a modal with the full ranked list. `anyScore` gates it to "No data yet".
function StatTile({ title, icon, players, valueOf, hi, anyScore, span }) {
  const [open, setOpen] = useState(false)
  const rows = rankPlayers(players, valueOf, hi)
  return (
    <div className="stat-tile" style={span ? { gridColumn: '1 / -1' } : undefined}>
      <StatHeaderBar icon={icon} title={title} />
      {!anyScore ? (
        <div className="stat-empty">No data yet</div>
      ) : (
        <>
          {rows.slice(0, 3).map((row, i) => <StatRow key={row.p.id} i={i} row={row} />)}
          {rows.length > 3 && (
            <button className="stat-tile-seeall" onClick={() => setOpen(true)}>See all {rows.length} ›</button>
          )}
        </>
      )}
      {open && createPortal(
        <div className="stat-modal-overlay" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <div className="stat-modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="stat-tile-header" style={{ position: 'relative', paddingRight: 44 }}>
              <StatIcon icon={icon} />
              <span className="stat-tile-title">{title}</span>
              <button className="stat-modal-close" aria-label="Close" onClick={() => setOpen(false)}>✕</button>
            </div>
            <div className="stat-modal-list">
              {rows.map((row, i) => <StatRow key={row.p.id} i={i} row={row} />)}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

export default function StatsTab({ trip, rounds = [], isCommissioner, currentUserId }) {
  const [data, setData] = useState(null)
  const [openDrinkPopup, setOpenDrinkPopup] = useState(null) // trip_player_id
  const [refreshTick, setRefreshTick] = useState(0) // bumped by realtime score changes + resume to refetch
  const [mode, setMode] = useState('gross') // Gross/Net toggle — scoring/round tiles only
  const [tab, setTab] = useState('Scoring') // category tab (session-only)
  const tilesRef = useRef(null)             // swipe area (tiles) → change tab
  const swipeRef = useRef({ x0: 0, y0: 0, did: false })
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

  // Two-finger trackpad horizontal swipe over the tiles → move between category
  // tabs. Native non-passive listener so preventDefault stops the browser's
  // back/forward swipe-nav. Re-bound when `data` first renders the tiles.
  useEffect(() => {
    const el = tilesRef.current
    if (!el) return
    let settle, acc = 0
    function onWheel(e) {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
      e.preventDefault()
      acc += e.deltaX
      clearTimeout(settle)
      settle = setTimeout(() => {
        if (Math.abs(acc) > 50) {
          setTab(prev => {
            const i = STAT_TABS.indexOf(prev)
            const next = acc < 0 ? Math.max(0, i - 1) : Math.min(STAT_TABS.length - 1, i + 1)
            return STAT_TABS[next]
          })
        }
        acc = 0
      }, 90)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => { el.removeEventListener('wheel', onWheel); clearTimeout(settle) }
  }, [data])

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
  const primaryCard = { title: isStandard ? 'Holes Won' : 'Points Won', icon: '+1' }

  const canEditDrinks = p => !!isCommissioner || (!!currentUserId && (p.user_id === currentUserId || p.claimed_user_id === currentUserId))

  async function adjustManual(p, delta) {
    const next = Math.max(0, (p.manual_drinks || 0) + delta)
    setData(prev => ({ ...prev, tripPlayers: prev.tripPlayers.map(x => x.id === p.id ? { ...x, manual_drinks: next } : x) }))
    await supabase.from('trip_players').update({ manual_drinks: next }).eq('id', p.id)
  }

  if (!players.length) {
    return <div className="empty-state"><span className="empty-state-icon">📊</span>No players on this trip yet.</div>
  }

  // Value accessor for a Gross/Net mode-dependent stat (`dash` → round total that
  // shows "—" when absent). Mode-independent stats use direct accessors below.
  const modeValue = (key, dash) => p => {
    const m = stats.get(p.id)?.[mode]
    if (!m) return dash ? null : 0
    return dash ? m[key] : (m[key] ?? 0)
  }

  // Tile descriptors per tab. Icons per the spec; Points Won uses the "+1" text.
  const scoringTiles = [
    { key: 'primary', title: primaryCard.title, icon: '+1', hi: true, valueOf: p => stats.get(p.id)?.primary ?? 0 },
    { key: 'eagles', title: 'Eagles', icon: 'ic-dcircle', hi: true, valueOf: modeValue('eagles') },
    { key: 'birdies', title: 'Birdies', icon: 'ic-circle1', hi: true, valueOf: modeValue('birdies') },
    { key: 'pars', title: 'Pars', icon: 'ic-flag', hi: true, valueOf: modeValue('pars') },
    { key: 'parsOrBetter', title: 'Pars+', icon: 'ic-shieldcheck', hi: true, valueOf: modeValue('parsOrBetter') },
    { key: 'bogeys', title: 'Bogeys', icon: 'ic-square1', hi: false, valueOf: modeValue('bogeys') },
    { key: 'doubles', title: 'Doubles', icon: 'ic-dsquare', hi: false, valueOf: modeValue('doubles') },
    { key: 'triples', title: 'Triples+', icon: 'ic-xsquare', hi: false, valueOf: modeValue('triples') },
  ]
  const fireTiles = [
    { key: 'fireStreak', title: 'Longest Fire Streak', icon: 'ic-flamestreak', hi: true, valueOf: p => stats.get(p.id)?.fireStreak ?? 0 },
    { key: 'fireHoles', title: 'Total Fire Holes', icon: 'ic-flameplain', hi: true, valueOf: p => stats.get(p.id)?.fireHolesTotal ?? 0 },
  ]
  const roundsTiles = [
    { key: 'bestRound', title: 'Best Round', icon: 'ic-chartup', hi: false, valueOf: modeValue('bestRound', true) },
    { key: 'worstRound', title: 'Worst Round', icon: 'ic-chartdown', hi: true, valueOf: modeValue('worstRound', true) },
  ]
  const tilesForTab = tab === 'Scoring' ? scoringTiles : tab === 'Fire' ? fireTiles : tab === 'Rounds' ? roundsTiles : []
  // Gross/Net only affects the counting + round tiles; Fire & Drinks are net-based.
  const showToggle = tab === 'Scoring' || tab === 'Rounds'

  // Touch / mouse horizontal drag over the tiles → previous/next category tab
  // (clamped to the tab list). Vertical drags fall through to page scroll.
  const tabIndex = STAT_TABS.indexOf(tab)
  function goTab(delta) {
    const next = Math.min(STAT_TABS.length - 1, Math.max(0, tabIndex + delta))
    if (next !== tabIndex) setTab(STAT_TABS[next])
  }
  function onTilesPointerDown(e) { swipeRef.current = { x0: e.clientX, y0: e.clientY, did: false } }
  function onTilesPointerUp(e) {
    const s = swipeRef.current
    const dx = e.clientX - s.x0, dy = e.clientY - s.y0
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { s.did = true; goTab(dx < 0 ? 1 : -1) }
  }
  // Cancel the click that follows a horizontal swipe so it doesn't also trigger a
  // "See all" / drink-edit tap on whatever the drag started over.
  function onTilesClickCapture(e) {
    if (swipeRef.current.did) { e.stopPropagation(); e.preventDefault(); swipeRef.current.did = false }
  }

  return (
    <div>
      <StatSymbols />

      {/* Category tabs — ABOVE the Gross/Net selector; horizontal scroll, Drinks last. */}
      <div className="stat-tabs" role="tablist" aria-label="Stat categories">
        {STAT_TABS.map(t => (
          <button key={t} role="tab" aria-selected={tab === t} className={`stat-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {/* Everything below the tabs is one swipe surface: a horizontal drag / two-finger
          swipe ANYWHERE here (the toggle, the tiles, or the empty space below them)
          pages between category tabs. A viewport-based min-height makes the surface
          reach down past short tabs to the bottom of the screen — .dashboard-content
          isn't a flex container, so a flex fill wouldn't stretch it. */}
      <div ref={tilesRef} style={{ minHeight: 'calc(100dvh - 190px)', touchAction: 'pan-y' }} onPointerDown={onTilesPointerDown} onPointerUp={onTilesPointerUp} onClickCapture={onTilesClickCapture}>
        {/* Gross / Net toggle — controls the Scoring counting tiles + Best/Worst
            Round (not Points Won, Fire, or Drinks). Default Gross. */}
        {showToggle && (
          <div className="gross-net-toggle" role="tablist" aria-label="Gross or net stats">
            <button role="tab" aria-selected={mode === 'gross'} className={`gn-btn ${mode === 'gross' ? 'active' : ''}`} onClick={() => setMode('gross')}>Gross</button>
            <button role="tab" aria-selected={mode === 'net'} className={`gn-btn ${mode === 'net' ? 'active' : ''}`} onClick={() => setMode('net')}>Net</button>
          </div>
        )}
        <div className="stat-tiles-grid">
        {tilesForTab.map(t => (
          <StatTile key={t.key} title={t.title} icon={t.icon} hi={t.hi} anyScore={anyScore} players={players} valueOf={t.valueOf} />
        ))}

        {tab === 'Drinks' && (
          <div className="stat-tile" style={{ gridColumn: '1 / -1' }}>
            <StatHeaderBar icon="ic-cocktail" title="Drink Leaderboard" />
            {drinkRows.map((p, i) => {
              const editable = canEditDrinks(p)
              const open = openDrinkPopup === p.id
              return (
                <div className="stat-tile-row" key={p.id} style={{ position: 'relative' }}>
                  <span className="stat-tile-rank">{i + 1}</span>
                  {editable ? (
                    <button
                      className="stat-tile-name"
                      style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
                      onClick={() => setOpenDrinkPopup(open ? null : p.id)}
                    >
                      {firstName(p.name) || p.name}
                    </button>
                  ) : (
                    <span className="stat-tile-name">{firstName(p.name) || p.name}</span>
                  )}
                  <span className="stat-tile-val">{totalDrinks(p)}</span>
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
        )}
      </div>
      </div>
    </div>
  )
}
