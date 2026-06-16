import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { strokesOnHole, courseHandicapForTee, resolvePlayerTee, playingFromCourseHandicaps } from '../lib/scoring'
import { teamPillStyle, getTeamDisplayName } from '../lib/teamColors'

// Live interactive scorecard — better-ball match play with drink tracking.
// Scores/drinks keyed by trip_player_id. Pairings use team_slot 1..4
// (1=T1P1, 2=T1P2, 3=T2P1, 4=T2P2). Strokes use low-ball playing handicaps
// (course handicap minus the pairing's lowest, times the trip's allowance %).

const SLOT_TEAM = { 1: 0, 2: 0, 3: 1, 4: 1 } // slot -> team index

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
    .replace(/\b(Golf Club|Golf Course|Country Club|CC|GC|Golf)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (stripped.length <= 12) return stripped
  return stripped.split(' ').filter(Boolean).slice(0, 2).join(' ')
}
function initialsOf(p) {
  return `${(p?.first_name || '')[0] || ''}${(p?.last_name || '')[0] || ''}`.toUpperCase()
    || (p?.name || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function PointsChip({ result }) {
  if (result === 'T1') return <span className="sc-pts-chip t1"><Chevron dir="left" /></span>
  if (result === 'T2') return <span className="sc-pts-chip t2"><Chevron dir="right" /></span>
  if (result === 'halve') return <span className="sc-pts-chip halve">◆</span>
  return <span className="sc-pts-chip null">·</span>
}
function Chevron({ dir }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      {dir === 'left' ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
    </svg>
  )
}

export default function ScoringTab({ trip, rounds, currentUserId, isCommissioner, initialRoundId, initialPairingNum, onConnStatus }) {
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
  const [teamWarning, setTeamWarning] = useState(false) // blocks assignment until every player has a team
  const [saveError, setSaveError] = useState(null) // transient toast when an optimistic score save fails
  const [playerRoundsMap, setPlayerRoundsMap] = useState({}) // `${roundId}:${tpId}` -> player_rounds row (per-player tee)
  const [connStatus, setConnStatus] = useState('connecting') // connecting | connected | disconnected
  const [reconnectTick, setReconnectTick] = useState(0)
  const reconnectTimer = useRef(null)
  const channelRef = useRef(null)
  const headerRef = useRef(null)

  const roundIds = useMemo(() => rounds.map(r => r.id), [rounds])

  async function loadPairings() {
    if (roundIds.length === 0) return
    const { data: pairs } = await supabase.from('pairings').select('id, round_id, pairing_number').in('round_id', roundIds)
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
      setLoading(true)
      if (roundIds.length === 0) { setLoading(false); return }
      const [teamRes, scoreRes, drinkRes] = await Promise.all([
        // Order by team_index so teams[0]/teams[1] map to the T1/T2 slots (SLOT_TEAM).
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
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [trip.id, roundIds])

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

    const ch = supabase.channel(`scoring:${activeRoundId}`)
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
  const visibleRounds = rounds.filter(r => r.round_type !== 'none')
  if (visibleRounds.length === 0) return <div className="empty-state"><span className="empty-state-icon">📊</span>No rounds to score yet.</div>

  const round = visibleRounds.find(r => r.id === activeRoundId) || visibleRounds[0]
  const holes = Array.isArray(round.holes) ? round.holes : null

  // Pairing tabs: commissioners always get 1 & 2; others see what exists.
  const existingNums = [...new Set(pairings.filter(p => p.round_id === round.id).map(p => p.pairing_number))].sort()
  const availableNums = isCommissioner ? [1, 2] : (existingNums.length ? existingNums : [1])
  const pairNum = availableNums.includes(activePairingNum) ? activePairingNum : availableNums[0]

  const activePairing = pairings.find(p => p.round_id === round.id && p.pairing_number === pairNum)
  // slot -> trip_player_id for the active pairing
  const slotMap = {}
  if (activePairing) pairingPlayers.filter(pp => pp.pairing_id === activePairing.id).forEach(pp => { slotMap[pp.team_slot] = pp.trip_player_id })

  // every trip_player assigned to any slot in any pairing of this round
  const roundPairingIds = pairings.filter(p => p.round_id === round.id).map(p => p.id)
  const assignedInRound = new Set(pairingPlayers.filter(pp => roundPairingIds.includes(pp.pairing_id)).map(pp => pp.trip_player_id))

  const slotPlayers = [1, 2, 3, 4].map(s => slotMap[s] ? playersById[slotMap[s]] : null)
  const allFilled = [1, 2, 3, 4].every(s => slotMap[s])

  // How many player columns to show per team — the team's roster size (1 or 2),
  // so a team with only one player doesn't render a ghost second slot. Display
  // only; scoring/handicap math below still uses the full slot set.
  const teamSize = teamId => Object.values(playersById).filter(p => teamId && p.team_id === teamId).length
  const t1Slots = teamSize(teams[0]?.id) >= 2 ? [1, 2] : [1]
  const t2Slots = teamSize(teams[1]?.id) >= 2 ? [3, 4] : [3]
  const scGridCols = `30px 24px 24px ${t1Slots.map(() => '1fr').join(' ')} 32px ${t2Slots.map(() => '1fr').join(' ')}`
  // Whether the visible slots are all filled (for the "assign players" hint only).
  const visibleFilled = [...t1Slots, ...t2Slots].every(s => slotMap[s])

  // Low-ball playing handicaps for the players in this pairing, each from their
  // individual tee (player_rounds → round default). Course HCP is WHS per tee.
  const allowance = trip.handicap_allowance ?? 100
  const chEntries = [1, 2, 3, 4].map(s => slotMap[s]).filter(Boolean).map(id => {
    const tee = resolvePlayerTee(round, playerRoundsMap[`${round.id}:${id}`])
    return { id, ch: courseHandicapForTee(playersById[id]?.handicap_index, tee.slope, tee.rating, tee.par) }
  })
  const playingByTp = playingFromCourseHandicaps(chEntries, allowance)
  const phOf = tpId => playingByTp.get(tpId) ?? 0
  // Stroke dots reflect each player's COURSE handicap (WHS), computed live from
  // the current HI — not the low-ball playing handicap used for net scoring.
  const courseHcpByTp = new Map(chEntries.map(e => [e.id, e.ch]))
  const courseHcpOf = tpId => courseHcpByTp.get(tpId) ?? 0

  const getScore = (tpId, hole) => scores[`${round.id}:${tpId}:${hole}`] ?? null
  const getDrinks = (tpId, hole) => drinks[`${round.id}:${tpId}:${hole}`] ?? 0
  const netOf = (tpId, hole) => {
    const g = getScore(tpId, hole); if (g == null) return null
    return g - strokesOnHole(phOf(tpId), holes?.[hole - 1]?.handicap)
  }

  function holeResult(hole) {
    if (!allFilled) return null
    const t1 = [slotMap[1], slotMap[2]].map(tp => netOf(tp, hole))
    const t2 = [slotMap[3], slotMap[4]].map(tp => netOf(tp, hole))
    if (t1.some(n => n == null) || t2.some(n => n == null)) return null
    const b1 = Math.min(...t1), b2 = Math.min(...t2)
    return b1 < b2 ? 'T1' : b2 < b1 ? 'T2' : 'halve'
  }

  // Stroke dots only when all 4 slots filled; suppress when all 4 stroke.
  // Uses the COURSE handicap (live, from current HI), not the playing handicap.
  function strokesShown(hole) {
    if (!allFilled) return new Set()
    const si = holes?.[hole - 1]?.handicap
    const strokers = [1, 2, 3, 4].map(s => slotMap[s]).filter(tp => strokesOnHole(courseHcpOf(tp), si) >= 1)
    if (strokers.length === 4) return new Set()
    return new Set(strokers)
  }

  const isInPairing = isCommissioner || [1, 2, 3, 4].some(s => slotMap[s] && playersById[slotMap[s]]?.user_id === currentUserId)

  // ── commissioner: assign a player to a slot ──
  async function assignSlot(slot, tripPlayerId) {
    setOpenSlot(null)
    setAssignError(null)
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
      }
      await loadPairings()
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[ScoringTab] assignSlot failed:', e)
      setAssignError(e?.message || 'Could not assign player')
    }
  }

  // Open the assignment dropdown for a slot. Refetches the roster first; if any
  // trip player still lacks a team, block the flow and show the warning instead.
  async function openAssign(slot) {
    if (openSlot === slot) { setOpenSlot(null); return }
    const list = await loadPlayers()
    if (list.some(p => p.team_id == null)) { setTeamWarning(true); return }
    setOpenSlot(slot)
  }

  function availableForSlot(slot) {
    const teamIdx = SLOT_TEAM[slot]
    const teamId = teams[teamIdx]?.id
    const current = slotMap[slot]
    return Object.values(playersById)
      // Show this slot's team plus any not-yet-assigned-to-a-team players, so a
      // player without a team isn't hidden from every slot.
      .filter(p => (teamId ? (p.team_id === teamId || p.team_id == null) : true))
      .filter(p => p.id === current || !assignedInRound.has(p.id))
  }

  function HeaderCell({ slot, teamClass }) {
    const tp = slotMap[slot] ? playersById[slotMap[slot]] : null
    if (!isCommissioner) return <div className={`sc-th-name ${teamClass}`}>{tp ? firstName(tp.name) : 'TBD'}</div>
    // Empty slot → only offer the + when there are players available to assign.
    const label = tp ? firstName(tp.name) : (availableForSlot(slot).length > 0 ? '+' : 'TBD')
    return (
      <div style={{ position: 'relative' }}>
        <button className={`sc-th-name ${teamClass} sc-th-btn`} onClick={() => openAssign(slot)}>{label}</button>
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
    const tpId = slotMap[slot]; if (!tpId) return
    setModal({ tpId, hole, teamSide: slot <= 2 ? 'T1' : 'T2' })
  }

  // Optimistic score save: update the scorecard and close the modal instantly,
  // then write to Supabase in the background. On failure, roll the score (and
  // its drink cell) back to the previous value and surface a toast. Our own
  // successful write echoes back via postgres_changes, but applyScore dedups
  // identical values so there's no flicker. INSERT/UPDATE already reach other
  // clients through realtime, so no explicit broadcast is needed here.
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
    })()
  }

  function ScoreCell({ slot, hole, shownSet }) {
    const tpId = slotMap[slot]
    if (!tpId) {
      return <span className="sc-score-wrap"><button className="sc-score empty" style={{ opacity: 0.5, cursor: 'default' }} tabIndex={-1}>+</button></span>
    }
    const gross = getScore(tpId, hole)
    const par = holes?.[hole - 1]?.par
    const cls = scoreClass(gross, par)
    // Dot count uses the course handicap (live from current HI), not playing.
    const st = strokesOnHole(courseHcpOf(tpId), holes?.[hole - 1]?.handicap)
    const showDot = shownSet.has(tpId) && st >= 1
    const dc = getDrinks(tpId, hole)
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
        <div className="sc-sub-pts">{allFilled ? st.pts : '—'}</div>
        {t2Slots.map(s => <div key={s} className="sc-sub-score t2">{cell(slotMap[s])}</div>)}
      </div>
    )
  }
  // Total drinks per player across all 18 holes of the active round ("—" for 0).
  function DrinkRow() {
    const total = tpId => {
      if (!tpId) return '—'
      let s = 0
      for (let h = 1; h <= 18; h++) s += getDrinks(tpId, h)
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
    <div>
      {/* Round pills */}
      <div className="pill-row">
        {visibleRounds.map(r => (
          <button key={r.id} className={`pill-btn ${round.id === r.id ? 'active' : ''}`} onClick={() => { setActiveRoundId(r.id); setActivePairingNum(1); setOpenSlot(null) }}>
            <span className="round-pill-name">{formatRoundPillName(r.club_name || r.course_name)}</span>
            {r.round_type === 'practice' && <span className="round-practice-badge">P</span>}
          </button>
        ))}
      </div>

      {!holes && (
        <div className="info-banner" style={{ marginBottom: 10 }}>
          <span>No course data — commissioner needs to set up courses in the Menu → Courses tab.</span>
        </div>
      )}

      {/* Only show the pairing tabs when two pairings actually exist for this round. */}
      {existingNums.length > 1 && (
        <div className="pair-tabs">
          {existingNums.map(n => (
            <button key={n} className={`pair-tab ${pairNum === n ? 'active' : ''}`} onClick={() => setActivePairingNum(n)}>Pairing {n}</button>
          ))}
        </div>
      )}

      {!visibleFilled && (
        <div style={{ textAlign: 'center', fontSize: 12, color: '#7A8FA6', fontStyle: 'italic', padding: '8px 0' }}>
          {isCommissioner ? 'Tap a + header to assign players to this pairing' : 'Pairings not set yet — ask your commissioner'}
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
          {t1Slots.map(s => <HeaderCell key={s} slot={s} teamClass="sc-th-t1" />)}
          <div className="sc-h">Pts</div>
          {t2Slots.map(s => <HeaderCell key={s} slot={s} teamClass="sc-th-t2" />)}
        </div>

        {Array.from({ length: 18 }, (_, i) => i + 1).map(hole => {
          const shownSet = strokesShown(hole)
          return (
            <div key={hole}>
              <div className={`sc-row sc-hole-row ${hole === 10 ? 'nine-divider' : ''}`} style={{ gridTemplateColumns: scGridCols, paddingTop: 3, paddingBottom: 3 }}>
                <div className="sc-cell-hole">{hole}</div>
                <div className="sc-cell-par">{holes?.[hole - 1]?.par ?? '—'}</div>
                <div className="sc-cell-si">{holes?.[hole - 1]?.handicap ?? '—'}</div>
                {t1Slots.map(s => <ScoreCell key={s} slot={s} hole={hole} shownSet={shownSet} />)}
                <PointsChip result={holeResult(hole)} />
                {t2Slots.map(s => <ScoreCell key={s} slot={s} hole={hole} shownSet={shownSet} />)}
              </div>
              {hole === 9 && <SubRow label="Out" start={1} end={9} />}
              {hole === 18 && <SubRow label="In" start={10} end={18} />}
              {hole === 18 && <SubRow label="Tot" start={1} end={18} />}
              {hole === 18 && <DrinkRow />}
            </div>
          )
        })}
      </div>

      {modal && (
        <ScoreModal
          modal={modal} round={round} player={playersById[modal.tpId]}
          teamName={getTeamDisplayName(modal.teamSide === 'T1' ? teams[0] : teams[1])}
          par={holes?.[modal.hole - 1]?.par} si={holes?.[modal.hole - 1]?.handicap}
          courseHcp={phOf(modal.tpId)} canSave={isInPairing}
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

      {/* Block pairing assignment until every trip player has a team. */}
      {teamWarning && (
        <div role="dialog" aria-modal="true"
          onClick={() => setTeamWarning(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 14, padding: '22px 20px', maxWidth: 360, width: '100%', textAlign: 'center', boxShadow: '0 10px 40px rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0D1B2A', marginBottom: 8 }}>Assign teams first</div>
            <p style={{ fontSize: 14, color: '#2C3E50', lineHeight: 1.5, margin: '0 0 18px' }}>
              You must assign teams to all players under the Players tab before adding players to the scorecard.
            </p>
            <button onClick={() => setTeamWarning(false)}
              style={{ width: '100%', background: '#1B3F6E', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 20px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
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
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' },
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

  return (
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
    </div>
  )
}
