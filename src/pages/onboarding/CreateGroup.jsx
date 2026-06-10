import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useGroup } from '../../context/GroupContext'

export default function CreateGroup() {
  const { user } = useAuth()
  const { fetchUserGroups, selectGroup } = useGroup()
  const [name, setName] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleCreate(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .insert({ name, created_by: user.id })
        .select()
        .single()

      if (groupError) { setError(groupError.message); return }

      const { error: memberError } = await supabase
        .from('group_members')
        .insert({ group_id: group.id, user_id: user.id, role: 'admin' })

      if (memberError) { setError(memberError.message); return }

      await fetchUserGroups()
      selectGroup({ ...group, role: 'admin' })
      navigate('/onboarding/trip')
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-container">
      <h1>Trip Clubhouse</h1>
      <h2>Create a Group</h2>
      <p>A group is your crew — CTI, Family Golf Trip, Ireland 2027, etc.</p>
      <form onSubmit={handleCreate}>
        <input type="text" placeholder="Group name (e.g. CTI)" value={name}
          onChange={e => setName(e.target.value)} required />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Create Group'}
        </button>
      </form>
      <button className="secondary" onClick={() => navigate('/groups')}>Back</button>
    </div>
  )
}
