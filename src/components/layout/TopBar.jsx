import { useGroup } from '../../context/GroupContext'
import { useNavigate } from 'react-router-dom'

export default function TopBar({ onMenuOpen }) {
  const { activeGroup } = useGroup()
  const navigate = useNavigate()

  return (
    <div className="topbar">
      <button className="menu-btn" onClick={onMenuOpen}>☰</button>
      <h1 className="topbar-title" onClick={() => navigate('/dashboard')}>
        {activeGroup ? activeGroup.name : 'Trip Clubhouse'}
      </h1>
    </div>
  )
}
