import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { analyzeScoring, playerName, initialsOf, formatVsPar, isTournamentRound } from '../lib/scoring'

// Daily MVPs — shows "Most Points" and "Best Net" once a round today is complete.

function toIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const styles = {
  card: { background: '#FFFFFF', border: '1px solid #DDE3EA', borderRadius: '10px', padding: '14px', marginBottom: '10px' },
  header: { background: '#1B3F6E', color: '#fff', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', margin: '-14px -14px 12px', padding: '10px 14px', borderRadius: '10px 10px 0 0' },
  row: { display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderBottom: '1px solid #E8EDF3' },
  rowLast: { borderBottom: 'none' },
  label: { fontSize: '11px', color: '#7A8FA6', textTransform: 'uppercase', letterSpacing: '0.8px', minWidth: '80px' },
  avatar: { width: '36px', height: '36px', borderRadius: '50%', background: '#E8EDF3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#1B3F6E', flexShrink: 0 },
  name: { fontSize: '14px', fontWeight: 700, color: '#0D1B2A', flex: 1 },
  stat: { fontSize: '13px', fontWeight: 700, color: '#1B3F6E' },
  placeholder: { fontSize: '13px', color: '#7A8FA6', fontStyle: 'italic', padding: '8px 0' },
}

export default function DailyMVPCard({ tripId, today }) {
  const [state, setState] = useState({ status: 'loading' })
  const [hiTick, setHiTick] = useState(0) // bumped on HI change to recompute standings

  // Live HI propagation: a handicap-index edit re-runs the standings calc, so the
  // MVP/leaderboard numbers (analyzeScoring) reflect the current HI immediately.
  useEffect(() => {
    const ch = supabase.channel(`mvp-hi-${tripId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_players', filter: `trip_id=eq.${tripId}` }, () => setHiTick(t => t + 1))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [tripId])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const todayIso = toIso(today)

      const { data: todaysRounds } = await supabase
        .from('rounds').select('*').eq('trip_id', tripId).eq('date', todayIso)

      // No rounds scheduled today → show the placeholder state.
      if (!todaysRounds || todaysRounds.length === 0) {
        if (!cancelled) setState({ status: 'incomplete' })
        return
      }

      const roundIds = todaysRounds.map(r => r.id)

      const [scoresRes, holesRes, pairingsRes, tpRes, prRes] = await Promise.all([
        supabase.from('scores').select('round_id, hole_number, trip_player_id, gross_score').in('round_id', roundIds),
        supabase.from('course_holes').select('round_id, hole_number, par, stroke_index').in('round_id', roundIds),
        supabase.from('pairings').select('id, round_id, pairing_number').in('round_id', roundIds),
        supabase.from('trip_players').select('id, user_id, guest_name, handicap_index, team_id').eq('trip_id', tripId),
        supabase.from('player_rounds').select('trip_player_id, round_id, tee_name, slope, rating, par').in('round_id', roundIds),
      ])

      const pairings = pairingsRes.data || []
      const pairingIds = pairings.map(p => p.id)
      let pairingPlayers = []
      if (pairingIds.length > 0) {
        const ppRes = await supabase.from('pairing_players').select('id, pairing_id, trip_player_id').in('pairing_id', pairingIds)
        pairingPlayers = ppRes.data || []
      }

      const tripPlayers = tpRes.data || []
      const userIds = tripPlayers.map(p => p.user_id).filter(Boolean)
      const profileMap = {}
      if (userIds.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, display_name').in('id', userIds)
        if (profs) profs.forEach(p => { profileMap[p.id] = p.display_name })
      }

      const data = {
        rounds: todaysRounds,
        scores: scoresRes.data || [],
        courseHoles: holesRes.data || [],
        pairings,
        pairingPlayers,
        tripPlayers,
        playerRounds: prRes.data || [],
      }

      const todayRoundIds = new Set(roundIds)
      const { completeRoundIds, pointsByPlayer, vsParByPlayer } = analyzeScoring(data, todayRoundIds)

      const completeToday = todaysRounds.filter(r => completeRoundIds.has(r.id) && isTournamentRound(r))

      if (cancelled) return

      if (completeToday.length === 0) {
        setState({ status: 'incomplete' })
        return
      }

      const pInfo = new Map(tripPlayers.map(tp => {
        const name = playerName(tp, profileMap)
        return [tp.id, { name, initials: initialsOf(name) }]
      }))

      // Most Points: highest points total.
      let mostPoints = null
      for (const [tp, pts] of pointsByPlayer) {
        if (!mostPoints || pts > mostPoints.pts) mostPoints = { tp, pts }
      }

      // Best Net: lowest cumulative net vs par.
      let bestNet = null
      for (const [tp, val] of vsParByPlayer) {
        if (!bestNet || val < bestNet.val) bestNet = { tp, val }
      }

      setState({
        status: 'ready',
        completeCount: completeToday.length,
        roundName: completeToday.length === 1 ? completeToday[0].course_name : null,
        mostPoints: mostPoints ? { ...pInfo.get(mostPoints.tp), pts: mostPoints.pts } : null,
        bestNet: bestNet ? { ...pInfo.get(bestNet.tp), val: bestNet.val } : null,
      })
    }
    load()
    return () => { cancelled = true }
  }, [tripId, today, hiTick])

  // Always render. Show the placeholder until a round today is complete.
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
    : `Daily MVPs — ${state.roundName}`

  return (
    <div style={styles.card}>
      <div style={styles.header}>{headerText}</div>

      {/* Most Points */}
      <div style={styles.row}>
        <span style={styles.label}>Most Points</span>
        <div style={styles.avatar}>{state.mostPoints ? state.mostPoints.initials : '—'}</div>
        <span style={styles.name}>{state.mostPoints ? state.mostPoints.name : 'No scores yet'}</span>
        <span style={styles.stat}>{state.mostPoints ? `${state.mostPoints.pts} pts` : ''}</span>
      </div>

      {/* Best Net */}
      <div style={{ ...styles.row, ...styles.rowLast }}>
        <span style={styles.label}>Best Net</span>
        <div style={styles.avatar}>{state.bestNet ? state.bestNet.initials : '—'}</div>
        <span style={styles.name}>{state.bestNet ? state.bestNet.name : '—'}</span>
        <span style={styles.stat}>{state.bestNet ? formatVsPar(state.bestNet.val) : ''}</span>
      </div>
    </div>
  )
}
