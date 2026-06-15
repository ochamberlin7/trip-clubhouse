import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { liveMatchTally } from '../lib/scoring'
import { teamColor, colorIndexOf, getTeamDisplayName } from '../lib/teamColors'

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

// Match-play status text + which team side (0/1) is ahead (null = tied).
function matchStatus(t1pts, t2pts, complete, n1, n2) {
  if (complete) {
    if (t1pts > t2pts) return { text: `${n1} win ${t1pts}–${t2pts}`, side: 0 }
    if (t2pts > t1pts) return { text: `${n2} win ${t2pts}–${t1pts}`, side: 1 }
    return { text: `Tied ${t1pts}–${t2pts}`, side: null }
  }
  if (t1pts > t2pts) return { text: `${n1} lead ${t1pts}–${t2pts}`, side: 0 }
  if (t2pts > t1pts) return { text: `${n2} lead ${t2pts}–${t1pts}`, side: 1 }
  return { text: 'All Square', side: null }
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
    const ch = supabase.channel(`live-banner:${allRoundKey}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, payload => {
        const rid = payload.new?.round_id ?? payload.old?.round_id
        if (rid && allRoundIds.includes(rid)) loadScores()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_rounds' }, payload => {
        const rid = payload.new?.round_id ?? payload.old?.round_id
        if (rid && allRoundIds.includes(rid)) loadPlayerRounds()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pairing_players' }, () => loadAll())
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
    const summaries = rounds.map(r => {
      const t = liveMatchTally(r, pairings, pairingPlayers, scoresMap, hcpByPlayer, allowance, teeRowMap)
      const scored = t.reduce((a, p) => a + p.holesScored, 0)
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
  }, [rounds, pairings, pairingPlayers, scoresMap, hcpByPlayer, teeRowMap, allowance, todayISO])

  const anyHolesScored = tallies.some(t => t.holesScored > 0)

  // Completed-round results only show during the trip dates; an in-progress
  // round can surface the banner any day.
  const inTripWindow = trip?.start_date && trip?.end_date
    && todayISO >= trip.start_date && todayISO <= trip.end_date
  const selectedComplete = tallies.length > 0 && tallies.every(t => t.complete)

  if (dismissed || !beforeNine || !round || !anyHolesScored) return null
  if (selectedComplete && !inTripWindow) return null

  const n1 = getTeamDisplayName(teams?.[0]) || 'Team 1'
  const n2 = getTeamDisplayName(teams?.[1]) || 'Team 2'
  const navy = teamColor(colorIndexOf(teams?.[0])).solid // Team 1 — navy
  const teal = teamColor(colorIndexOf(teams?.[1])).solid // Team 2 — teal
  const sideColor = side => (side === 0 ? navy : side === 1 ? teal : '#7A8FA6')

  const visibleRows = tallies.filter(t => t.holesScored > 0)

  return (
    <div style={s.float} role="status" aria-label="Live score">
      <button style={s.close} onClick={() => setDismissed(true)} aria-label="Dismiss live score">×</button>
      <div style={s.roundLabel}>{round.club_name || round.course_name} · Live Match</div>
      <div style={s.rows}>
        {visibleRows.map(t => {
          const st = matchStatus(t.t1pts, t.t2pts, t.complete, n1, n2)
          return (
            <div key={t.pairingNumber} style={s.row}>
              <span style={s.pairLabel}>Pairing {t.pairingNumber}</span>
              <span style={{ ...s.status, color: sideColor(st.side) }}>{st.text}</span>
              <span style={s.thru}>{t.complete ? 'Final' : `Thru ${t.holesScored}`}</span>
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
    border: '1px solid #DDE3EA',
    borderRadius: 12,
    padding: '10px 14px',
    zIndex: 150,
    boxShadow: '0 4px 20px rgba(13,27,42,0.18)',
  },
  close: {
    position: 'absolute', top: 6, right: 8, width: 22, height: 22,
    background: 'none', border: 'none', color: '#7A8FA6', fontSize: 18,
    lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit', padding: 0,
  },
  roundLabel: {
    fontSize: 10, textTransform: 'uppercase', letterSpacing: 1,
    color: '#1B3F6E', fontWeight: 700, marginBottom: 6, paddingRight: 18,
  },
  rows: { display: 'flex', flexDirection: 'column', gap: 4 },
  row: { display: 'flex', alignItems: 'center', gap: 6 },
  pairLabel: { fontSize: 10, color: '#7A8FA6', minWidth: 56, fontWeight: 600 },
  status: { fontSize: 13, fontWeight: 800, flex: 1 },
  thru: { fontSize: 11, color: '#7A8FA6', textAlign: 'right', minWidth: 44 },
}
