import { useEffect, useState } from 'react'
import { supabase, uniqueChannelName } from '../lib/supabase'
import { analyzeScoring, playerName, initialsOf, formatVsPar, isTournamentRound } from '../lib/scoring'

// Daily MVPs — the day's best performer in three categories: Most Points, Best
// Net, and Most Drinks. Appears once a tournament round scheduled today is
// complete, aggregating across every completed round of the day (multi-round
// days show "Today (N rounds)"). Hidden entirely once the trip ends.
//
// "Today" uses a 4 AM reset: a golf day runs 4 AM → 4 AM, so late-night entries
// (before 4 AM) still count toward the day that just finished. NOTE: this is the
// user's LOCAL time — the trip has no timezone field, so it can't be made
// trip-timezone-aware without one.

// Golf-day ISO (YYYY-MM-DD): local date after shifting back 4 hours.
function golfDayIso(now) {
  const d = new Date(now.getTime() - 4 * 60 * 60 * 1000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const NAVY = '#1B3F6E'
const GREY = '#8a96a3'
const styles = {
  card: { background: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '16px', overflow: 'hidden' },
  header: { background: NAVY, color: '#fff', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '12px 16px' },
  row: { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderBottom: '1px solid #e5e7eb' },
  rowLast: { borderBottom: 'none' },
  label: { fontSize: '10px', color: GREY, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, minWidth: '72px', flexShrink: 0 },
  avatar: { width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 600, flexShrink: 0 },
  avatarFilled: { background: '#f0f3f7', color: NAVY },
  avatarEmpty: { background: '#e8eaef', color: GREY },
  name: { fontSize: '13px', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  value: { fontSize: '13px', fontWeight: 600, color: NAVY, textAlign: 'right', flexShrink: 0 },
  placeholder: { fontSize: '13px', color: GREY, fontStyle: 'italic', padding: '14px 16px' },
}

// One category row: filled shows initials avatar + name + value; empty shows an
// em-dash avatar + "No <category> yet" in grey.
function MvpRow({ label, mvp, emptyText, value, last }) {
  return (
    <div style={{ ...styles.row, ...(last ? styles.rowLast : null) }}>
      <span style={styles.label}>{label}</span>
      <div style={{ ...styles.avatar, ...(mvp ? styles.avatarFilled : styles.avatarEmpty) }}>{mvp ? mvp.initials : '—'}</div>
      <span style={{ ...styles.name, color: mvp ? NAVY : GREY }}>{mvp ? mvp.name : emptyText}</span>
      <span style={styles.value}>{mvp ? value : ''}</span>
    </div>
  )
}

export default function DailyMVPCard({ tripId, endDate }) {
  const [dayIso, setDayIso] = useState(() => golfDayIso(new Date()))
  const [state, setState] = useState({ status: 'loading' })
  const [tick, setTick] = useState(0) // bumped by realtime changes to recompute

  // Re-check the golf day every minute so a 4 AM rollover reset applies while the
  // app stays open (reopening recomputes from scratch on load). Same primitive →
  // React bails, so no needless refetch.
  useEffect(() => {
    const id = setInterval(() => setDayIso(golfDayIso(new Date())), 60000)
    return () => clearInterval(id)
  }, [])

  // Live recompute on any score / drink / handicap-index change (debounced).
  useEffect(() => {
    let t = null
    const bump = () => { if (t) clearTimeout(t); t = setTimeout(() => setTick(x => x + 1), 400) }
    const ch = supabase.channel(uniqueChannelName(`mvp-${tripId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drinks' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_players', filter: `trip_id=eq.${tripId}` }, bump)
      .subscribe()
    return () => { if (t) clearTimeout(t); supabase.removeChannel(ch) }
  }, [tripId])

  const isPostTrip = !!endDate && dayIso > endDate

  useEffect(() => {
    if (isPostTrip) return // hidden after the trip — skip fetching
    let cancelled = false
    async function load() {
      const { data: todaysRounds } = await supabase
        .from('rounds').select('*').eq('trip_id', tripId).eq('date', dayIso)
      if (!todaysRounds || todaysRounds.length === 0) { if (!cancelled) setState({ status: 'incomplete' }); return }

      const roundIds = todaysRounds.map(r => r.id)
      const [scoresRes, pairingsRes, tpRes, prRes, drinksRes] = await Promise.all([
        supabase.from('scores').select('round_id, hole_number, trip_player_id, gross_score').in('round_id', roundIds),
        supabase.from('pairings').select('id, round_id, pairing_number').in('round_id', roundIds),
        supabase.from('trip_players').select('id, user_id, first_name, last_name, guest_name, handicap_index, team_id').eq('trip_id', tripId),
        supabase.from('player_rounds').select('trip_player_id, round_id, tee_name, slope, rating, par').in('round_id', roundIds),
        supabase.from('drinks').select('round_id, trip_player_id, count').in('round_id', roundIds),
      ])

      const pairings = pairingsRes.data || []
      const pairingIds = pairings.map(p => p.id)
      let pairingPlayers = []
      if (pairingIds.length > 0) {
        const ppRes = await supabase.from('pairing_players').select('id, pairing_id, trip_player_id, team_slot').in('pairing_id', pairingIds)
        pairingPlayers = ppRes.data || []
      }

      const tripPlayers = tpRes.data || []
      const userIds = tripPlayers.map(p => p.user_id).filter(Boolean)
      const profileMap = {}
      if (userIds.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, display_name').in('id', userIds)
        if (profs) profs.forEach(p => { profileMap[p.id] = p.display_name })
      }

      // Par + stroke index come from each round's holes JSON (the course_holes
      // table is never populated) — the same source StatsTab uses.
      const courseHoles = []
      for (const r of todaysRounds) {
        if (!Array.isArray(r.holes)) continue
        r.holes.forEach((h, i) => courseHoles.push({
          round_id: r.id, hole_number: i + 1,
          par: h?.par ?? null,
          stroke_index: h?.stroke_index ?? h?.handicap ?? null,
        }))
      }

      const data = { rounds: todaysRounds, scores: scoresRes.data || [], courseHoles, pairings, pairingPlayers, tripPlayers, playerRounds: prRes.data || [] }
      const todayRoundIds = new Set(roundIds)
      const { completeRoundIds, pointsByPlayer, vsParByPlayer } = analyzeScoring(data, todayRoundIds)
      const completeToday = todaysRounds.filter(r => completeRoundIds.has(r.id) && isTournamentRound(r))

      if (cancelled) return
      if (completeToday.length === 0) { setState({ status: 'incomplete' }); return }

      const pInfo = new Map(tripPlayers.map(tp => {
        const name = playerName(tp, profileMap)
        return [tp.id, { name, initials: initialsOf(name) }]
      }))

      // Most Points: highest points total across the day's completed rounds.
      let mostPoints = null
      for (const [tp, pts] of pointsByPlayer) if (!mostPoints || pts > mostPoints.pts) mostPoints = { tp, pts }

      // Best Net: lowest cumulative net vs par.
      let bestNet = null
      for (const [tp, val] of vsParByPlayer) if (!bestNet || val < bestNet.val) bestNet = { tp, val }

      // Most Drinks today: per-round drink counts summed per player. manual_drinks
      // is trip-wide (no date), so it isn't part of a per-day stat.
      const drinkByTp = new Map()
      for (const d of (drinksRes.data || [])) drinkByTp.set(d.trip_player_id, (drinkByTp.get(d.trip_player_id) || 0) + (d.count || 0))
      let mostDrinks = null
      for (const [tp, n] of drinkByTp) if (n > 0 && (!mostDrinks || n > mostDrinks.n)) mostDrinks = { tp, n }

      setState({
        status: 'ready',
        completeCount: completeToday.length,
        roundName: completeToday.length === 1 ? (completeToday[0].course_name || completeToday[0].club_name) : null,
        mostPoints: mostPoints ? { ...pInfo.get(mostPoints.tp), pts: mostPoints.pts } : null,
        bestNet: bestNet ? { ...pInfo.get(bestNet.tp), val: bestNet.val } : null,
        mostDrinks: mostDrinks ? { ...pInfo.get(mostDrinks.tp), n: mostDrinks.n } : null,
      })
    }
    load()
    return () => { cancelled = true }
  }, [tripId, dayIso, tick, isPostTrip])

  if (isPostTrip) return null // trip over — the Trip Summary card takes over

  if (state.status !== 'ready') {
    return (
      <div style={styles.card}>
        <div style={styles.header}>Daily MVPs</div>
        <div style={styles.placeholder}>MVPs will appear after the first round is complete</div>
      </div>
    )
  }

  const headerText = state.completeCount >= 2
    ? `Daily MVPs — Today (${state.completeCount} rounds)`
    : `Daily MVPs — ${state.roundName || 'Today'}`

  return (
    <div style={styles.card}>
      <div style={styles.header}>{headerText}</div>
      <MvpRow label="Most Points" mvp={state.mostPoints} emptyText="No scores yet" value={state.mostPoints ? `${state.mostPoints.pts} pts` : ''} />
      <MvpRow label="Best Net" mvp={state.bestNet} emptyText="No net scores yet" value={state.bestNet ? formatVsPar(state.bestNet.val) : ''} />
      <MvpRow label="Most Drinks" mvp={state.mostDrinks} emptyText="No drinks yet" value={state.mostDrinks ? `🍺 ${state.mostDrinks.n}` : ''} last />
    </div>
  )
}
