import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useGroup } from '../../context/GroupContext'

export default function RosterAdmin() {
  const { user } = useAuth()
  const { activeGroup, isAdmin } = useGroup()
  const navigate = useNavigate()

  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Invite link
  const [inviteLink, setInviteLink] = useState(null)
  const [inviting, setInviting] = useState(false)
  const [copied, setCopied] = useState(false)

  // Active trip + guest players
  const [activeTrip, setActiveTrip] = useState(null)
  const [tripPlayers, setTripPlayers] = useState([])
  const [guestName, setGuestName] = useState('')
  const [guestHcp, setGuestHcp] = useState('')
  const [addingGuest, setAddingGuest] = useState(false)

  useEffect(() => {
    if (!activeGroup) { navigate('/groups'); return }
    if (!isAdmin) { navigate('/dashboard'); return }
    fetchAll()
  }, [activeGroup, isAdmin])

  async function fetchAll() {
    setLoading(true)
    setError(null)
    await Promise.all([fetchMembers(), fetchActiveTrip()])
    setLoading(false)
  }

  async function fetchMembers() {
    const { data, error } = await supabase
      .from('group_members')
      .select('user_id, role, profiles(display_name)')
      .eq('group_id', activeGroup.id)
    if (error) setError(error.message)
    else setMembers(data || [])
  }

  async function fetchActiveTrip() {
    const { data: trip } = await supabase
      .from('trips')
      .select('id, name')
      .eq('group_id', activeGroup.id)
      .eq('status', 'active')
      .maybeSingle()

    if (!trip) return
    setActiveTrip(trip)

    const { data: players } = await supabase
      .from('trip_players')
      .select('id, guest_name, handicap_index, profiles(display_name)')
      .eq('trip_id', trip.id)
    setTripPlayers(players || [])
  }

  async function handleRemoveMember(userId) {
    setError(null)
    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', activeGroup.id)
      .eq('user_id', userId)
    if (error) setError(error.message)
    else setMembers(prev => prev.filter(m => m.user_id !== userId))
  }

  async function handleAddGuest(e) {
    e.preventDefault()
    if (!guestName.trim() || !activeTrip) return
    setAddingGuest(true)
    setError(null)

    const hcp = guestHcp !== '' ? parseFloat(guestHcp) : null
    const { data, error } = await supabase
      .from('trip_players')
      .insert({
        trip_id: activeTrip.id,
        guest_name: guestName.trim(),
        handicap_index: isNaN(hcp) ? null : hcp,
      })
      .select('id, guest_name, handicap_index, profiles(display_name)')
      .single()

    if (error) {
      setError(error.message)
    } else {
      setTripPlayers(prev => [...prev, data])
      setGuestName('')
      setGuestHcp('')
    }
    setAddingGuest(false)
  }

  async function handleRemovePlayer(playerId) {
    setError(null)
    const { error } = await supabase
      .from('trip_players')
      .delete()
      .eq('id', playerId)
    if (error) setError(error.message)
    else setTripPlayers(prev => prev.filter(p => p.id !== playerId))
  }

  async function handleInvite() {
    setInviting(true)
    setError(null)
    setInviteLink(null)

    const token = crypto.randomUUID()
    // invited_by is nullable — always pass user.id but it won't fail if null
    const { error } = await supabase
      .from('invitations')
      .insert({
        group_id: activeGroup.id,
        token,
        status: 'pending',
        invited_by: user?.id ?? null,
      })

    if (error) {
      setError(`Could not generate invite: ${error.message}`)
      setInviting(false)
      return
    }

    setInviteLink(`${window.location.origin}/invite/${token}`)
    setInviting(false)
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return <div className="dashboard"><p>Loading roster…</p></div>

  return (
    <div className="dashboard">
      <h1>Manage Roster</h1>
      <p className="meta">{activeGroup?.name}</p>
      {error && <p className="error">{error}</p>}

      {/* ── Group Members ── */}
      <section>
        <h2>Group Members ({members.length})</h2>
        {members.length === 0 && <p style={{ color: '#999' }}>No members yet.</p>}
        {members.map(m => (
          <div key={m.user_id} className="player-card">
            <span>{m.profiles?.display_name ?? '(no name)'}</span>
            <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span className="role-badge">{m.role}</span>
              {m.user_id !== user?.id && (
                <button
                  className="secondary"
                  style={{ width: 'auto', padding: '4px 12px', fontSize: 13 }}
                  onClick={() => handleRemoveMember(m.user_id)}
                >
                  Remove
                </button>
              )}
            </span>
          </div>
        ))}
      </section>

      {/* ── Invite Link ── */}
      <section>
        <h2>Invite via Link</h2>
        <p style={{ color: '#999', fontSize: 14, marginBottom: 12 }}>
          Send this link to anyone — they sign up and join the group.
        </p>
        <button onClick={handleInvite} disabled={inviting} style={{ width: 'auto', marginBottom: 12 }}>
          {inviting ? 'Generating…' : 'Generate Invite Link'}
        </button>
        {inviteLink && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              readOnly
              value={inviteLink}
              style={{ flex: 1, fontSize: 13 }}
              onFocus={e => e.target.select()}
            />
            <button onClick={handleCopy} style={{ width: 'auto', padding: '12px 16px' }}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}
      </section>

      {/* ── Trip Roster (guest players) ── */}
      {activeTrip ? (
        <section>
          <h2>Trip Roster — {activeTrip.name}</h2>
          <p style={{ color: '#999', fontSize: 14, marginBottom: 12 }}>
            Add players by name now. You can link their accounts later when they join.
          </p>

          <form onSubmit={handleAddGuest} style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Player name (e.g. John Smith)"
              value={guestName}
              onChange={e => setGuestName(e.target.value)}
              required
              style={{ flex: 2, minWidth: 160 }}
            />
            <input
              type="number"
              placeholder="HCP (optional)"
              value={guestHcp}
              onChange={e => setGuestHcp(e.target.value)}
              step="0.1"
              min="-10"
              max="54"
              style={{ flex: 1, minWidth: 100 }}
            />
            <button type="submit" disabled={addingGuest || !guestName.trim()} style={{ width: 'auto' }}>
              {addingGuest ? 'Adding…' : '+ Add Player'}
            </button>
          </form>

          {tripPlayers.length === 0 && <p style={{ color: '#999' }}>No players added yet.</p>}
          {tripPlayers.map(p => {
            const name = p.guest_name ?? p.profiles?.display_name ?? '(unknown)'
            return (
              <div key={p.id} className="player-card">
                <span>{name}{p.guest_name ? ' (guest)' : ''}</span>
                <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {p.handicap_index != null && <span className="hcp">HCP {p.handicap_index}</span>}
                  <button
                    className="secondary"
                    style={{ width: 'auto', padding: '4px 12px', fontSize: 13 }}
                    onClick={() => handleRemovePlayer(p.id)}
                  >
                    Remove
                  </button>
                </span>
              </div>
            )
          })}
        </section>
      ) : (
        <section>
          <h2>Trip Roster</h2>
          <p style={{ color: '#999' }}>
            Create an active trip first, then come back here to add players.
          </p>
          <button style={{ width: 'auto' }} onClick={() => navigate('/onboarding/trip')}>
            Create a Trip
          </button>
        </section>
      )}

      <button className="secondary" onClick={() => navigate('/dashboard')}>
        ← Back to Dashboard
      </button>
    </div>
  )
}
