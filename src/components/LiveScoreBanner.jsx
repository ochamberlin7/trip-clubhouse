import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { supabase, uniqueChannelName } from '../lib/supabase'
import { liveMatchTally, liveStandardMatchTally } from '../lib/scoring'
import { getTeamDisplayName, isDefaultTeamName } from '../lib/teamColors'

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

// Maps a leading side (0 = Team 1, 1 = Team 2, null = tied) to the status
// colour class used by the banner (t1lead → navy, t2lead → teal, tied → cream2).
function sideClass(side) {
  return side === 0 ? 't1lead' : side === 1 ? 't2lead' : 'tied'
}

// Points Match Play status text + leading side (0/1/null) + "thru" text.
// Tied → "All Square"; otherwise "{leading team name} lead {hi}–{lo}".
// No holes scored → "Match not started".
function pointsSummary(row, n1, n2) {
  if (row.thru === 0) return { text: 'Match not started', side: null, thru: '' }
  if (row.t1pts === row.t2pts) return { text: 'All Square', side: null, thru: `Thru ${row.thru}` }
  const side = row.t1pts > row.t2pts ? 0 : 1
  const leadName = side === 0 ? n1 : n2
  const hi = Math.max(row.t1pts, row.t2pts)
  const lo = Math.min(row.t1pts, row.t2pts)
  // Default "Team N" is a singular subject → "leads"; a custom name is treated as
  // a plural collective noun per sports convention → "lead" ("Grandmas lead 6–5").
  const verb = isDefaultTeamName(leadName) ? 'leads' : 'lead'
  return { text: `${leadName} ${verb} ${hi}–${lo}`, side, thru: `Thru ${row.thru}` }
}

// Standard Match Play status text + leading side (0/1/null) + "thru" text.
//   • closed out early (not played to 18) → "{winner} wins {margin} & {holesLeft}"
//   • closed on the 18th (ran the full round) → "{winner} win {margin}"
//   • in progress, tied → "All Square"
//   • in progress, otherwise → "{leading team name} {N} Up"
//   • no scores → "Match not started"
// finalMargin from standardMatchTally already encodes both numbers for an early
// close ("3&2" = 3 up with 2 holes remaining) and is "NUP" when it ran to 18 —
// so the "&" form is exactly the early-closeout case, and holesRemaining is the
// value it already tracked (no need to re-derive margin−1, which the dormie-then-
// win case would get wrong anyway).
function standardStatus(row, n1, n2) {
  if (row.closed) {
    const side = row.winner === 'T1' ? 0 : 1
    const name = side === 0 ? n1 : n2
    const parts = String(row.finalMargin).split('&')
    if (parts.length === 2) {
      // Early closeout, e.g. finalMargin "3&2" → "Grandmas wins 3 & 2".
      return { text: `${name} wins ${parts[0]} & ${parts[1]}`, side, thru: '' }
    }
    // Ran the full 18 (finalMargin "NUP") — keep the existing result wording.
    return { text: `${name} win ${row.finalMargin}`, side, thru: '' }
  }
  if (row.thru === 0) return { text: 'Match not started', side: null, thru: '' }
  if (row.leader == null) return { text: 'All Square', side: null, thru: `Thru ${row.thru}` }
  const side = row.leader === 'T1' ? 0 : 1
  const name = side === 0 ? n1 : n2
  // A default "Team N" ends in a digit that would run straight into the score
  // ("Team 2 1 Up"); separate them with a dash. Custom names read fine as-is.
  const sep = isDefaultTeamName(name) ? ' – ' : ' '
  return { text: `${name}${sep}${Math.abs(row.lead)} Up`, side, thru: `Thru ${row.thru}` }
}

