import { useEffect, useMemo, useState } from 'react'
import { supabase, uniqueChannelName } from '../lib/supabase'
import { individualStandings, teamStandings, leaderboardRounds, playerName, roundCourseName } from '../lib/scoring'
import { individualBoardRows } from '../lib/leaderboardView'
import { teamColor, colorIndexOf } from '../lib/teamColors'
import { loadLeaderboardData, withUnsyncedScores } from '../lib/leaderboardData'
import { useResumeRefetch } from '../lib/useResumeRefetch'
import { useScoreSync } from '../lib/useScoreSync'
import TeamScoreboard from './TeamScoreboard'
import LeaderboardPills from './LeaderboardPills'

// Stableford / Stroke Play Leaderboard (layout "A", picked 2026-10-29): the
// Ryder Cup–style team blocks on top when the trip has teams (team score = sum of
// members' Stableford points, or members' net to par for stroke play), then one
// ranked player list — Thru · Today · Total. Pills switch between the trip total
// and a single round (labelled by course). All numbers come from scoring.js (individualStandings /
// teamStandings); wording from leaderboardView.js. Live: refetches on any score,
// tee, pairing or handicap change (same pattern as the match-play boards).
const st = {
  card: { background: 'var(--bg1)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-card)' },
  row: { display: 'grid', alignItems: 'center', padding: '10px 12px', fontSize: 14 },
  head: { fontSize: 10, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--muted)', padding: '8px 12px' },
  line: { borderTop: '1px solid var(--bg2)' },
  rank: { fontWeight: 800, color: 'var(--navy)' },
  name: { fontWeight: 600, color: 'var(--cream)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  dot: { display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginRight: 7, verticalAlign: 1 },
  muted: { color: 'var(--muted)', textAlign: 'center' },
  num: { textAlign: 'center' },
  total: { fontWeight: 800, textAlign: 'right', color: 'var(--navy)' },
  empty: { padding: 16, textAlign: 'center', color: 'var(--muted)', fontStyle: 'italic', fontSize: 13 },
  note: { fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 8 },
}

export default function IndividualLeaderboard({ trip, teams = [], rounds, gameType }) {
  const [data, setData] = useState(null)
  const [resumeTick, setResumeTick] = useState(0)
  useResumeRefetch(() => setResumeTick(t => t + 1))
  const [view, setView] = useState(null) // null = whole trip, else a round id

  const allowance = trip?.handicap_allowance ?? 100
  const lbRounds = leaderboardRounds(rounds)
  const roundIds = lbRounds.map(r => r.id)
  const roundKey = roundIds.join(',')
  const stroke = gameType === 'stroke'

  useEffect(() => {
    if (!trip?.id || roundIds.length === 0) return
    let cancelled = false
    async function loadAll() {
      const { data: d } = await loadLeaderboardData(supabase, trip.id, roundIds)
      if (!cancelled && d) setData(d)
    }
    loadAll()
    const ch = supabase.channel(uniqueChannelName(`individual-lb:${roundKey}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, payload => {
        const rid = payload.new?.round_id ?? payload.old?.round_id
        if (rid && roundIds.includes(rid)) loadAll()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_rounds' }, payload => {
        const rid = payload.new?.round_id ?? payload.old?.round_id
        if (rid && roundIds.includes(rid)) loadAll()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_players', filter: `trip_id=eq.${trip.id}` }, () => loadAll())
      .subscribe()
    return () => { cancelled = true; supabase.removeChannel(ch) }
  }, [trip?.id, roundKey, resumeTick]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scores entered on this phone with no signal (not yet synced) count too.
  const { pending: unsynced } = useScoreSync()
  const computed = useMemo(() => {
    if (!data) return null
    const d = withUnsyncedScores(data)
    const players = d.tripPlayers || []
    const teamOfPlayer = {}
    for (const p of players) if (p.team_id) teamOfPlayer[p.id] = p.team_id
    const inputs = { rounds, scoresMap: d.scoresMap, hcpByPlayer: d.hcpByPlayer, teeRowMap: d.teeRowMap, allowance }
    return {
      players,
      individual: individualStandings({ ...inputs, gameType, playerIds: players.map(p => p.id) }),
      team: teams.length
        ? teamStandings({ ...inputs, format: trip.format, teamIds: teams.map(t => t.id), teamOfPlayer })
        : null,
    }
  }, [roundKey, data, allowance, teams, trip.format, gameType, unsynced]) // eslint-disable-line react-hooks/exhaustive-deps

  const viewRound = view && lbRounds.some(r => r.id === view) ? view : null
  const rows = computed ? individualBoardRows({ gameType, standings: computed.individual, roundId: viewRound }) : []
  const playerById = new Map((computed?.players || []).map(p => [p.id, p]))
  const teamById = new Map(teams.map(t => [t.id, t]))

  // Columns: # · Player · Thru · Today · Total (+ Gross for stroke play). A single
  // round drops "Today" (it IS the round).
  const cols = viewRound
    ? `28px minmax(0,1fr) 40px ${stroke ? '44px ' : ''}52px`
    : `28px minmax(0,1fr) 40px 48px ${stroke ? '44px ' : ''}52px`
  const totalLabel = stroke ? 'Net' : (viewRound ? 'Pts' : 'Total')

  return (
    <div>
      {teams.length > 0 && (
        <TeamScoreboard trip={trip} teams={teams} rounds={lbRounds} standings={computed?.team ?? null} format={trip.format} />
      )}

      {lbRounds.length > 1 && (
        <LeaderboardPills
          ariaLabel="Leaderboard round"
          style={{ margin: '14px 0 10px' }}
          value={viewRound}
          onChange={setView}
          options={[{ id: null, label: 'Trip Total' }, ...lbRounds.map((r, i) => ({ id: r.id, label: roundCourseName(r) || r.course_name || `Round ${i + 1}` }))]}
        />
      )}
      {lbRounds.length <= 1 && <div style={{ height: 12 }} />}

      <div style={st.card}>
        <div style={{ ...st.row, ...st.head, gridTemplateColumns: cols }}>
          <span>#</span><span>Player</span><span style={st.num}>Thru</span>
          {!viewRound && <span style={st.num}>Today</span>}
          {stroke && <span style={st.num}>Gross</span>}
          <span style={{ textAlign: 'right' }}>{totalLabel}</span>
        </div>
        {lbRounds.length === 0 && <div style={st.empty}>No rounds yet</div>}
        {lbRounds.length > 0 && !computed && <div style={st.empty}>Loading…</div>}
        {computed && rows.length === 0 && <div style={st.empty}>No players yet</div>}
        {rows.map(r => {
          const p = playerById.get(r.id)
          const team = p?.team_id ? teamById.get(p.team_id) : null
          return (
            <div key={r.id} style={{ ...st.row, ...st.line, gridTemplateColumns: cols }}>
              <span style={st.rank}>{r.rank}</span>
              <span style={st.name}>
                {team && <i style={{ ...st.dot, background: teamColor(colorIndexOf(team)).solid }} />}
                {playerName(p)}
              </span>
              <span style={st.muted}>{r.thru}</span>
              {!viewRound && <span style={st.num}>{r.today}</span>}
              {stroke && <span style={st.muted}>{r.gross}</span>}
              <span style={st.total}>{r.total}</span>
            </div>
          )
        })}
      </div>
      <div style={st.note}>
        {stroke
          ? 'Net and gross shown vs par. Lowest net wins.'
          : 'Net Stableford: par 2 · birdie 3 · bogey 1 · double or worse 0. Most points wins.'}
      </div>
    </div>
  )
}
