import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

export default function InviteAccept() {
  const { token } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [invite, setInvite] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    fetchInvite()
  }, [token])

  async function fetchInvite() {
    const { data, error } = await supabase
      .from('invitations')
      .select('*, groups(name)')
      .eq('token', token)
      .eq('status', 'pending')
      .single()

    if (error || !data) {
      setError('This invite link is invalid or has expired.')
    } else {
      setInvite(data)
    }
    setLoading(false)
  }

  async function handleAccept() {
    if (!user) {
      navigate(`/signup?invite=${token}`)
      return
    }
    setAccepting(true)
    const { error: memberError } = await supabase
      .from('group_members')
      .insert({ group_id: invite.group_id, user_id: user.id, role: 'player' })

    if (!memberError) {
      await supabase.from('invitations').update({ status: 'accepted' }).eq('id', invite.id)
      navigate('/groups')
    } else {
      setError('Failed to accept invite. You may already be a member.')
      setAccepting(false)
    }
  }

  if (loading) return <div className="auth-container"><p>Loading invite...</p></div>
  if (error) return <div className="auth-container"><p className="error">{error}</p></div>

  return (
    <div className="auth-container">
      <h1>Trip Clubhouse</h1>
      <h2>You're invited!</h2>
      <p>You've been invited to join <strong>{invite.groups.name}</strong></p>
      {!user && <p>You'll need to create an account or sign in first.</p>}
      <button onClick={handleAccept} disabled={accepting}>
        {accepting ? 'Accepting...' : `Accept Invite to ${invite.groups.name}`}
      </button>
      {!user && <p>Already have an account? <a href={`/login?invite=${token}`}>Sign in</a></p>}
    </div>
  )
}
