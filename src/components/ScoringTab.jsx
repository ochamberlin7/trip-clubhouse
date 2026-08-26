import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { strokesOnHole, netScore, rawCourseHandicapForTee, resolvePlayerTee, shotsGivenFromCourseHandicaps, standardMatchTally } from '../lib/scoring'
import { teamPillStyle, getTeamDisplayName, teamColor, colorIndexOf } from '../lib/teamColors'
import { useResumeRefetch } from '../lib/useResumeRefetch'
import PullToRefresh from './PullToRefresh'

// Live interactive scorecard — better-ball match play with drink tracking.
// Scores/drinks keyed by trip_player_id. Pairings use team_slot 1..4
// (1=T1P1, 2=T1P2, 3=T2P1, 4=T2P2). Strokes use low-ball playing handicaps
// (course handicap minus the pairing's lowest, times the trip's allowance %).

const SLOT_TEAM = { 1: 0, 2: 0, 3: 1, 4: 1 } // slot -> side (0 = team1_id, 1 = team2_id)
// Unassigned header slots render neutral gray (not pre-coloured by team) until a
// player is placed.
const EMPTY_TH = { background: '#E8EDF3', color: '#7A8FA6' }

// ── scoring math ──────────────────────────────────────────────────
function scoreClass(gross, par) {
  if (gross == null) return 'empty'
  if (par == null) return 'par'
  if (gross <= par - 2) return 'eagle'
  if (gross === par - 1) return 'birdie'
  if (gross === par) return 'par'
  if (gross === par + 1) return 'bogey'
  if (gross === par + 2) return 'double'
  return 'triple'
}
function firstName(name) { return (name || '').trim().split(/\s+/)[0] || '—' }

