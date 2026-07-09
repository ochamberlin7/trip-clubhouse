import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase, uniqueChannelName } from '../lib/supabase'
import { liveMatchTally, liveStandardMatchTally } from '../lib/scoring'
import { getTeamDisplayName } from '../lib/teamColors'

// Floating live-score banner, fixed to the bottom of the screen. Mounted once at
// the dashboard level so it persists across every tab. Shows a per-pairing
// better-ball match-play status for the most relevant round with scores —
// any round type (practice or tournament) qualifies.
//
// Round selection priority (see the selection memo below):
//   1. Today's date matches a round's scheduled date AND scores exist
//   2. Any round in progress (scores exist, not complete), regardless of date
//   3. (Subsumed by 2) Outside the trip dates, an in-progress round still surfaces
// A round only ever surfaces once it has scores, so a past-dated round with no
// scores is excluded; a round with scores is never excluded by date alone.
//
// Other visibility gates:
//   • a COMPLETED round's result only shows during the trip dates; an
//     in-progress round can surface the banner any day
//   • hidden at or after 9pm (re-checked every 60s)
//   • hidden when no holes have been scored yet
//   • dismissible with × — in-memory only, so it returns on the next load

// Local YYYY-MM-DD (not UTC) so the date comparison matches the user's day.
function todayIsoLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Points Match Play status text + "thru" text.
// Tied → "All Square"; otherwise "{leading team name} lead {hi}-{lo}".
// No holes scored → "Match not started".
function pointsSummary(row, n1, n2) {
  if (row.thru === 0) return { text: 'Match not started', thru: '' }
  if (row.t1pts === row.t2pts) return { text: 'All Square', thru: `Thru ${row.thru}` }
  const leadName = row.t1pts > row.t2pts ? n1 : n2
  const hi = Math.max(row.t1pts, row.t2pts)
  const lo = Math.min(row.t1pts, row.t2pts)
  return { text: `${leadName} lead ${hi}-${lo}`, thru: `Thru ${row.thru}` }
}

// Standard Match Play status text + "thru" text.
// Tied → "All Square"; otherwise "{leading team name} lead {margin}".
// Closed → final result only, no thru. No scores → "Match not started".
function standardStatus(row, n1, n2) {
  if (row.closed) {
    const name = row.winner === 'T1' ? n1 : n2
    return { text: `${name} win ${row.finalMargin}`, thru: '' }
  }
  if (row.thru === 0) return { text: 'Match not started', thru: '' }
  if (row.leader == null) return { text: 'All Square', thru: `Thru ${row.thru}` }
  const name = row.leader === 'T1' ? n1 : n2
  return { text: `${name} lead ${row.statusShort}`, thru: `Thru ${row.thru}` }
}

