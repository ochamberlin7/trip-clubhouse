import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useGroup } from '../../context/GroupContext'

export default function DrawerMenu({ open, onClose }) {
  const navigate = useNavigate()
  const { isAdmin } = useGroup()

  function go(path) {
    navigate(path)
    onClose()
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login')
    onClose()
  }

  return (
    <>
      {open && <div className="drawer-overlay" onClick={onClose} />}
      <div className={`drawer ${open ? 'open' : ''}`}>
        <button className="close-btn" onClick={onClose}>✕</button>
        <nav>
          <button onClick={() => go('/dashboard')}>🏠 Home</button>
          <button onClick={() => go('/groups')}>👥 Switch Group</button>
          {isAdmin && <button onClick={() => go('/admin/roster')}>⚙️ Manage Roster</button>}
          <button onClick={() => go('/history')}>📁 Past Trips</button>
          <hr />
          <button onClick={handleSignOut}>Sign Out</button>
        </nav>
      </div>
    </>
  )
}
