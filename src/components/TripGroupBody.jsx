// Commissioner Tools → The trip → Group. Moves this trip into another group you're
// in, or into a new group of its own (move_trip_to_group, migration 20260682).
// A group is the tradition: its trips count toward its history and stats.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { loadMyGroups } from '../lib/myGroups'
import { rowUI, SaveLink } from './DisclosureRow'
import GroupPicker, { NEW_GROUP } from './GroupPicker'

const ui = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  sheet: { background: '#fff', borderRadius: 'var(--radius)', padding: 24, width: 'calc(100% - 40px)', maxWidth: 360, textAlign: 'center', boxShadow: 'var(--shadow-pop)' },
  sheetTitle: { fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 },
  sheetText: { fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.45 },
  sheetBtns: { display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 },
  // Same as the other Commissioner Tools pop-ups: Cancel red, the action grey-blue.
  cancelBtn: { background: 'var(--bad)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  goBtn: { background: 'var(--paper-2)', color: 'var(--ink-2)', border: 'none', borderRadius: 'var(--radius)', padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
}

export default function TripGroupBody({ tripId, tripName, groupId, groupName, onMoved }) {
  const { user } = useAuth()
  const [groups, setGroups] = useState(null)
  const [target, setTarget] = useState(NEW_GROUP)
  const [newName, setNewName] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!user) return
    let cancelled = false
    loadMyGroups(supabase, user.id).then(list => {
      if (cancelled) return
      // Every group you're in except this trip's own.
      const others = list.filter(g => g.id !== groupId)
      setGroups(others)
      if (others.length) setTarget(others[0].id)
    })
    return () => { cancelled = true }
  }, [user, groupId])

  if (!groups) return <div style={rowUI.note}>Loading your groups…</div>

  const isNew = target === NEW_GROUP
  const targetName = isNew ? newName.trim() : (groups.find(g => g.id === target)?.name || '')

  function save() {
    setErr('')
    if (isNew && !newName.trim()) { setErr('Name the new group.'); return }
    setConfirming(true)
  }

  async function commit() {
    setSaving(true)
    const { error } = await supabase.rpc('move_trip_to_group', isNew
      ? { p_trip_id: tripId, p_group_id: null, p_new_group_name: newName.trim() }
      : { p_trip_id: tripId, p_group_id: target })
    if (error) {
      setSaving(false)
      setConfirming(false)
      const msg = error.message || ''
      if (/move_trip_to_group/i.test(msg) && /(find|exist)/i.test(msg)) setErr('This needs a database update first (migration 20260682).')
      else setErr(msg || 'Move failed. Try again.')
      return
    }
    onMoved?.()
  }

  return (
    <>
      <div style={rowUI.note}>This trip is in <b style={{ color: 'var(--ink)' }}>{groupName || 'its own group'}</b>. Move it to put it with another group's trips, so it counts toward that group's history and stats.</div>
      <div style={rowUI.fieldLabel}>Move to</div>
      <GroupPicker groups={groups} value={target} onChange={setTarget} />
      {isNew && (
        <>
          <div style={rowUI.fieldLabel}>New group name</div>
          <input style={rowUI.input} value={newName} onChange={e => setNewName(e.target.value)} placeholder="The Boys, CTI Crew, etc." maxLength={80} />
        </>
      )}
      <SaveLink onClick={save} saving={saving} error={err} label="Move trip" />

      {confirming && createPortal(
        <div style={ui.overlay} onClick={() => !saving && setConfirming(false)}>
          <div style={ui.sheet} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div style={ui.sheetTitle}>Move to {isNew ? 'a new group' : targetName}?</div>
            <div style={ui.sheetText}>
              {isNew
                ? `${tripName || 'This trip'} moves into a new group called ${targetName}. Everyone on the trip joins it.`
                : `${tripName || 'This trip'} joins ${targetName} and counts toward its history and stats. Everyone on the trip joins the group.`}
              {' '}Players, scores and chat don't change. Are you sure?
            </div>
            <div style={ui.sheetBtns}>
              <button type="button" style={ui.cancelBtn} onClick={() => setConfirming(false)} disabled={saving}>Cancel</button>
              <button type="button" style={ui.goBtn} onClick={commit} disabled={saving}>{saving ? 'Moving…' : 'Move'}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