export default function LiveScoreBanner({ trip, rounds, teams }) {
  const [pairings, setPairings] = useState([])
  const [pairingPlayers, setPairingPlayers] = useState([])
  const [scoresMap, setScoresMap] = useState({})
  const [hcpByPlayer, setHcpByPlayer] = useState({})
  const [teeRowMap, setTeeRowMap] = useState({}) // `${roundId}:${tpId}` -> player_rounds row
  // Bumped every 60s so the 9pm cutoff is re-evaluated.
  const [, setClockTick] = useState(0)
  const channelRef = useRef(null)
  const bannerRef = useRef(null) // outer float, for measuring its rendered height

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
      // Guard the format branch: a throw here would otherwise bubble out of render
      // and silently blank the banner. Log it so a format-specific data problem is
      // visible instead of invisible. (Item 3 bug investigation.)
      let t = []
      try {
        t = isStandard
          ? liveStandardMatchTally(r, pairings, pairingPlayers, scoresMap, hcpByPlayer, allowance, teeRowMap)
          : liveMatchTally(r, pairings, pairingPlayers, scoresMap, hcpByPlayer, allowance, teeRowMap)
      } catch (err) {
        console.error('[LiveScoreBanner] tally threw', { roundId: r.id, format: trip?.format, err })
        t = []
      }
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

  // ── Item 3 diagnostic: report exactly which gate hides the banner, without
  // changing any of the gate logic below. Remove once the bug is understood.
  const hiddenBy = !beforeNine ? '9pm cutoff (local hour >= 21)'
    : !round ? 'no round selected (no round has scores yet, or pairings/pairing_players not loaded)'
    : !anyHolesScored ? 'zero holes scored across the selected round'
    : (selectedComplete && !inTripWindow) ? 'selected round is COMPLETE and today is outside the trip date window'
    : null
  console.log('[LiveScoreBanner] gate check', {
    format: trip?.format,
    hiddenBy: hiddenBy || '(visible)',
    localHour: now.getHours(), beforeNine,
    todayISO, tripStart: trip?.start_date, tripEnd: trip?.end_date, inTripWindow,
    round: round ? { id: round.id, date: round.date, type: round.round_type } : null,
    anyHolesScored, selectedComplete,
    pairings: tallies.map(t => ({
      pairing: t.pairingNumber, thru: t.thru, complete: t.complete, closed: t.closed,
    })),
  })

  // Whether the banner will actually render (mirrors the two gates below). Used by
  // the measuring effect, which must run unconditionally before any early return.
  const shouldRender = beforeNine && !!round && anyHolesScored && !(selectedComplete && !inTripWindow)
  const rowCount = tallies.filter(t => t.hasMatch).length

  // Publish the banner's occupied height (its rendered height + fixed bottom
  // offset + a small gap) to a CSS variable so scrollable views can pad their
  // bottom and let their last rows scroll clear of the fixed banner. The height is
  // variable (one row per active pairing), so measure the real node and track it
  // with a ResizeObserver; reset to 0 whenever the banner isn't shown.
  useLayoutEffect(() => {
    const root = document.documentElement
    const el = bannerRef.current
    if (!el) { root.style.setProperty('--live-banner-space', '0px'); return }
    const measure = () => {
      const rect = el.getBoundingClientRect()
      // innerHeight − top spans the banner plus the gap beneath it to the viewport
      // bottom, so this stays correct for any height / safe-area inset.
      const space = Math.max(0, Math.ceil(window.innerHeight - rect.top + 12))
      root.style.setProperty('--live-banner-space', space + 'px')
    }
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', measure)
      root.style.setProperty('--live-banner-space', '0px')
    }
  }, [shouldRender, rowCount])

  if (!beforeNine || !round || !anyHolesScored) return null
  if (selectedComplete && !inTripWindow) return null

  const n1 = getTeamDisplayName(teams?.[0]) || 'Team 1'
  const n2 = getTeamDisplayName(teams?.[1]) || 'Team 2'

  const visibleRows = tallies.filter(t => t.hasMatch)

  return (
    <div ref={bannerRef} className="match-banner-float visible" id="match-banner-float" role="status" aria-label="Live score">
      <div className="match-banner-round">{round.club_name || round.course_name} · Live Match</div>
      <div className="match-banner-rows">
        {visibleRows.map(t => {
          const st = isStandard ? standardStatus(t, n1, n2) : pointsSummary(t, n1, n2)
          return (
            <div className="match-banner-row" key={t.pairingNumber}>
              <span className="match-banner-pair-label">Pairing {t.pairingNumber}</span>
              <span className={`match-banner-status ${sideClass(st.side)}`}>{st.text}</span>
              <span className="match-banner-thru">{st.thru}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