// Word-aware round pill name: drop generic suffixes, then fit ~12 chars or
// take the first two meaningful words.
function formatRoundPillName(clubName) {
  if (!clubName) return '—'
  const stripped = clubName
    // Drop generic suffixes and the filler word "of" (e.g. "TPC of Scottsdale"
    // → "TPC Scottsdale") so the abbreviated pill never reads "TPC of".
    .replace(/\b(Golf Club|Golf Course|Country Club|CC|GC|Golf|of)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (stripped.length <= 14) return stripped
  return stripped.split(' ').filter(Boolean).slice(0, 2).join(' ')
}
// Round-selection pill label. A commissioner-set scorecard_name wins (shown
// verbatim). Otherwise, for a course with a distinct sub-name (e.g. "Arcadia
// Bluffs" / "South", "Forest Dunes GC" / "The Loop - Red") use the sub-name;
// else fall back to the club/course name. Auto values get the abbreviator.
function roundPillName(r) {
  const manual = (r.scorecard_name || '').trim()
  if (manual) return manual
  const club = (r.club_name || '').trim()
  const course = (r.course_name || '').trim()
  const source = course && course !== club ? course : (club || course)
  return formatRoundPillName(source)
}
function initialsOf(p) {
  return `${(p?.first_name || '')[0] || ''}${(p?.last_name || '')[0] || ''}`.toUpperCase()
    || (p?.name || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

// Chevron arrow. Team on the LEFT (T1 / navy) points right (»); team on the
// RIGHT (T2 / green) points left («). Size defaults to the Point Match Play
// badge; callers pass a smaller size for the Standard status badge.
function Chevron({ dir, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      {dir === 'left' ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
    </svg>
  )
}

// Point Match Play: one filled circular badge per hole showing the hole winner.
//   • T1 (Owen/Monty, left)  → navy circle with » (right chevron)
//   • T2 (Nicole/Robert, right) → green circle with « (left chevron)
//   • halved → grey circle with an en-dash
//   • unscored → transparent placeholder (keeps the column aligned)
function PointsChip({ result }) {
  if (result === 'T1') return <span className="sc-pts-badge t1"><Chevron dir="right" size={14} /></span>
  if (result === 'T2') return <span className="sc-pts-badge t2"><Chevron dir="left" size={14} /></span>
  if (result === 'halve') return <span className="sc-pts-badge halve">–</span>
  return <span className="sc-pts-badge empty" aria-hidden="true" />
}

// Standard Match Play: one filled 52px circular badge per hole showing the
// cumulative match score (Option 9 design — a large number with a tiny inline
// "UP" label), coloured by the leading team.
//   • T1 (Owen/Monty) leading   → navy circle, big "N" + tiny "UP"
//   • T2 (Nicole/Robert) leading → green circle, big "N" + tiny "UP"
//   • all square → grey circle, "AS" (no "UP" label)
// Text is the running margin, or the closeout margin once decided ("NUP" split
// into number + "UP"; an early closeout like "3&2" is shown centred as-is).
// "Dormie N" collapses to "NUP" so it always fits the circle; the result banner
// still surfaces the full status.
function MatchCell({ entry }) {
  if (!entry || entry.statusShort == null) return <span className="sc-match-badge empty" aria-hidden="true" />
  const leaderClass = entry.leader === 'T1' ? 't1' : entry.leader === 'T2' ? 't2' : 'as'
  const absLead = Math.abs(entry.lead || 0)
  const text = entry.closed ? entry.statusShort : absLead === 0 ? 'AS' : `${absLead}UP`
  const upMatch = /^(\d+)UP$/.exec(text) // "2UP" → big "2" + tiny "UP"
  return (
    <span className={`sc-match-badge ${leaderClass}`}>
      {upMatch
        ? <span className="sc-match-inner"><span className="sc-match-num">{upMatch[1]}</span><span className="sc-match-up">UP</span></span>
        : <span className="sc-match-as">{text}</span>}
    </span>
  )
}

export default function ScoringTab({ trip, rounds, currentUserId, isCommissioner, readOnly = false, initialRoundId, initialPairingNum, onConnStatus, onOpenMenuPage }) {
  const [pairings, setPairings] = useState([])
  const [pairingPlayers, setPairingPlayers] = useState([]) // {id, pairing_id, trip_player_id, team_slot}
  const [playersById, setPlayersById] = useState({})
  const [teams, setTeams] = useState([])
  const [scores, setScores] = useState({}) // `${roundId}:${tpId}:${hole}` -> gross
  const [drinks, setDrinks] = useState({}) // `${roundId}:${tpId}:${hole}` -> count
  // Open the active round/pairing when provided (auto-detected), else the first round.
  const [activeRoundId, setActiveRoundId] = useState(initialRoundId ?? rounds[0]?.id ?? null)
  const [activePairingNum, setActivePairingNum] = useState(initialPairingNum ?? 1)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [openSlot, setOpenSlot] = useState(null) // commissioner header dropdown
  const [assignError, setAssignError] = useState(null)
  const [saveError, setSaveError] = useState(null) // transient toast when an optimistic score save fails
  const [notice, setNotice] = useState(null) // guidance modal message (e.g. tapping a score cell before teams are set)
  const [hideFire, setHideFire] = useState(false) // "Hide fire icons" toggle — instantly shows/removes fire rings + 🔥
  const [playerRoundsMap, setPlayerRoundsMap] = useState({}) // `${roundId}:${tpId}` -> player_rounds row (per-player tee)
  const [connStatus, setConnStatus] = useState('connecting') // connecting | connected | disconnected
  const [reconnectTick, setReconnectTick] = useState(0)
  const [reloadTick, setReloadTick] = useState(0) // bumped to refetch data (resume / pull-to-refresh)
  const hasLoadedRef = useRef(false) // true after the first successful load (skip the full-screen spinner on refetch)
  const reconnectTimer = useRef(null)
  const channelRef = useRef(null)
  const headerRef = useRef(null)

  const roundIds = useMemo(() => rounds.map(r => r.id), [rounds])

  async function loadPairings() {
    if (roundIds.length === 0) return
    const { data: pairs } = await supabase.from('pairings').select('id, round_id, pairing_number, team1_id, team2_id').in('round_id', roundIds)
    const pairList = pairs || []
    const pairIds = pairList.map(p => p.id)
    let pp = []
    if (pairIds.length) {
      const { data } = await supabase.from('pairing_players').select('id, pairing_id, trip_player_id, team_slot').in('pairing_id', pairIds)
      pp = data || []
    }
    setPairings(pairList)
    setPairingPlayers(pp)
  }

  // Per-player tee selections for every round (drives per-player course handicap).
  async function loadPlayerRounds() {
    if (roundIds.length === 0) return
    const { data } = await supabase.from('player_rounds')
      .select('trip_player_id, round_id, tee_name, slope, rating, par').in('round_id', roundIds)
    const m = {}
    ;(data || []).forEach(pr => { m[`${pr.round_id}:${pr.trip_player_id}`] = pr })
    setPlayerRoundsMap(m)
  }

  // (Re)load the trip roster + handicaps. Called on mount and whenever the
  // pairing-assignment dropdown opens, so it always reflects the latest roster
  // and handicap_index (e.g. after a handicap edit on a player card).
  async function loadPlayers() {
    const { data: tps } = await supabase.from('trip_players')
      .select('id, user_id, first_name, last_name, guest_name, handicap_index, team_id').eq('trip_id', trip.id)
    const list = tps || []
    const userIds = list.map(t => t.user_id).filter(Boolean)
    const profMap = {}
    if (userIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, display_name').in('id', userIds)
      if (profs) profs.forEach(p => { profMap[p.id] = p.display_name })
    }
    const pById = {}
    list.forEach(tp => {
      const name = [tp.first_name, tp.last_name].filter(Boolean).join(' ') || tp.guest_name || profMap[tp.user_id] || 'Player'
      pById[tp.id] = { ...tp, name }
    })
    setPlayersById(pById)
    return list
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      // Only show the full-screen spinner on the very first load — a resume /
      // pull-to-refresh refetch updates silently over the existing scorecard.
      if (!hasLoadedRef.current) setLoading(true)
      if (roundIds.length === 0) { setLoading(false); return }
      const [teamRes, scoreRes, drinkRes] = await Promise.all([
        // Order by team_index for a stable team list (matchup selector, colours).
        // Pairing sides come from the pairing's team1_id/team2_id, not array order.
        supabase.from('teams').select('id, name, team_index').eq('trip_id', trip.id).order('team_index'),
        supabase.from('scores').select('round_id, trip_player_id, hole_number, gross_score').in('round_id', roundIds),
        supabase.from('drinks').select('round_id, trip_player_id, hole_number, count').in('round_id', roundIds),
      ])
      const sMap = {}; (scoreRes.data || []).forEach(s => { if (s.gross_score != null) sMap[`${s.round_id}:${s.trip_player_id}:${s.hole_number}`] = s.gross_score })
      const dMap = {}; (drinkRes.data || []).forEach(d => { if (d.count > 0) dMap[`${d.round_id}:${d.trip_player_id}:${d.hole_number}`] = d.count })
      if (cancelled) return
      setTeams(teamRes.data || [])
      setScores(sMap)
      setDrinks(dMap)
      await loadPlayers()
      await loadPairings()
      await loadPlayerRounds()
      hasLoadedRef.current = true
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [trip.id, roundIds, reloadTick])

  // Realtime for the active round. INSERT/UPDATE come via postgres_changes;
  // DELETE syncs via Broadcast (postgres_changes DELETE is unreliable because
  // its server-side filter matches the absent new_record).
  useEffect(() => {
    if (!activeRoundId) return
    const filter = `round_id=eq.${activeRoundId}`

    // INSERT/UPDATE: write the new value (UPDATE to null clears the cell).
    function applyScore(p) {
      const key = `${p.new.round_id}:${p.new.trip_player_id}:${p.new.hole_number}`
      setScores(prev => {
        if (p.new.gross_score == null) {
          if (!(key in prev)) return prev
          const n = { ...prev }; delete n[key]; return n
        }
        if (prev[key] === p.new.gross_score) return prev // dedup — no flicker
        return { ...prev, [key]: p.new.gross_score }
      })
    }
    function applyDrink(p) {
      const key = `${p.new.round_id}:${p.new.trip_player_id}:${p.new.hole_number}`
      setDrinks(prev => {
        if (!(p.new.count > 0)) {
          if (!(key in prev)) return prev
          const n = { ...prev }; delete n[key]; return n
        }
        if (prev[key] === p.new.count) return prev
        return { ...prev, [key]: p.new.count }
      })
    }
    function onStatus(status) {
      if (status === 'SUBSCRIBED') setConnStatus('connected')
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setConnStatus('disconnected')
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
        reconnectTimer.current = setTimeout(() => setReconnectTick(t => t + 1), 3000)
      }
    }

    // This channel keeps a STABLE topic (all clients scoring the round must share
    // it for the `score_deleted` broadcast to reach each other), so it can't use a
    // unique name. Defensively drop any stale channel with this topic first, so a
    // re-subscribe never gets back an already-subscribed channel (which would make
    // the chained .on() calls throw "cannot add ... after subscribe()").
    const scoringTopic = `scoring:${activeRoundId}`
    supabase.getChannels().forEach(c => { if (c.topic === `realtime:${scoringTopic}`) supabase.removeChannel(c) })
    const ch = supabase.channel(scoringTopic)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'scores', filter }, applyScore)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'scores', filter }, applyScore)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'drinks', filter }, applyDrink)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'drinks', filter }, applyDrink)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pairing_players' }, () => { loadPairings() })
      // A commissioner changing a player's tee recalculates net scores live.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_rounds', filter }, () => { loadPlayerRounds() })
      // A handicap-index (HI) edit reloads the roster so net scores + course
      // handicaps recalculate live (HI is never stored as a derived value).
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_players', filter: `trip_id=eq.${trip.id}` }, payload => {
        console.log('[ScoringTab] trip_players realtime update', payload.new?.id, '→ HI', payload.new?.handicap_index)
        loadPlayers()
      })
      .on('broadcast', { event: 'score_deleted' }, ({ payload }) => {
        const key = `${payload.round_id}:${payload.trip_player_id}:${payload.hole_number}`
        setScores(prev => { const n = { ...prev }; delete n[key]; return n })
        setDrinks(prev => { const n = { ...prev }; delete n[key]; return n })
      })
      // Score/drink entries also sync via Broadcast (see commitScore): the
      // postgres_changes INSERT/UPDATE handlers above weren't reliably reaching
      // other viewers, so the writer emits an explicit broadcast to everyone on
      // this round's shared topic. applyScore/applyDrink dedup, so if the
      // postgres_changes path does fire too there's no double-apply/flicker.
      .on('broadcast', { event: 'score_changed' }, ({ payload }) => {
        applyScore({ new: payload })
        applyDrink({ new: payload })
      })
      .subscribe(onStatus)
    channelRef.current = ch

    return () => {
      channelRef.current = null
      supabase.removeChannel(ch)
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    }
  }, [activeRoundId, reconnectTick]) // eslint-disable-line react-hooks/exhaustive-deps

  // ESC closes modal/dropdown; outside-click closes dropdown.
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') { setModal(null); setOpenSlot(null) } }
    function onClick(e) { if (headerRef.current && !headerRef.current.contains(e.target)) setOpenSlot(null) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick) }
  }, [])

  // Pairing reset on round change is handled in the pill onClick, so the
  // auto-selected pairing isn't clobbered on mount.
  useEffect(() => { setOpenSlot(null) }, [activeRoundId])

  // Resume from background: the realtime socket can stall silently while the OS
  // suspends the PWA (no error fires), so on return refetch fresh data AND force
  // the channel to re-establish (reconnectTick). Covers "switched apps and back".
  useResumeRefetch(() => { setReloadTick(t => t + 1); setReconnectTick(t => t + 1) })

  // Manual pull-to-refresh fallback (see PullToRefresh wrapper below). Bumps the
  // same ticks; the returned promise keeps the spinner up while the refetch runs.
  const handlePullRefresh = () => {
    setReloadTick(t => t + 1)
    setReconnectTick(t => t + 1)
    return new Promise(resolve => setTimeout(resolve, 700))
  }

  // Report realtime status up so the page header can show the live dot.
  useEffect(() => { onConnStatus?.(connStatus) }, [connStatus, onConnStatus])

  // Auto-dismiss the optimistic-save error toast after a few seconds.
  useEffect(() => {
    if (!saveError) return
    const id = setTimeout(() => setSaveError(null), 4000)
    return () => clearTimeout(id)
  }, [saveError])

  if (loading) return <div className="empty-state">Loading scorecard…</div>
  // 'none' rounds are placeholders — never shown in the scoring round picker.
  // Exclude 'none' placeholders and rounds the commissioner marked "no scoring"
  // (those show only in Tee Times / Schedule & Courses).
  const visibleRounds = rounds.filter(r => r.round_type !== 'none' && !r.no_scoring)
  if (visibleRounds.length === 0) return <div className="empty-state"><span className="empty-state-icon">📊</span>No rounds to score yet.</div>

  const round = visibleRounds.find(r => r.id === activeRoundId) || visibleRounds[0]
  const holes = Array.isArray(round.holes) ? round.holes : null
  // Render from the round's actual hole count (e.g. 12-hole "The Dozen"), not a
  // hardcoded 18. The Out/In front/back split only applies to a true 18.
  const holeCount = holes?.length || round.number_of_holes || 18
  const isEighteen = holeCount === 18

  // Pairing tabs: a pairing is a 2v2 foursome, so a trip needs ceil(players/4)
  // of them. Commissioners see every slot up to that count (to set each up);
  // others see only the pairings that exist.
  const rosterCount = Object.values(playersById).length
  const numPairings = Math.max(1, Math.ceil(rosterCount / 4))
  const existingNums = [...new Set(pairings.filter(p => p.round_id === round.id).map(p => p.pairing_number))].sort((a, b) => a - b)
  const availableNums = isCommissioner
    ? Array.from({ length: numPairings }, (_, i) => i + 1)
    : (existingNums.length ? existingNums : [1])
  const pairNum = availableNums.includes(activePairingNum) ? activePairingNum : availableNums[0]

  const activePairing = pairings.find(p => p.round_id === round.id && p.pairing_number === pairNum)

  // Real teams on each side of THIS pairing (team1_id = slots 1&2, team2_id =
  // slots 3&4). With 3-4 teams any team can face any other, so the sides come
  // from the pairing row, not a fixed teams[0]/teams[1].
  const teamById = {}; teams.forEach(t => { teamById[t.id] = t })
  const pairTeam1 = activePairing?.team1_id ? teamById[activePairing.team1_id] : null
  const pairTeam2 = activePairing?.team2_id ? teamById[activePairing.team2_id] : null
  // slot -> trip_player_id for the active pairing
  const slotMap = {}
  if (activePairing) pairingPlayers.filter(pp => pp.pairing_id === activePairing.id).forEach(pp => { slotMap[pp.team_slot] = pp.trip_player_id })

  // every trip_player assigned to any slot in any pairing of this round
  const roundPairingIds = pairings.filter(p => p.round_id === round.id).map(p => p.id)
  const assignedInRound = new Set(pairingPlayers.filter(pp => roundPairingIds.includes(pp.pairing_id)).map(pp => pp.trip_player_id))
  // Players who can't be placed at all until they're on a team.
  const noTeamPlayers = Object.values(playersById).filter(p => !p.team_id)

  const slotPlayers = [1, 2, 3, 4].map(s => slotMap[s] ? playersById[slotMap[s]] : null)
  // Better-ball match needs at least one player on each side (slots 1&2 = Team 1,
  // 3&4 = Team 2). Works for any split: 1v1, 1v2, 2v1, 2v2.
  const t1MatchTps = [slotMap[1], slotMap[2]].filter(Boolean)
  const t2MatchTps = [slotMap[3], slotMap[4]].filter(Boolean)
  const matchActive = t1MatchTps.length > 0 && t2MatchTps.length > 0

  // How many player columns to show per team. Display only; scoring/handicap math
  // below still uses the full slot set [1,2,3,4].
  //   • Teams assigned → the team's roster size (1 or 2), so a single-player team
  //     doesn't render a ghost second slot.
  //   • Teams missing/incomplete → fall back to the full trip roster split evenly
  //     across the two sides (capped at 2 slots each), so a placeholder column
  //     shows per player even before anyone is assigned (4 players → 2 per side).
  const teamSize = teamId => Object.values(playersById).filter(p => teamId && p.team_id === teamId).length
  // Columns per side: the chosen team's roster size, capped at 2 for a 2v2
  // foursome; 2 placeholder columns before a team is picked.
  const sideCount = team => team ? Math.min(2, Math.max(1, teamSize(team.id))) : 2
  const t1Slots = sideCount(pairTeam1) >= 2 ? [1, 2] : [1]
  const t2Slots = sideCount(pairTeam2) >= 2 ? [3, 4] : [3]
  // Standard Match Play swaps the Pts column for a running-match-status column.
  // Both formats render a circular badge per hole, so the middle column is sized
  // to hold it (a touch wider for Standard's status text).
  const isStandard = trip?.format === 'standard_match_play'
  const midColW = isStandard ? '38px' : '36px'
  const scGridCols = `30px 24px 24px ${t1Slots.map(() => '1fr').join(' ')} ${midColW} ${t2Slots.map(() => '1fr').join(' ')}`
  // Whether the visible slots are all filled (for the "assign players" hint only).
  const visibleFilled = [...t1Slots, ...t2Slots].every(s => slotMap[s])

  // Shots given (WHS better ball) for the players in this pairing, each from their
  // individual tee (player_rounds → round default). Each player's PLAYING handicap
  // is round(courseHCP × allowance/100); shots given = that minus the pairing's
  // LOWEST playing handicap, so the lowest player plays off scratch (0). The stroke
  // dots AND the net scores both use this, so dots and results always agree.
  const allowance = trip.handicap_allowance ?? 100
  const chEntries = [1, 2, 3, 4].map(s => slotMap[s]).filter(Boolean).map(id => {
    const tee = resolvePlayerTee(round, playerRoundsMap[`${round.id}:${id}`])
    return { id, ch: rawCourseHandicapForTee(playersById[id]?.handicap_index, tee.slope, tee.rating, tee.par) }
  })
  const shotsByTp = shotsGivenFromCourseHandicaps(chEntries, allowance)
  const sgOf = tpId => shotsByTp.get(tpId) ?? 0

  const getScore = (tpId, hole) => scores[`${round.id}:${tpId}:${hole}`] ?? null
  const getDrinks = (tpId, hole) => drinks[`${round.id}:${tpId}:${hole}`] ?? 0
  // Net = gross - shots given on the hole (by SI), via the shared netScore helper —
  // identical math to liveMatchTally and standardMatchTally.
  const netOf = (tpId, hole) => netScore(getScore(tpId, hole), sgOf(tpId), holes?.[hole - 1]?.handicap)

  // "On fire" streak: walk holes 1→18; a run of 3+ consecutive NET par-or-better
  // holes lights the 3rd hole onward (never retroactively holes 1–2). A net
  // bogey-or-worse breaks the streak immediately; an unscored hole pauses it
  // (doesn't break). Net uses the same shots given (sgOf) as the on-screen
  // dots/nets. A player can relight multiple times in a round. Returns
  // Set(holeNumber) of holes to show the fire visual. Recomputed each render, so
  // entering/editing/deleting a score updates it live.
  const computeFireHoles = tpId => {
    const fire = new Set()
    let streak = 0
    for (let hole = 1; hole <= holeCount; hole++) {
      const gross = getScore(tpId, hole)
      if (gross == null) continue // unscored → pause, not a break
      const par = holes?.[hole - 1]?.par
      if (par == null) continue
      if (netOf(tpId, hole) <= par) {
        streak++
        if (streak >= 3) fire.add(hole)
      } else {
        streak = 0
      }
    }
    return fire
  }
  // Precompute once per render for each filled slot (avoids re-walking per cell).
  const fireByTp = new Map()
  for (const s of [...t1Slots, ...t2Slots]) {
    const id = slotMap[s]
    if (id && !fireByTp.has(id)) fireByTp.set(id, computeFireHoles(id))
  }

  // Standard Match Play running tally for the active pairing. Feeds the same
  // shots given (sgOf) and gross scores that drive the on-screen nets/dots, so
  // the match status is consistent with the displayed dots and net scores.
  const buildGrossByHole = tpId => {
    const o = {}
    for (let h = 1; h <= holeCount; h++) { const g = getScore(tpId, h); if (g != null) o[h] = g }
    return o
  }
  const stdTally = (isStandard && matchActive)
    ? standardMatchTally(
        holes || [],
        [
          ...t1MatchTps.map(id => ({ id, team: 1, playingHandicap: sgOf(id), grossByHole: buildGrossByHole(id) })),
          ...t2MatchTps.map(id => ({ id, team: 2, playingHandicap: sgOf(id), grossByHole: buildGrossByHole(id) })),
        ],
        { team1Name: getTeamDisplayName(pairTeam1), team2Name: getTeamDisplayName(pairTeam2) },
      )
    : null
  // Once a Standard Match Play match is decided, holes after the closeout are
  // locked (unenterable). Already-scored holes stay editable for corrections.
  const matchClosed = isStandard && !!stdTally?.closed
  const closedAtHole = stdTally?.closedAtHole ?? null

  function holeResult(hole) {
    // Best (lowest) net per side wins the hole; equal nets halve. Each side's
    // best ball is taken over only its present players, so 2v1 works.
    if (!matchActive) return null
    const t1 = t1MatchTps.map(tp => netOf(tp, hole))
    const t2 = t2MatchTps.map(tp => netOf(tp, hole))
    if (t1.some(n => n == null) || t2.some(n => n == null)) return null
    const b1 = Math.min(...t1), b2 = Math.min(...t2)
    return b1 < b2 ? 'T1' : b2 < b1 ? 'T2' : 'halve'
  }

  // Stroke dots once the visible slots are filled (a 1-player-per-team pairing
  // fills only slots 1 & 3). A player shows a dot on a hole when their SHOTS GIVEN
  // (playing handicap relative to the pairing's lowest) covers that hole's SI — so
  // the lowest player in the pairing gets no dots (WHS better ball).
  function strokesShown(hole) {
    if (!visibleFilled) return new Set()
    const si = holes?.[hole - 1]?.handicap
    const filledTps = [...t1Slots, ...t2Slots].map(s => slotMap[s]).filter(Boolean)
    const strokers = filledTps.filter(tp => strokesOnHole(sgOf(tp), si) >= 1)
    return new Set(strokers)
  }

  // Read-only past trips: nobody can enter scores or assign players.
  const canAssign = isCommissioner && !readOnly
  const isInPairing = !readOnly && (isCommissioner || [1, 2, 3, 4].some(s => slotMap[s] && playersById[slotMap[s]]?.user_id === currentUserId))

  // ── commissioner: assign (or clear) a player in a slot ──
  // The pairing's two teams are INFERRED from the players placed, not chosen from
  // a dropdown: placing the first player on a side sets that side's team_id from
  // the player's team; clearing the last player on a side nulls it back out.
  async function assignSlot(slot, tripPlayerId) {
    setOpenSlot(null)
    setAssignError(null)
    const side = SLOT_TEAM[slot]                    // 0 = team1 side, 1 = team2 side
    const teamCol = side === 0 ? 'team1_id' : 'team2_id'
    const sideSlots = side === 0 ? [1, 2] : [3, 4]
    const siblingSlot = sideSlots.find(s => s !== slot)
    try {
      // Find or create the pairing row (no onConflict — explicit & robust).
      let pairing = pairings.find(p => p.round_id === round.id && p.pairing_number === pairNum)
      if (!pairing) {
        const { data, error } = await supabase.from('pairings')
          .insert({ round_id: round.id, pairing_number: pairNum }).select().single()
        if (error) throw error
        pairing = data
      }
      // Clear whatever is in this slot first.
      await supabase.from('pairing_players').delete().eq('pairing_id', pairing.id).eq('team_slot', slot)
      if (tripPlayerId != null) {
        // Remove this player from any other slot in this pairing, then place them.
        await supabase.from('pairing_players').delete().eq('pairing_id', pairing.id).eq('trip_player_id', tripPlayerId)
        const { error } = await supabase.from('pairing_players')
          .insert({ pairing_id: pairing.id, trip_player_id: tripPlayerId, team_slot: slot })
        if (error) throw error
        // Infer this side's team from the placed player (first pick sets it).
        const teamId = playersById[tripPlayerId]?.team_id ?? null
        const currentTeam = side === 0 ? pairing.team1_id : pairing.team2_id
        if (teamId && teamId !== currentTeam) {
          const { error: tErr } = await supabase.from('pairings').update({ [teamCol]: teamId }).eq('id', pairing.id)
          if (tErr) throw tErr
        }
      } else {
        // Cleared this slot: if the side now has no players (sibling empty too),
        // drop the inferred team so the side reopens to all teams.
        const siblingFilled = !!slotMap[siblingSlot]
        if (!siblingFilled) {
          await supabase.from('pairings').update({ [teamCol]: null }).eq('id', pairing.id)
        }
      }
      await loadPairings()
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[ScoringTab] assignSlot failed:', e)
      setAssignError(e?.message || 'Could not assign player')
    }
  }

  // Open the assignment dropdown for a slot. Refetches the roster first so the
  // options reflect the latest teams/handicaps. Players without a team simply
  // don't appear (availableForSlot filters them out).
  async function openAssign(slot) {
    // Same guard as the "+" score cells: can't place a player into a pairing
    // until everyone has a team. Show the guidance modal instead of the picker.
    if (!readOnly && noTeamPlayers.length > 0) {
      setNotice('Please assign teams before setting the pairings.')
      return
    }
    if (openSlot === slot) { setOpenSlot(null); return }
    await loadPlayers()
    setOpenSlot(slot)
  }

  function availableForSlot(slot) {
    const side = SLOT_TEAM[slot] // 0 = team1 side, 1 = team2 side
    const thisSideTeam = side === 0 ? activePairing?.team1_id : activePairing?.team2_id
    const otherSideTeam = side === 0 ? activePairing?.team2_id : activePairing?.team1_id
    const current = slotMap[slot]
    return Object.values(playersById).filter(p => {
      if (!p.team_id) return false // no team → can't be placed (no team to score for)
      // Already placed this round (incl. the same side's other slot) → unavailable,
      // unless it's the player currently in THIS slot.
      if (p.id !== current && assignedInRound.has(p.id)) return false
      // This side's team is known (a player was already placed here) → that team only.
      if (thisSideTeam) return p.team_id === thisSideTeam
      // First pick on this side → all teams, except the one already on the other
      // side (a team can't play itself).
      return !otherSideTeam || p.team_id !== otherSideTeam
    })
  }

  function HeaderCell({ slot }) {
    const tp = slotMap[slot] ? playersById[slotMap[slot]] : null
    // Filled → the slot's REAL team colour (the team on this side of the pairing,
    // matching the Players tab); empty → neutral gray.
    const sideTeam = SLOT_TEAM[slot] === 0 ? pairTeam1 : pairTeam2
    const fillStyle = tp
      ? { background: teamColor(colorIndexOf(sideTeam)).solid, color: '#fff' }
      : EMPTY_TH
    if (!canAssign) return <div className="sc-th-name" style={fillStyle}>{tp ? firstName(tp.name) : 'TBD'}</div>
    // '+' whenever a player can be placed here — the first pick on a side lists
    // all teams, later picks filter (see availableForSlot).
    const canOpen = !!tp || availableForSlot(slot).length > 0
    const label = tp ? firstName(tp.name) : (canOpen ? '+' : 'TBD')
    if (!canOpen) {
      // "TBD" — no players available for this slot. When that's because nobody has
      // a team yet, make it a live button that surfaces the guidance modal (via
      // the guarded openAssign); otherwise it's an inert "no available players".
      const blocked = !readOnly && noTeamPlayers.length > 0
      if (blocked) {
        return <button className="sc-th-name sc-th-btn" style={fillStyle} onClick={() => openAssign(slot)}>{label}</button>
      }
      return <div className="sc-th-name" style={fillStyle} title="No available players">{label}</div>
    }
    return (
      <div style={{ position: 'relative' }}>
        <button className="sc-th-name sc-th-btn" style={fillStyle} onClick={() => openAssign(slot)}>{label}</button>
        {openSlot === slot && (
          <div className="sc-th-dropdown">
            <button className="sc-th-opt" onClick={() => assignSlot(slot, null)} style={{ color: 'var(--muted)', fontWeight: 700 }}>Clear</button>
            {availableForSlot(slot).map(p => (
              <button key={p.id} className="sc-th-opt" onClick={() => assignSlot(slot, p.id)}>
                <span className="sc-th-opt-avatar">{initialsOf(p)}</span>
                <span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0D1B2A', display: 'block' }}>{p.name}</span>
                  <span style={{ fontSize: 11, color: '#7A8FA6' }}>HCP: {p.handicap_index ?? 'TBD'}</span>
                </span>
              </button>
            ))}
            {availableForSlot(slot).length === 0 && <div style={{ padding: '10px 14px', fontSize: 12, color: '#7A8FA6', fontStyle: 'italic' }}>No available players</div>}
          </div>
        )}
      </div>
    )
  }

  function openModal(slot, hole) {
    if (readOnly) return // past trip — scorecard is view-only
    const tpId = slotMap[slot]; if (!tpId) return
    setModal({ tpId, hole, teamSide: slot <= 2 ? 'T1' : 'T2' })
  }

  // Optimistic score save: update the scorecard and close the modal instantly,
  // then write to Supabase in the background. On failure, roll the score (and
  // its drink cell) back to the previous value and surface a toast. After a
  // successful write we emit a `score_changed` broadcast so OTHER viewers of this
  // round update live — the postgres_changes INSERT/UPDATE path wasn't reliably
  // reaching them (the same reason DELETE already uses a broadcast).
  function commitScore(hole, tpId, score, drinkCount) {
    const key = `${round.id}:${tpId}:${hole}`
    const hadScore = key in scores
    const prevScore = scores[key]
    const hadDrinks = key in drinks
    const prevDrinks = drinks[key]

    // 1 & 2 — optimistic UI update + immediate modal close.
    setScores(prev => ({ ...prev, [key]: score }))
    setDrinks(prev => {
      const n = { ...prev }
      if (drinkCount > 0) n[key] = drinkCount; else delete n[key]
      return n
    })
    setModal(null)

    // 3 — background write; roll both cells back on failure.
    ;(async () => {
      const { error } = await supabase.from('scores').upsert(
        { round_id: round.id, trip_player_id: tpId, hole_number: hole, gross_score: score },
        { onConflict: 'round_id,trip_player_id,hole_number' })
      if (error) {
        setScores(prev => {
          const n = { ...prev }
          if (hadScore) n[key] = prevScore; else delete n[key]
          return n
        })
        setDrinks(prev => {
          const n = { ...prev }
          if (hadDrinks) n[key] = prevDrinks; else delete n[key]
          return n
        })
        // eslint-disable-next-line no-console
        console.error('[ScoringTab] score save failed:', error)
        setSaveError('Couldn’t save score — check your connection and try again.')
        return
      }
      // The drink count rides along with the score (one user action). A
      // drink-only write failure is non-critical and left silent, as before.
      if (drinkCount > 0) {
        await supabase.from('drinks').upsert(
          { round_id: round.id, trip_player_id: tpId, hole_number: hole, count: drinkCount },
          { onConflict: 'round_id,trip_player_id,hole_number' })
      } else {
        await supabase.from('drinks').delete().eq('round_id', round.id).eq('trip_player_id', tpId).eq('hole_number', hole)
      }
      // Push the change to every other client on this round's shared topic. This
      // is what actually makes other viewers update live; broadcast defaults to
      // self:false so our own already-optimistic view isn't re-applied.
      channelRef.current?.send({
        type: 'broadcast',
        event: 'score_changed',
        payload: { round_id: round.id, trip_player_id: tpId, hole_number: hole, gross_score: score, count: drinkCount },
      })
    })()
  }

  function ScoreCell({ slot, hole, shownSet }) {
    const tpId = slotMap[slot]
    if (!tpId) {
      // Empty slot. If players still lack a team, tapping "+" can't lead anywhere
      // (no pairings yet) → show a guidance toast instead of a dead button.
      const blocked = !readOnly && noTeamPlayers.length > 0
      return (
        <span className="sc-score-wrap">
          <button
            className="sc-score empty"
            style={{ opacity: 0.5, cursor: blocked ? 'pointer' : 'default' }}
            tabIndex={blocked ? 0 : -1}
            onClick={blocked ? () => setNotice('Please assign teams before setting the pairings.') : undefined}
          >
            {readOnly ? '' : '+'}
          </button>
        </span>
      )
    }
    const gross = getScore(tpId, hole)
    // Lock empty cells on holes played after the match was decided; already-scored
    // cells stay editable so a commissioner can still correct them.
    if (matchClosed && closedAtHole != null && hole > closedAtHole && gross == null) {
      return <span className="sc-score-wrap"><button className="sc-score locked" disabled tabIndex={-1} aria-label="Hole locked — match decided">·</button></span>
    }
    const par = holes?.[hole - 1]?.par
    const onFire = !hideFire && fireByTp.get(tpId)?.has(hole)
    const cls = `${scoreClass(gross, par)}${onFire ? ' fire-score' : ''}`
    // Dot count = shots given (playing HCP relative to the pairing's lowest).
    const st = strokesOnHole(sgOf(tpId), holes?.[hole - 1]?.handicap)
    const showDot = shownSet.has(tpId) && st >= 1
    const dc = getDrinks(tpId, hole)
    // Read-only past trips: cells display scores but are not clickable (no entry).
    if (readOnly) {
      return (
        <span className="sc-score-wrap">
          <button className={`sc-score ${cls}`} style={{ cursor: 'default' }} tabIndex={-1}>
            {gross == null ? '' : gross}
            {showDot && (
              <span className="stroke-dots">
                {Array.from({ length: st }).map((_, i) => <span key={i} className="stroke-dot" />)}
              </span>
            )}
            {dc > 0 && <span className="drink-badge">{dc}</span>}
          </button>
        </span>
      )
    }
    return (
      <span className="sc-score-wrap">
        <button className={`sc-score ${cls}`} onClick={() => openModal(slot, hole)}>
          {gross == null ? '+' : gross}
          {showDot && (
            <span className="stroke-dots">
              {Array.from({ length: st }).map((_, i) => <span key={i} className="stroke-dot" />)}
            </span>
          )}
          {dc > 0 && <span className="drink-badge">{dc}</span>}
        </button>
      </span>
    )
  }

  function subtotal(start, end) {
    const parSum = holes ? holes.slice(start - 1, end).reduce((a, h) => a + (h?.par || 0), 0) : null
    const playerTotal = tpId => { let s = 0; for (let h = start; h <= end; h++) { const g = getScore(tpId, h); if (g == null) return null; s += g } return s }
    let t1 = 0, t2 = 0
    for (let h = start; h <= end; h++) { const r = holeResult(h); if (r === 'T1') t1++; else if (r === 'T2') t2++ }
    return { parSum, playerTotal, pts: `${t1}–${t2}` }
  }
  function SubRow({ label, start, end }) {
    const st = subtotal(start, end)
    const cell = tpId => !tpId ? '—' : (st.playerTotal(tpId) == null ? '—' : st.playerTotal(tpId))
    return (
      <div className="sc-row sc-sub-row" style={{ gridTemplateColumns: scGridCols }}>
        <div className="sc-sub-label">{label}</div>
        <div className="sc-sub-par">{st.parSum ?? '—'}</div><div />
        {t1Slots.map(s => <div key={s} className="sc-sub-score t1">{cell(slotMap[s])}</div>)}
        <div className="sc-sub-pts">
          {isStandard
            ? (stdTally?.results?.[end - 1]?.statusShort ?? '—')
            : (matchActive ? st.pts : '—')}
        </div>
        {t2Slots.map(s => <div key={s} className="sc-sub-score t2">{cell(slotMap[s])}</div>)}
      </div>
    )
  }
  // Total drinks per player across all holes of the active round ("—" for 0).
  function DrinkRow() {
    const total = tpId => {
      if (!tpId) return '—'
      let s = 0
      for (let h = 1; h <= holeCount; h++) s += getDrinks(tpId, h)
      return s > 0 ? s : '—'
    }
    return (
      <div className="sc-row sc-sub-row" style={{ gridTemplateColumns: scGridCols }}>
        <div className="sc-sub-label">Drinks</div>
        <div className="sc-sub-par" /><div />
        {t1Slots.map(s => <div key={s} className="sc-sub-score t1">{total(slotMap[s])}</div>)}
        <div className="sc-sub-pts" />
        {t2Slots.map(s => <div key={s} className="sc-sub-score t2">{total(slotMap[s])}</div>)}
      </div>
    )
  }

  return (
    <PullToRefresh onRefresh={handlePullRefresh} disabled={!!modal || !!notice || openSlot != null}>
    <div>
      {/* Round pills */}
      <div className="pill-row">
        {visibleRounds.map(r => (
          <button key={r.id} className={`pill-btn ${round.id === r.id ? 'active' : ''}`} onClick={() => { setActiveRoundId(r.id); setActivePairingNum(1); setOpenSlot(null) }}>
            <span className="round-pill-name">{roundPillName(r)}</span>
            {r.round_type === 'practice' && <span className="round-practice-badge">P</span>}
          </button>
        ))}
      </div>

      {!holes && (
        <div className="info-banner" style={{ marginBottom: 10 }}>
          <span>No course data — commissioner needs to set up courses in the Menu → Courses tab.</span>
        </div>
      )}

      {/* Pairing tabs — a pairing per 2v2 foursome. Commissioners see every slot
          up to ceil(players/4) so they can set each one up. */}
      {availableNums.length > 1 && (
        <div className="pair-tabs" style={{ gridTemplateColumns: `repeat(${availableNums.length}, 1fr)` }}>
          {availableNums.map(n => (
            <button key={n} className={`pair-tab ${pairNum === n ? 'active' : ''}`} onClick={() => { setActivePairingNum(n); setOpenSlot(null) }}>Pairing {n}</button>
          ))}
        </div>
      )}

      {!visibleFilled && !isCommissioner && (
        <div style={{ textAlign: 'center', fontSize: 12, color: '#7A8FA6', fontStyle: 'italic', padding: '8px 0' }}>
          Pairings not set yet — ask your commissioner
        </div>
      )}
      {assignError && (
        <div style={{ textAlign: 'center', fontSize: 12, color: '#C0392B', padding: '0 0 8px' }}>Couldn’t assign: {assignError}</div>
      )}

      <div className="sc-card">
        <div className="sc-row sc-head" ref={headerRef} style={{ gridTemplateColumns: scGridCols }}>
          <div className="sc-h">Hole</div>
          <div className="sc-h">Par</div>
          <div className="sc-h">S.I.</div>
          {t1Slots.map(s => <HeaderCell key={s} slot={s} />)}
          <div className="sc-h">{isStandard ? 'Match' : 'Pts'}</div>
          {t2Slots.map(s => <HeaderCell key={s} slot={s} />)}
        </div>

        {Array.from({ length: holeCount }, (_, i) => i + 1).map(hole => {
          const shownSet = strokesShown(hole)
          return (
            <div key={hole}>
              <div className={`sc-row sc-hole-row ${isEighteen && hole === 10 ? 'nine-divider' : ''}`} style={{ gridTemplateColumns: scGridCols, paddingTop: 3, paddingBottom: 3 }}>
                <div className="sc-cell-hole">{hole}</div>
                <div className="sc-cell-par">{holes?.[hole - 1]?.par ?? '—'}</div>
                <div className="sc-cell-si">{holes?.[hole - 1]?.handicap ?? '—'}</div>
                {t1Slots.map(s => <ScoreCell key={s} slot={s} hole={hole} shownSet={shownSet} />)}
                {isStandard
                  ? <MatchCell entry={stdTally?.results?.[hole - 1]} />
                  : <PointsChip result={holeResult(hole)} />}
                {t2Slots.map(s => <ScoreCell key={s} slot={s} hole={hole} shownSet={shownSet} />)}
              </div>
              {isEighteen && hole === 9 && <SubRow label="Out" start={1} end={9} />}
              {isEighteen && hole === 18 && <SubRow label="In" start={10} end={18} />}
              {hole === holeCount && <SubRow label="Tot" start={1} end={holeCount} />}
              {hole === holeCount && <DrinkRow />}
            </div>
          )
        })}
      </div>

      {/* Hide fire icons — instantly removes/restores the fire rings + 🔥. The
          box turns blue with a check mark when enabled. */}
      <button
        type="button" role="checkbox" aria-checked={hideFire}
        onClick={() => setHideFire(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 4px 2px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: '#2C3E50' }}
      >
        <span style={{
          width: 18, height: 18, borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: hideFire ? '#1B3F6E' : '#fff', border: `1px solid ${hideFire ? '#1B3F6E' : '#C4CEDA'}`,
          color: '#fff', fontSize: 12, fontWeight: 700, lineHeight: 1, transition: 'background 0.12s, border-color 0.12s',
        }}>{hideFire ? '✓' : ''}</span>
        Hide fire icons
      </button>

      {modal && (
        <ScoreModal
          modal={modal} round={round} player={playersById[modal.tpId]}
          teamName={getTeamDisplayName(modal.teamSide === 'T1' ? pairTeam1 : pairTeam2)}
          par={holes?.[modal.hole - 1]?.par} si={holes?.[modal.hole - 1]?.handicap}
          courseHcp={sgOf(modal.tpId)} canSave={isInPairing}
          existingScore={getScore(modal.tpId, modal.hole)} existingDrinks={getDrinks(modal.tpId, modal.hole)}
          onClose={() => setModal(null)}
          onCommit={commitScore}
          onRemoved={(hole, tpId) => {
            setScores(prev => { const n = { ...prev }; delete n[`${round.id}:${tpId}:${hole}`]; return n })
            setDrinks(prev => { const n = { ...prev }; delete n[`${round.id}:${tpId}:${hole}`]; return n })
            channelRef.current?.send({
              type: 'broadcast',
              event: 'score_deleted',
              payload: { round_id: round.id, trip_player_id: tpId, hole_number: hole },
            })
            setModal(null)
          }}
        />
      )}

      {/* Transient toast shown if an optimistic score save fails to persist. */}
      {saveError && (
        <div role="alert" onClick={() => setSaveError(null)} style={{
          position: 'fixed', top: 'calc(env(safe-area-inset-top) + 12px)', left: '50%',
          transform: 'translateX(-50%)', zIndex: 300, maxWidth: '90%', textAlign: 'center',
          background: '#C0392B', color: '#fff', padding: '10px 16px', borderRadius: 8,
          fontSize: 13, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.25)', cursor: 'pointer',
        }}>
          {saveError}
        </div>
      )}

      {/* Guidance modal — centered dialog with a backdrop and an explicit OK
          (no auto-dismiss). Tap outside also dismisses. Matches the app's
          centered-modal convention (GettingStartedCard). */}
      {notice && (
        <div
          role="dialog" aria-modal="true"
          onClick={() => setNotice(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', border: '1px solid #DDE3EA', borderRadius: 14, padding: '24px 20px 18px', width: '100%', maxWidth: 340, textAlign: 'center', boxShadow: '0 10px 40px rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#0D1B2A', lineHeight: 1.4, marginBottom: 20 }}>{notice}</div>
            {onOpenMenuPage && (
              <button
                onClick={() => { setNotice(null); onOpenMenuPage('players') }}
                style={{ width: '100%', padding: 13, background: '#1B3F6E', border: 'none', borderRadius: 10, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Go to Players &amp; Teams
              </button>
            )}
            <button
              onClick={() => setNotice(null)}
              style={{ width: '100%', padding: 11, marginTop: 8, background: 'none', border: 'none', color: '#7A8FA6', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
    </PullToRefresh>
  )
}

// ── Score + drink entry modal ─────────────────────────────────────
function ScoreModal({ modal, round, player, teamName, par, si, courseHcp, canSave, existingScore, existingDrinks, onClose, onCommit, onRemoved }) {
  const { tpId, hole, teamSide } = modal
  const [score, setScore] = useState(existingScore ?? par ?? 4)
  const [drinkCount, setDrinkCount] = useState(existingDrinks ?? 0)
  const [busy, setBusy] = useState(false) // used by remove() only — save is optimistic/instant
  const [err, setErr] = useState(null)
  const netPar = par != null ? par - strokesOnHole(courseHcp, si) : null

  // Hand the values straight to the parent, which updates the scorecard and
  // closes this modal immediately, then persists to Supabase in the background.
  function save() {
    onCommit(hole, tpId, score, drinkCount)
  }
  async function remove() {
    setBusy(true); setErr(null)
    // .select() returns the deleted rows, so we can confirm the DB actually
    // removed something (RLS blocks silently with a 204 / 0 rows).
    const { data, error } = await supabase.from('scores').delete()
      .eq('round_id', round.id).eq('trip_player_id', tpId).eq('hole_number', hole)
      .select()
    if (error) {
      setBusy(false); setErr(error.message)
      // eslint-disable-next-line no-console
      console.error('Score delete failed:', error)
      return
    }
    if (!data || data.length === 0) {
      setBusy(false)
      setErr('Delete blocked — you may not have permission (check RLS).')
      // eslint-disable-next-line no-console
      console.warn('Score delete: 0 rows affected — check RLS')
      return
    }
    await supabase.from('drinks').delete().eq('round_id', round.id).eq('trip_player_id', tpId).eq('hole_number', hole)
    setBusy(false)
    onRemoved(hole, tpId) // confirmed deleted — update shared state
  }

  const m = {
    // Rendered via a portal to document.body (see return below) so the overlay
    // lands in the root stacking context — otherwise it stays trapped inside the
    // ScoringTab / PullToRefresh subtree and the fixed live-score banner (z-index
    // 200) and Feedback FAB (z-index 201), which are painted later as siblings of
    // the tab content, show through it despite the higher number. zIndex 400
    // matches the app's modal-overlay convention (MenuDrawer modals) and, in the
    // root context, reliably covers both the banner (200) and the Feedback FAB (201).
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 400, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' },
    sheet: { background: '#fff', borderRadius: '20px 20px 0 0', padding: '20px 20px 32px', width: '100%', maxWidth: 430, borderTop: '1px solid #DDE3EA' },
    round: { fontSize: 11, color: '#7A8FA6', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 3 },
    holeNum: { fontSize: 30, fontWeight: 900, color: '#0D1B2A', textAlign: 'center', lineHeight: 1 },
    parInfo: { fontSize: 13, color: '#1B3F6E', textAlign: 'center', marginBottom: 16 },
    playerRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    team: { fontSize: 10, padding: '2px 7px', borderRadius: 10, marginRight: 10, fontWeight: 700 },
    name: { fontSize: 14, fontWeight: 600, color: '#0D1B2A', flex: 1 },
    controls: { display: 'flex', alignItems: 'center' },
    scoreBtn: { width: 52, height: 52, borderRadius: 6, border: '1px solid #DDE3EA', background: '#E8EDF3', color: '#0D1B2A', fontSize: 28, fontWeight: 300, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation', fontFamily: 'inherit' },
    scoreDisp: { width: 60, textAlign: 'center', fontSize: 28, fontWeight: 900, color: '#0D1B2A' },
    divider: { height: 1, background: '#DDE3EA', margin: '12px 0', border: 'none' },
    label: { fontSize: 10, textTransform: 'uppercase', letterSpacing: '1px', color: '#7A8FA6', marginBottom: 8, fontWeight: 600 },
    drinkBtn: { width: 40, height: 40, borderRadius: 6, border: '1px solid #DDE3EA', background: '#E8EDF3', color: '#7AAAD4', fontSize: 22, fontWeight: 300, cursor: 'pointer', touchAction: 'manipulation', fontFamily: 'inherit' },
    drinkDisp: { width: 48, textAlign: 'center', fontSize: 22, fontWeight: 900, color: '#7AAAD4' },
    save: { width: '100%', padding: 15, background: '#1B3F6E', border: 'none', borderRadius: 10, color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer', marginTop: 4, fontFamily: 'inherit' },
    disabled: { width: '100%', padding: 15, background: '#E8EDF3', border: 'none', borderRadius: 10, color: '#7A8FA6', fontSize: 15, fontWeight: 700, textAlign: 'center', marginTop: 4 },
    remove: { width: '100%', padding: 10, background: 'none', border: '1px solid rgba(192,57,43,0.4)', borderRadius: 10, color: '#f08080', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 8, fontFamily: 'inherit' },
    cancel: { width: '100%', padding: 10, background: 'none', border: 'none', color: '#7A8FA6', fontSize: 14, cursor: 'pointer', marginTop: 4, fontFamily: 'inherit' },
  }
  const teamStyle = teamPillStyle(teamSide === 'T1' ? 1 : 2)

  return createPortal(
    <div style={m.overlay} onClick={onClose}>
      <div style={m.sheet} onClick={e => e.stopPropagation()}>
        <div style={m.round}>{round.club_name || round.course_name}</div>
        <div style={m.holeNum}>Hole {hole}</div>
        <div style={m.parInfo}>Par {par ?? '—'} · Index {si ?? '—'}{netPar != null ? ` · Net Par ${netPar}` : ''}</div>

        <div style={m.playerRow}>
          <span style={{ ...m.team, ...teamStyle }}>{teamName || (teamSide === 'T1' ? 'Team 1' : 'Team 2')}</span>
          <span style={m.name}>{firstName(player?.name)}</span>
          <div style={m.controls}>
            <button style={m.scoreBtn} onClick={() => setScore(s => Math.max(1, s - 1))}>−</button>
            <div style={m.scoreDisp}>{score}</div>
            <button style={m.scoreBtn} onClick={() => setScore(s => Math.min(15, s + 1))}>+</button>
          </div>
        </div>

        <hr style={m.divider} />
        <div style={m.label}>🍺 Drinks this hole</div>
        <div style={{ ...m.playerRow, marginBottom: 0 }}>
          <span style={{ color: '#7A8FA6', fontSize: 13 }}>Add drinks consumed</span>
          <div style={m.controls}>
            <button style={m.drinkBtn} onClick={() => setDrinkCount(d => Math.max(0, d - 1))}>−</button>
            <div style={m.drinkDisp}>{drinkCount}</div>
            <button style={m.drinkBtn} onClick={() => setDrinkCount(d => d + 1)}>+</button>
          </div>
        </div>

        {err && <div style={{ color: '#C0392B', fontSize: 12, textAlign: 'center', marginTop: 8 }}>Couldn’t save: {err}</div>}
        {canSave
          ? <button style={m.save} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          : <div style={m.disabled}>You're not in this pairing</div>}
        {canSave && existingScore != null && <button style={m.remove} onClick={remove} disabled={busy}>Remove Score</button>}
        <button style={m.cancel} onClick={onClose}>Cancel</button>
      </div>
    </div>,
    document.body,
  )
}
