import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { analyzeScoring, playerName, firstName } from '../lib/scoring'

// Tournament Purse — current standings + who owes the purse. Always renders.

const styles = {
  card: { background: '#FFFFFF', border: '1px solid #DDE3EA', borderRadius: '10px', overflow: 'hidden', marginBottom: '10px' },
  header: { background: '#1B3F6E', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: '#fff' },
  amount: { fontSize: '18px', fontWeight: 900, color: '#fff' },
  editBtn: { background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: '11px', fontWeight: 700, borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', marginLeft: 'auto', marginRight: '10px' },
  headerRight: { display: 'flex', alignItems: 'center' },
  editRow: { display: 'flex', gap: '8px', padding: '10px 14px', borderBottom: '1px solid #DDE3EA', background: '#E8EDF3', alignItems: 'center' },
  editInput: { flex: 1, background: '#FFFFFF', border: '1px solid #DDE3EA', borderRadius: '6px', padding: '6px 10px', fontSize: '14px', color: '#0D1B2A', outline: 'none', fontFamily: 'inherit' },
  saveBtn: { background: '#1B3F6E', border: 'none', color: '#fff', fontSize: '13px', fontWeight: 700, borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', flexShrink: 0 },
  body: { padding: '14px' },
  status: { fontSize: '13px', marginBottom: '10px' },
  statusStrong: { fontWeight: 700, color: '#0D1B2A' },
  statusMuted: { color: '#7A8FA6' },
  statusRed: { color: '#C0392B' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' },
  cell: { background: '#E8EDF3', borderRadius: '6px', padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cellName: { fontSize: '13px', fontWeight: 600, color: '#0D1B2A' },
  cellShare: { fontSize: '13px', fontWeight: 800, color: '#C0392B' },
  placeholder: { textAlign: 'center', padding: '12px', fontSize: '13px', color: '#7A8FA6', fontStyle: 'italic' },
}

function money(n) {
  return `$${Number(n).toFixed(2)}`
}

export default function TournamentPurseWidget({ tripId, isCommissioner, purseAmount, onPurseUpdate }) {
  const [data, setData] = useState(null)
  const [showEdit, setShowEdit] = useState(false)
  const [editValue, setEditValue] = useState(String(purseAmount || 0))
  const [saving, setSaving] = useState(false)

  useEffect(() => { setEditValue(String(purseAmount || 0)) }, [purseAmount])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: rounds } = await supabase.from('rounds').select('*').eq('trip_id', tripId)
      const roundIds = (rounds || []).map(r => r.id)

      const [scoresRes, holesRes, pairingsRes, tpRes, teamsRes] = await Promise.all([
        roundIds.length ? supabase.from('scores').select('round_id, hole_number, trip_player_id, gross_score').in('round_id', roundIds) : Promise.resolve({ data: [] }),
        roundIds.length ? supabase.from('course_holes').select('round_id, hole_number, par, stroke_index').in('round_id', roundIds) : Promise.resolve({ data: [] }),
        roundIds.length ? supabase.from('pairings').select('id, round_id, pairing_number').in('round_id', roundIds) : Promise.resolve({ data: [] }),
        supabase.from('trip_players').select('id, user_id, guest_name, handicap_index, team_id').eq('trip_id', tripId),
        supabase.from('teams').select('id, trip_id, name, color').eq('trip_id', tripId).order('name'),
      ])

      const pairings = pairingsRes.data || []
      const pairingIds = pairings.map(p => p.id)
      let pairingPlayers = []
      if (pairingIds.length > 0) {
        const ppRes = await supabase.from('pairing_players').select('id, pairing_id, trip_player_id').in('pairing_id', pairingIds)
        pairingPlayers = ppRes.data || []
      }

      const tripPlayers = tpRes.data || []
      const teams = teamsRes.data || []
      const scores = scoresRes.data || []

      const userIds = tripPlayers.map(p => p.user_id).filter(Boolean)
      const profileMap = {}
      if (userIds.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, display_name').in('id', userIds)
        if (profs) profs.forEach(p => { profileMap[p.id] = p.display_name })
      }

      const { holeWinsByTeam } = analyzeScoring(
        { rounds: rounds || [], scores, courseHoles: holesRes.data || [], pairings, pairingPlayers, tripPlayers },
        null // all complete rounds
      )

      if (cancelled) return
      setData({ scores, teams, tripPlayers, profileMap, holeWinsByTeam })
    }
    load()
    return () => { cancelled = true }
  }, [tripId])

  async function handleSave() {
    setSaving(true)
    const value = Math.max(0, Number(editValue) || 0)
    const { error } = await supabase.from('trips').update({ purse_amount: value }).eq('id', tripId)
    setSaving(false)
    if (!error) {
      setShowEdit(false)
      if (onPurseUpdate) onPurseUpdate()
    }
  }

  const amount = Number(purseAmount) || 0

  // Header (always rendered).
  const header = (
    <div style={styles.header}>
      <span style={styles.title}>Tournament Purse</span>
      <span style={styles.headerRight}>
        {isCommissioner && (
          <button style={styles.editBtn} onClick={() => setShowEdit(v => !v)}>Edit</button>
        )}
        <span style={styles.amount}>{amount > 0 ? `$${amount.toLocaleString()}` : 'TBD'}</span>
      </span>
    </div>
  )

  const editPanel = showEdit && (
    <div style={styles.editRow}>
      <input
        type="number" min="0" step="1" placeholder="0"
        style={styles.editInput}
        value={editValue}
        onChange={e => setEditValue(e.target.value)}
      />
      <button style={styles.saveBtn} onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )

  // Loading.
  if (!data) {
    return <div style={styles.card}>{header}{editPanel}<div style={styles.placeholder}>Loading standings…</div></div>
  }

  const { scores, teams, tripPlayers, profileMap, holeWinsByTeam } = data
  const anyScores = scores.length > 0

  // Standings.
  const teamWins = teams.map(t => ({ ...t, wins: holeWinsByTeam.get(t.id) || 0 }))
  const maxWins = Math.max(0, ...teamWins.map(t => t.wins))
  const leaders = teamWins.filter(t => t.wins === maxWins)
  const tied = teams.length >= 2 && leaders.length !== 1
  const winningTeam = !tied && leaders.length === 1 ? leaders[0] : null
  const losingTeam = winningTeam ? teamWins.find(t => t.id !== winningTeam.id) : null

  // State 1 — no scores at all.
  if (!anyScores) {
    return <div style={styles.card}>{header}{editPanel}<div style={styles.placeholder}>No scores entered yet</div></div>
  }

  // State 2 — scores exist, purse 0: standings text only.
  if (amount === 0) {
    return (
      <div style={styles.card}>
        {header}{editPanel}
        <div style={styles.body}>
          <div style={{ ...styles.status, ...styles.statusMuted }}>
            {tied || !winningTeam ? 'Teams are tied' : `${winningTeam.name} is currently winning`}
          </div>
        </div>
      </div>
    )
  }

  // State 4 — purse > 0, tied: split among all players.
  if (tied || !losingTeam) {
    const share = tripPlayers.length ? amount / tripPlayers.length : 0
    return (
      <div style={styles.card}>
        {header}{editPanel}
        <div style={styles.body}>
          <div style={{ ...styles.status, ...styles.statusMuted }}>Both teams split the purse</div>
          <div style={styles.grid}>
            {tripPlayers.map(tp => (
              <div key={tp.id} style={styles.cell}>
                <span style={styles.cellName}>{firstName(playerName(tp, profileMap))}</span>
                <span style={styles.cellShare}>{money(share)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // State 3 — purse > 0, one team losing: losing team owes.
  const losingPlayers = tripPlayers.filter(tp => tp.team_id === losingTeam.id)
  const share = losingPlayers.length ? amount / losingPlayers.length : 0
  return (
    <div style={styles.card}>
      {header}{editPanel}
      <div style={styles.body}>
        <div style={{ ...styles.status, ...styles.statusRed }}>
          {losingTeam.name} currently owes the purse
        </div>
        <div style={styles.grid}>
          {losingPlayers.map(tp => (
            <div key={tp.id} style={styles.cell}>
              <span style={styles.cellName}>{firstName(playerName(tp, profileMap))}</span>
              <span style={styles.cellShare}>{money(share)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
