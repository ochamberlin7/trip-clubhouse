import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useGroup } from '../context/GroupContext'

// Invite link handler: /join/:inviteToken
// Flow: already-member → capacity → email auto-match → manual slot picker.

function slotInitials(p) {
  return `${(p.first_name || '')[0] || ''}${(p.last_name || '')[0] || ''}`.toUpperCase() || '?'
}
function fullName(p) {
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || p.guest_name || 'Player'
}

export default function JoinTrip() {
  const { inviteToken } = useParams()
  const { user, loading: authLoading } = useAuth()
  const { fetchUserGroups, selectGroup } = useGroup()
  const navigate = useNavigate()

  const [status, setStatus] = useState('loading') // loading | pick | error | claiming
  const [trip, setTrip] = useState(null)
  const [slots, setSlots] = useState([])           // unclaimed players
  const [selectedId, setSelectedId] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      navigate(`/login?redirect=/join/${inviteToken}`, { replace: true })
      return
    }
    let cancelled = false
    ;(async () => {
      // STEP 1 — look up the trip.
      const { data: tripRow } = await supabase
        .from('trips').select('*').eq('invite_token', inviteToken).maybeSingle()
      if (cancelled) return
      if (!tripRow) { setError('This invite link is invalid.'); setStatus('error'); return }
      setTrip(tripRow)

      // Load every player on the trip (used for member check, capacity, slots).
      const { data: playersData } = await supabase
        .from('trip_players')
        .select('id, email, is_claimed, claimed_user_id, first_name, last_name, guest_name')
        .eq('trip_id', tripRow.id)
        .order('last_name')
      if (cancelled) return
      const players = playersData || []

      // STEP 2 — already a member? → straight to the dashboard.
      if (players.some(p => p.claimed_user_id === user.id)) {
        await enterDashboard(tripRow)
        return
      }

      // STEP 3 — capacity.
      const claimed = players.filter(p => p.is_claimed).length
      if (players.length > 0 && claimed >= players.length) {
        setError('This trip is full — all player slots have been claimed.')
        setStatus('error')
        return
      }

      // STEP 4 — email auto-match (case-insensitive), exactly one unclaimed.
      const unclaimed = players.filter(p => !p.is_claimed)
      const myEmail = (user.email || '').toLowerCase()
      const emailMatches = unclaimed.filter(p => p.email && p.email.toLowerCase() === myEmail)
      if (emailMatches.length === 1) {
        await claimSlot(emailMatches[0].id, tripRow)
        return
      }

      // STEP 5 — manual picker.
      if (cancelled) return
      setSlots(unclaimed)
      setStatus('pick')
    })()
    return () => { cancelled = true }
  }, [user, authLoading, inviteToken])

  // Ensure a group_members row exists, activate the group, go to the dashboard.
  async function enterDashboard(tripRow) {
    const { data: existing } = await supabase
      .from('group_members').select('group_id, role')
      .eq('group_id', tripRow.group_id).eq('user_id', user.id).maybeSingle()
    if (!existing) {
      await supabase.from('group_members').insert({ group_id: tripRow.group_id, user_id: user.id, role: 'member' })
    }
    const { data: group } = await supabase.from('groups').select('id, name').eq('id', tripRow.group_id).maybeSingle()
    await fetchUserGroups()
    if (group) selectGroup({ ...group, role: existing?.role || 'member' })
    navigate('/dashboard', { replace: true })
  }

  async function claimSlot(slotId, tripRow = trip) {
    setStatus('claiming')
    const { error: claimErr } = await supabase.from('trip_players').update({
      is_claimed: true, claimed_user_id: user.id, user_id: user.id,
    }).eq('id', slotId)
    if (claimErr) { setError(claimErr.message); setStatus('error'); return }
    await enterDashboard(tripRow)
  }

  // ── styles ──
  const sh = {
    page: { minHeight: '100vh', background: '#F0F4F8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
    card: { background: '#fff', borderRadius: 16, padding: '28px 24px', maxWidth: 440, width: '100%', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' },
    eyebrow: { fontSize: 11, textTransform: 'uppercase', letterSpacing: '2px', color: '#1B3F6E', fontWeight: 600, marginBottom: 6 },
    tripName: { fontSize: 18, fontWeight: 700, color: '#0D1B2A' },
    subtitle: { fontSize: 13, color: '#7A8FA6', marginBottom: 16, marginTop: 4 },
    grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
    avatar: { width: 36, height: 36, borderRadius: '50%', background: '#1B3F6E', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, margin: '0 auto 8px' },
    slotName: { fontSize: 14, fontWeight: 600, color: '#0D1B2A' },
    confirm: (enabled) => ({ width: '100%', padding: 15, borderRadius: 10, border: 'none', background: '#1B3F6E', color: '#fff', fontSize: 16, fontWeight: 800, marginTop: 16, cursor: enabled ? 'pointer' : 'default', opacity: enabled ? 1 : 0.5, fontFamily: 'inherit' }),
    error: { fontSize: 15, color: '#C0392B', textAlign: 'center' },
    loading: { fontSize: 14, color: '#7A8FA6', textAlign: 'center', padding: '20px 0' },
  }

  function slotStyle(selected) {
    return {
      background: selected ? 'rgba(27,63,110,0.08)' : '#F5F8FA',
      border: `2px solid ${selected ? '#1B3F6E' : '#DDE3EA'}`,
      borderRadius: 10, padding: '14px 10px', cursor: 'pointer', textAlign: 'center',
      transition: 'all 0.15s', fontFamily: 'inherit',
    }
  }

  if (status === 'loading' || authLoading) {
    return <div style={sh.page}><div style={sh.card}><div style={sh.loading}>Loading…</div></div></div>
  }

  if (status === 'error') {
    return (
      <div style={sh.page}>
        <div style={sh.card}>
          <div style={sh.eyebrow}>Trip Clubhouse</div>
          <div style={sh.error}>{error}</div>
          <button style={sh.confirm(true)} onClick={() => navigate('/login', { replace: true })}>Back to sign in</button>
        </div>
      </div>
    )
  }

  // pick / claiming
  const allClaimed = slots.length === 0
  const canConfirm = !!selectedId && status !== 'claiming'

  return (
    <div style={sh.page}>
      <div style={sh.card}>
        <div style={sh.eyebrow}>Trip Clubhouse</div>
        <div style={sh.tripName}>{trip?.name}</div>
        <div style={sh.subtitle}>You've been invited to join this trip. Select your name below to continue.</div>

        {allClaimed ? (
          <div style={{ fontSize: 13, color: '#7A8FA6', textAlign: 'center', padding: '8px 0' }}>
            All player slots for this trip have been claimed. Contact your trip commissioner if you think this is an error.
          </div>
        ) : (
          <>
            <div style={sh.grid}>
              {slots.map(p => {
                const selected = selectedId === p.id
                return (
                  <button key={p.id} style={slotStyle(selected)} onClick={() => setSelectedId(p.id)}>
                    <div style={sh.avatar}>{slotInitials(p)}</div>
                    <div style={sh.slotName}>{fullName(p)}</div>
                    {selected
                      ? <div style={{ color: '#1B3F6E', fontSize: 16, marginTop: 2 }}>✓</div>
                      : <div style={{ color: '#7A8FA6', fontSize: 11, marginTop: 2 }}>Unclaimed</div>}
                  </button>
                )
              })}
            </div>
            <button
              style={sh.confirm(canConfirm)}
              disabled={!canConfirm}
              onClick={() => canConfirm && claimSlot(selectedId)}
            >
              {status === 'claiming' ? 'Joining…' : "That's Me →"}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
