import { useNavigate } from 'react-router-dom'
import { useGroup } from '../../context/GroupContext'

export default function GroupSelector() {
  const { userGroups, loading, selectGroup } = useGroup()
  const navigate = useNavigate()

  // AppShell guarantees user is authenticated before this renders.

  function handleSelect(group) {
    selectGroup(group)
    navigate('/dashboard')
  }

  if (loading) return <div className="auth-container"><p>Loading your groups…</p></div>

  return (
    <div className="auth-container">
      <h1>Trip Clubhouse</h1>
      <h2>Your Groups</h2>
      {userGroups.length === 0 ? (
        <div>
          <p>You're not in any groups yet.</p>
          <button onClick={() => navigate('/create-group')}>Create a Group</button>
        </div>
      ) : (
        <div className="group-list">
          {userGroups.map(group => (
            <div key={group.id} className="group-card" onClick={() => handleSelect(group)}>
              <h3>{group.name}</h3>
              <span className="role-badge">{group.role}</span>
            </div>
          ))}
          <button className="secondary" onClick={() => navigate('/create-group')}>
            + Create New Group
          </button>
        </div>
      )}
    </div>
  )
}