export default function LiveScoreBanner({ trip, rounds, teams }) {
  const [dismissed, setDismissed] = useState(false)
  const [pairings, setPairings] = useState([])
  const [pairingPlayers, setPairingPlayers] = useState([])
  const [scoresMap, setScoresMap] = useState({})
  const [hcpByPlayer, setHcpByPlayer] = useState({})
  const [teeRowMap, setTeeRowMap] = useState({}) // `${roundId}:${tpId}` -> player_rounds row
  // Bumped every 60s so the 9pm cutoff is re-evaluated.
  const [, setClockTick] = useState(0)
  const channelRef = useRef(null)

  const allowance = trip?.handicap_allowance ?? 100
  const isStandard = trip?.format === 'standard_match_play'

  // Today's local date, for the round-selection priority (any round type).
  const todayISO = todayIsoLocal()

  // Every round (any type) is a candidate — selection is decided by scores +
  // date in the memo below, so we fetch/track them all.
  const allRoundIds = useMemo(() => rounds.map(r => r.id), [rounds])
  const allRoundKey = allRoundIds.join(',')

  // Re-check the 9pm cutoff every 60 seconds.
  useEffect(() => {
    const id = setInterval(() => setClockTick(t => t + 1), 60000)
    return () => clearInterval(id)
  }, [])

  // Fetch pairings / scores / handicaps for every round, and stay live.
  useEffect(() => {
    if (!trip?.id || allRoundIds.length === 0) return
    let cancelled = false

    async function loadScores() {
      const { data } = await supabase
        .from('scores').select('round_id, trip_player_id, hole_number, gross_score')
        .in('round_id', allRoundIds)
      if (cancelled) return
      const map = {}
      ;(data || []).forEach(s => {
        if (s.gross_score != null) map[`${s.round_id}:${s.trip_player_id}:${s.hole_number}`] = s.gross_score
      })
      setScoresMap(map)
    }

    // Per-player tee selections (drive each player's course handicap).
    async function loadPlayerRounds() {
      const { data } = await supabase
        .from('player_rounds').select('trip_player_id, round_id, tee_name, slope, rating, par')
        .in('round_id', allRoundIds)
      if (cancelled) return
      const map = {}
      ;(data || []).forEach(pr => { map[`${pr.round_id}:${pr.trip_player_id}`] = pr })
      setTeeRowMap(map)
    }

    async function loadAll() {
      const [pairRes, tpRes] = await Promise.all([
        supabase.from('pairings').select('id, round_id, pairing_number').in('round_id', allRoundIds),
        supabase.from('trip_players').select('id, handicap_index').eq('trip_id', trip.id),
      ])
      const pairs = pairRes.data || []
      const pairIds = pairs.map(p => p.id)
      let pp = []
      if (pairIds.length) {
        const { data } = await supabase.from('pairing_players')
          .select('pairing_id, trip_player_id, team_slot').in('pairing_id', pairIds)
        pp = data || []
      }
      if (cancelled) return
      const hcp = {}
      ;(tpRes.data || []).forEach(tp => { hcp[tp.id] = tp.handicap_index })
      setPairings(pairs)
      setPairingPlayers(pp)
      setHcpByPlayer(hcp)
      await loadScores()
      await loadPlayerRounds()
    }

    loadAll()

    // Live updates: a score change OR a commissioner tee change refreshes the tally.
    // Unique topic per subscription so channel() never returns an already-subscribed
    // channel (which would make the chained .on() calls throw).
    const ch = supabase.channel(uniqueChannelName(`live-banner:${allRoundKey}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, payload => {
        const rid = payload.new?.round_id ?? payload.old?.round_id
        if (rid && allRoundIds.includes(rid)) loadScores()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_rounds' }, payload => {
        const rid = payload.new?.round_id ?? payload.old?.round_id
        if (rid && allRoundIds.includes(rid)) loadPlayerRounds()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pairing_players' }, () => loadAll())
      // A handicap-index (HI) edit recalculates the live tally (HI is never stored).
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_players', filter: `trip_id=eq.${trip.id}` }, () => loadAll())
      .subscribe()
    channelRef.current = ch

    return () => {
      cancelled = true
      channelRef.current = null
      supabase.removeChannel(ch)
    }
  }, [trip?.id, allRoundKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Visibility gates ────────────────────────────────────────────
  const now = new Date()
  const beforeNine = now.getHours() < 21

  // Round selection by priority. Only rounds that already have scores can
  // surface (so a past-dated, score-less round is excluded automatically; a
  // round with scores is never excluded by date alone).
  //   1. Today's scheduled round with scores (prefer in-progress, then most holes)
  //   2. Any in-progress round (scores, not complete), regardless of date
  //      — this also covers "outside trip dates, an in-progress round surfaces"
  const { round, tallies } = useMemo(() => {
    // Per-round summary, keeping only rounds that have at least one scored hole.
    // 'none' rounds are placeholders and never surface the banner.
    const summaries = rounds.filter(r => r.round_type !== 'none').map(r => {
      const t = isStandard
        ? liveStandardMatchTally(r, pairings, pairingPlayers, scoresMap, hcpByPlayer, allowance, teeRowMap)
        : liveMatchTally(r, pairings, pairingPlayers, scoresMap, hcpByPlayer, allowance, teeRowMap)
      // "scored" surfaces a round once any hole has a score (both tallies expose thru).
      const scored = t.reduce((a, p) => a + (p.thru || 0), 0)
      return { round: r, tallies: t, scored, complete: t.length > 0 && t.every(p => p.complete) }
    }).filter(sum => sum.scored > 0)

    if (summaries.length === 0) return { round: null, tallies: [] }

    // In-progress first (complete sorts last), then most holes scored.
    const pickBest = list => list.slice().sort(
      (a, b) => (Number(a.complete) - Number(b.complete)) || (b.scored - a.scored),
    )[0]

    // Priority 1: today's scheduled round(s) with scores.
    const todays = summaries.filter(sum => sum.round.date === todayISO)
    if (todays.length) { const best = pickBest(todays); return { round: best.round, tallies: best.tallies } }

    // Priority 2 & 3: any in-progress round with scores, regardless of date.
    const inProgress = summaries.filter(sum => !sum.complete)
    if (inProgress.length) { const best = pickBest(inProgress); return { round: best.round, tallies: best.tallies } }

    return { round: null, tallies: [] }
  }, [rounds, pairings, pairingPlayers, scoresMap, hcpByPlayer, teeRowMap, allowance, todayISO, isStandard])

  const anyHolesScored = tallies.some(t => t.thru > 0)

  // Completed-round results only show during the trip dates; an in-progress
  // round can surface the banner any day.
  const inTripWindow = trip?.start_date && trip?.end_date
    && todayISO >= trip.start_date && todayISO <= trip.end_date
  const selectedComplete = tallies.length > 0 && tallies.every(t => t.complete)

  if (dismissed || !beforeNine || !round || !anyHolesScored) return null
  if (selectedComplete && !inTripWindow) return null

  const n1 = getTeamDisplayName(teams?.[0]) || 'Team 1'
  const n2 = getTeamDisplayName(teams?.[1]) || 'Team 2'

  const visibleRows = tallies.filter(t => t.hasMatch)

  return (
    <div style={s.float} role="status" aria-label="Live score">
      <button style={s.close} onClick={() => setDismissed(true)} aria-label="Dismiss live score">×</button>
      <div style={s.header}>
        <span style={s.courseName}>{round.club_name || round.course_name}</span>
        <span style={s.headerSep}>·</span>
        <span style={s.liveLabel}>Live Match</span>
      </div>
      <div style={s.rows}>
        {visibleRows.map(t => {
          const st = isStandard ? standardStatus(t, n1, n2) : pointsSummary(t, n1, n2)
          return (
            <div key={t.pairingNumber} style={s.row}>
              <span style={s.pairLabel}>Pairing {t.pairingNumber}</span>
              <span style={s.status}>{st.text}</span>
              <span style={s.thru}>{st.thru}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const s = {
  float: {
    position: 'fixed',
    left: 16,
    right: 16,
    bottom: 'calc(16px + env(safe-area-inset-bottom))',
    maxWidth: 398,
    margin: '0 auto',
    background: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    zIndex: 150,
    boxShadow: '0 4px 20px rgba(13,27,42,0.18)',
  },
  close: {
    position: 'absolute', top: 8, right: 10, width: 22, height: 22,
    background: 'none', border: 'none', color: '#BBBBBB', fontSize: 18,
    lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit', padding: 0,
  },
  header: {
    display: 'flex', alignItems: 'baseline', gap: 6,
    marginBottom: 12, paddingRight: 18,
  },
  courseName: { fontSize: 14, fontWeight: 500, color: '#1A1A1A' },
  headerSep: { fontSize: 13, color: '#999999' },
  liveLabel: {
    fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5,
    color: '#B8860B', fontWeight: 700,
  },
  rows: { display: 'flex', flexDirection: 'column', gap: 9 },
  row: { display: 'flex', alignItems: 'center', gap: 8 },
  pairLabel: { fontSize: 12, color: '#888888', minWidth: 62, fontWeight: 400 },
  status: { fontSize: 14, fontWeight: 700, color: '#1A1A1A', flex: 1, textAlign: 'center' },
  thru: { fontSize: 12, color: '#888888', fontWeight: 400, textAlign: 'right', minWidth: 52 },
}
