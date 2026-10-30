// Commissioner Tools → Players & Teams → Number of teams. The rule lives in
// src/lib/teamCount.js (preview) and the change_team_count RPC (the save, in one
// transaction). Locked once any score is entered.
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { rowUI, SaveLink } from './DisclosureRow'
import { getTeamDisplayName } from '../lib/teamColors'
import { teamCountChoices, planTeamCountChange } from '../lib/teamCount'

const TEAM_WORD = { 2: 'Two', 3: 'Three', 4: 'Four' }

const ui = {
  seg: { display: 'flex', border: '1px solid #1B3F6E', borderRadius: 4, overflow: 'hidden', marginTop: 4 },
  segBtn: (on, first) => ({ flex: 1, padding: '11px 0', background: on ? '#1B3F6E' : 'transparent', color: on ? '#fff' : '#1B3F6E', border: 'none', borderLeft: first ? 'none' : '1px solid #1B3F6E', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }),
  warn: { fontSize: 12.5, color: '#7A4B00', lineHeight: 1.5, marginTop: 10, background: '#FFF4DC', borderRadius: 8, padding: '9px 11px' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  sheet: { background: '#fff', borderRadius: 12, padding: 24, width: 'calc(100% - 40px)', maxWidth: 360, textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' },
  sheetTitle: { fontSize: 18, fontWeight: 700, color: '#0D1B2A', marginBottom: 8 },
  sheetText: { fontSize: 14, color: '#2C3E50', lineHeight: 1.45 },
  sheetBtns: { display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 },
  // Same as the Trip Dates pop-up: Cancel red, Change grey-blue.
  cancelBtn: { background: '#C0392B', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  changeBtn: { background: '#E8EDF3', color: '#2C3E50', border: 'none', borderRadius: 6, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
}

const nameOf = p => [p.first_name, p.last_name].filter(Boolean).join(' ') || p.guest_name || 'Player'

export default function TeamCountBody({ tripId, teams, onSaved, onClose }) {
  const [data, setData] = useState(null) // { players, scored }
  const [target, setTarget] = useState(teams.length)
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [pRes, rRes] = await Promise.all([
        supabase.from('trip_players').select('id, team_id, first_name, last_name, guest_name').eq('trip_id', tripId),
        supabase.from('rounds').select('id').eq('trip_id', tripId),
      ])
      const ids = (rRes.data || []).map(r => r.id)
      let scored = false
      if (ids.length) {
        const { count, error } = await supabase.from('scores').select('round_id', { count: 'exact', head: true }).in('round_id', ids)
        scored = error ? true : (count || 0) > 0
      }
      if (!cancelled) setData({ players: pRes.data || [], scored })
    })()
    return () => { cancelled = true }
  }, [tripId])

  const plan = useMemo(
    () => (data ? planTeamCountChange({ teams, players: data.players, target }) : null),
    [data, teams, target],
  )

  if (!data) return <div style={rowUI.note}>Checking…</div>
  if (data.scored) return <div style={rowUI.note}>Scores have been entered, so the number of teams is locked.</div>

  const playerCount = data.players.length
  const choices = teamCountChoices(playerCount, teams.length)
  const removedNames = plan?.removeTeams.map(getTeamDisplayName).join(' and ')
  const addedNames = plan?.add.map(t => `Team ${t.team_index}`).join(' and ')

  function save() {
    setErr('')
    if (!plan?.ok) { onClose?.(); return } // unchanged → just close
    setConfirming(true)
  }

  async function commit() {
    setSaving(true)
    const { error } = await supabase.rpc('change_team_count', { p_trip_id: tripId, p_target: target })
    setSaving(false)
    setConfirming(false)
    if (error) {
      const msg = error.message || ''
      if (/change_team_count/i.test(msg) && /(find|exist)/i.test(msg)) setErr('This needs a database update first (migration 20260678).')
      else if (/locked/i.test(msg)) setErr('Scores have been entered, so the number of teams is locked.')
      else setErr(`Save failed: ${msg || 'unknown error'}`)
      return
    }
    onSaved?.()
    onClose?.()
  }

  return (
    <>
      <div style={rowUI.fieldLabel}>Number of teams · {playerCount} player{playerCount === 1 ? '' : 's'}</div>
      <div style={ui.seg} role="radiogroup" aria-label="Number of teams">
        {choices.map((n, i) => (
          <button key={n} type="button" role="radio" aria-checked={target === n} style={ui.segBtn(target === n, i === 0)} onClick={() => setTarget(n)}>
            {TEAM_WORD[n] || n}
          </button>
        ))}
      </div>
      <div style={rowUI.note}>Only counts that split the roster evenly are offered.</div>

      {plan?.ok && plan.add.length > 0 && (
        <div style={rowUI.info}>Adds {addedNames}. Assign players to {plan.add.length === 1 ? 'it' : 'them'} on Players &amp; Teams.</div>
      )}
      {plan?.ok && plan.removeTeams.length > 0 && (
        <div style={ui.warn}>
          <strong>Removes {removedNames}.</strong>{' '}
          {plan.unassignPlayers.length
            ? `${plan.unassignPlayers.map(nameOf).join(', ')} will be unassigned — re-assign them on Players & Teams.`
            : 'No players are on them.'}
        </div>
      )}

      <SaveLink onClick={save} saving={saving} error={err} />

      {confirming && createPortal(
        <div style={ui.overlay} onClick={() => !saving && setConfirming(false)}>
          <div style={ui.sheet} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div style={ui.sheetTitle}>Change number of teams?</div>
            <div style={ui.sheetText}>
              {plan.removeTeams.length
                ? `This removes ${removedNames}${plan.unassignPlayers.length ? ' and unassigns their players' : ''}. This cannot be undone. Are you sure?`
                : `This adds ${addedNames}. Are you sure?`}
            </div>
            <div style={ui.sheetBtns}>
              <button type="button" style={ui.cancelBtn} onClick={() => setConfirming(false)} disabled={saving}>Cancel</button>
              <button type="button" style={ui.changeBtn} onClick={commit} disabled={saving}>{saving ? 'Saving…' : 'Change'}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
