import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGroup } from '../../context/GroupContext'

export default function GroupSelector() {
  const { userGroups, loading, selectGroup } = useGroup()
  const navigate = useNavigate()
  const redirected = useRef(false)

  useEffect(() => {
    if (loading || redirected.current) return
    redirected.current = true
    if (userGroups.length > 0) {
      selectGroup(userGroups[0])
      navigate('/dashboard', { replace: true })
    } else {
      navigate('/onboarding/trip', { replace: true })
    }
  }, [loading, userGroups])

  return <div className="loading-screen">Loading…</div>
}
