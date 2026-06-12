import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { strokesOnHole, computePlayingHandicaps } from '../lib/scoring'

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

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      if (roundIds.length === 0) { setLoading(false); return }
      const [tpRes, teamRes, scoreRes, drinkRes] = await Promise.all([
        supabase.from('trip_players').select('id, user_id, first_name, last_name, guest_name, handicap_index, team_id').eq('trip_id', trip.id),
        // Order by created_at (id as a stable tiebreaker, since wizard-created rows
        // share a created_at) so teams[0]/teams[1] map to the T1/T2 slots (SLOT_TEAM)
        // consistently with the commissioner editor, regardless of renaming.
        supabase.from('teams').select('id, name, color').eq('trip_id', trip.id).order('created_at').order('id'),
        supabase.from('scores').select('round_id, trip_player_id, hole_number, gross_score').in('round_id', roundIds),
        supabase.from('drinks').select('round_id, trip_player_id, hole_number, count').in('round_id', roundIds),
      ])
      const tps = tpRes.data || []
      const userIds = tps.map(t => t.user_id).filter(Boolean)
      const profMap = {}
      if (userIds.length) {
        const { data: profs } = await supabase.from('profiles').select('id, display_name').in('id', userIds)
        if (profs) profs.forEach(p => { profMap[p.id] = p.display_name })
      }
      const pById = {}
      tps.forEach(tp => {
        const name = [tp.first_name, tp.last_name].filter(Boolean).join(' ') || tp.guest_name || profMap[tp.user_id] || 'Player'
        pById[tp.id] = { ...tp, name }
      })
      const sMap = {}; (scoreRes.data || []).forEach(s => { if (s.gross_score != null) sMap[`${s.round_id}:${s.trip_player_id}:${s.hole_number}`] = s.gross_score })
      const dMap = {}; (drinkRes.data || []).forEach(d => { if (d.count > 0) dMap[`${d.round_id}:${d.trip_player_id}:${d.hole_number}`] = d.count })
      if (cancelled) return
      setPlayersById(pById)
      setTeams(teamRes.data || [])
      setScores(sMap)
      setDrinks(dMap)
      await loadPairings()
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

  if (loading) return <div className="empty-state">Loading scorecard…</div>
  if (rounds.length === 0) return <div className="empty-state"><span className="empty-state-icon">📊</span>No rounds to score yet.</div>

  const round = rounds.find(r => r.id === activeRoundId) || rounds[0]
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

  // Low-ball playing handicaps for the players currently in this pairing.
  const allowance = trip.handicap_allowance ?? 100
  const filledPlayers = [1, 2, 3, 4].map(s => slotMap[s]).filter(Boolean).map(id => ({ id, handicap_index: playersById[id]?.handicap_index }))
  const playingByTp = computePlayingHandicaps(filledPlayers, round.slope_rating, allowance)
  const phOf = tpId => playingByTp.get(tpId) ?? 0

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
  function strokesShown(hole) {
    if (!allFilled) return new Set()
    const si = holes?.[hole - 1]?.handicap
    const strokers = [1, 2, 3, 4].map(s => slotMap[s]).filter(tp => strokesOnHole(phOf(tp), si) >= 1)
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

  function availableForSlot(slot) {
    const teamIdx = SLOT_TEAM[slot]
    const teamId = teams[teamIdx]?.id
    const current = slotMap[slot]
    return Object.values(playersById)
      .filter(p => (teamId ? p.team_id === teamId : true))
      .filter(p => p.id === current || !assignedInRound.has(p.id))
  }

  function HeaderCell({ slot, teamClass }) {
    const tp = slotMap[slot] ? playersById[slotMap[slot]] : null
    if (!isCommissioner) return <div className={`sc-th-name ${teamClass}`}>{tp ? firstName(tp.name) : 'TBD'}</div>
    const label = tp ? firstName(tp.name) : '+'
    return (
      <div style={{ position: 'relative' }}>
        <button className={`sc-th-name ${teamClass} sc-th-btn`} onClick={() => setOpenSlot(openSlot === slot ? null : slot)}>{label}</button>
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

  function ScoreCell({ slot, hole, shownSet }) {
    const tpId = slotMap[slot]
    if (!tpId) {
      return <span className="sc-score-wrap"><button className="sc-score empty" style={{ opacity: 0.5, cursor: 'default' }} tabIndex={-1}>+</button></span>
    }
    const gross = getScore(tpId, hole)
    const par = holes?.[hole - 1]?.par
    const cls = scoreClass(gross, par)
    const st = strokesOnHole(phOf(tpId), holes?.[hole - 1]?.handicap)
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
          {dc > 0 && <span className="drink-badge">🍺{dc}</span>}
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
      <div className="sc-row sc-sub-row">
        <div className="sc-sub-label">{label}</div>
        <div className="sc-sub-par">{st.parSum ?? '—'}</div><div />
        <div className="sc-sub-score t1">{cell(slotMap[1])}</div>
        <div className="sc-sub-score t1">{cell(slotMap[2])}</div>
        <div className="sc-sub-pts">{allFilled ? st.pts : '—'}</div>
        <div className="sc-sub-score t2">{cell(slotMap[3])}</div>
        <div className="sc-sub-score t2">{cell(slotMap[4])}</div>
      </div>
    )
  }

  return (
    <div>
      {/* Round pills */}
      <div className="pill-row">
        {rounds.map(r => (
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

      {availableNums.length > 1 && (
        <div className="pair-tabs">
          {availableNums.map(n => (
            <button key={n} className={`pair-tab ${pairNum === n ? 'active' : ''}`} onClick={() => setActivePairingNum(n)}>Pairing {n}</button>
          ))}
        </div>
      )}

      {!allFilled && (
        <div style={{ textAlign: 'center', fontSize: 12, color: '#7A8FA6', fontStyle: 'italic', padding: '8px 0' }}>
          {isCommissioner ? 'Tap a + header to assign players to this pairing' : 'Pairings not set yet — ask your commissioner'}
        </div>
      )}
      {assignError && (
        <div style={{ textAlign: 'center', fontSize: 12, color: '#C0392B', padding: '0 0 8px' }}>Couldn’t assign: {assignError}</div>
      )}

      <div className="sc-card">
        <div className="sc-row sc-head" ref={headerRef}>
          <div className="sc-h">Hole</div>
          <div className="sc-h">Par</div>
          <div className="sc-h">S.I.</div>
          <HeaderCell slot={1} teamClass="sc-th-t1" />
          <HeaderCell slot={2} teamClass="sc-th-t1" />
          <div className="sc-h">Pts</div>
          <HeaderCell slot={3} teamClass="sc-th-t2" />
          <HeaderCell slot={4} teamClass="sc-th-t2" />
        </div>

        {Array.from({ length: 18 }, (_, i) => i + 1).map(hole => {
          const shownSet = strokesShown(hole)
          return (
            <div key={hole}>
              <div className={`sc-row sc-hole-row ${hole === 10 ? 'nine-divider' : ''}`} style={{ paddingTop: 3, paddingBottom: 3 }}>
                <div className="sc-cell-hole">{hole}</div>
                <div className="sc-cell-par">{holes?.[hole - 1]?.par ?? '—'}</div>
                <div className="sc-cell-si">{holes?.[hole - 1]?.handicap ?? '—'}</div>
                <ScoreCell slot={1} hole={hole} shownSet={shownSet} />
                <ScoreCell slot={2} hole={hole} shownSet={shownSet} />
                <PointsChip result={holeResult(hole)} />
                <ScoreCell slot={3} hole={hole} shownSet={shownSet} />
                <ScoreCell slot={4} hole={hole} shownSet={shownSet} />
              </div>
              {hole === 9 && <SubRow label="Out" start={1} end={9} />}
              {hole === 18 && <SubRow label="In" start={10} end={18} />}
              {hole === 18 && <SubRow label="Tot" start={1} end={18} />}
            </div>
          )
        })}
      </div>

      {modal && (
        <ScoreModal
          modal={modal} round={round} player={playersById[modal.tpId]}
          teamName={modal.teamSide === 'T1' ? teams[0]?.name : teams[1]?.name}
          par={holes?.[modal.hole - 1]?.par} si={holes?.[modal.hole - 1]?.handicap}
          courseHcp={phOf(modal.tpId)} canSave={isInPairing}
          existingScore={getScore(modal.tpId, modal.hole)} existingDrinks={getDrinks(modal.tpId, modal.hole)}
          onClose={() => setModal(null)}
          onSaved={(hole, tpId, score, drinkCount) => {
            setScores(prev => ({ ...prev, [`${round.id}:${tpId}:${hole}`]: score }))
            setDrinks(prev => { const n = { ...prev }; const k = `${round.id}:${tpId}:${hole}`; if (drinkCount > 0) n[k] = drinkCount; else delete n[k]; return n })
            setModal(null)
          }}
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
    </div>
  )
}

// ── Score + drink entry modal ─────────────────────────────────────
function ScoreModal({ modal, round, player, teamName, par, si, courseHcp, canSave, existingScore, existingDrinks, onClose, onSaved, onRemoved }) {
  const { tpId, hole, teamSide } = modal
  const [score, setScore] = useState(existingScore ?? par ?? 4)
  const [drinkCount, setDrinkCount] = useState(existingDrinks ?? 0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const netPar = par != null ? par - strokesOnHole(courseHcp, si) : null

  async function save() {
    setBusy(true); setErr(null)
    const { error } = await supabase.from('scores').upsert(
      { round_id: round.id, trip_player_id: tpId, hole_number: hole, gross_score: score },
      { onConflict: 'round_id,trip_player_id,hole_number' })
    if (error) { setBusy(false); setErr(error.message); return }
    if (drinkCount > 0) {
      await supabase.from('drinks').upsert(
        { round_id: round.id, trip_player_id: tpId, hole_number: hole, count: drinkCount },
        { onConflict: 'round_id,trip_player_id,hole_number' })
    } else {
      await supabase.from('drinks').delete().eq('round_id', round.id).eq('trip_player_id', tpId).eq('hole_number', hole)
    }
    setBusy(false)
    onSaved(hole, tpId, score, drinkCount)
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
  const teamStyle = teamSide === 'T1' ? { background: 'rgba(27,63,110,0.15)', color: '#1B3F6E' } : { background: 'rgba(30,138,110,0.15)', color: '#1E8A6E' }

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
