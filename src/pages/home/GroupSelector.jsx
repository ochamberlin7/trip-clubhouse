import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useGroup } from '../../context/GroupContext'

export default function GroupSelector() {
  const { user, loading: authLoading } = useAuth()
  const { userGroups, loading, selectGroup } = useGroup()
  const navigate = useNavigate()
  const redirected = useRef(false)

  useEffect(() => {
    // Never decide routing until auth has settled — otherwise a still-loading or
    // transiently-null session could be mistaken for "logged in, no groups".
    if (authLoading || redirected.current) return

    // Not logged in (or session cleared) → /login. This guard runs BEFORE any
    // wizard redirect, so a signed-out user is never dropped into create-a-trip.
    if (!user) {
      redirected.current = true
      navigate('/login', { replace: true })
      return
    }

    // Authenticated, but the group list is still loading → wait.
    if (loading) return

    redirected.current = true
    if (userGroups.length > 0) {
      // Logged in + has groups → trip dashboard.
      selectGroup(userGroups[0])
      navigate('/dashboard', { replace: true })
    } else {
      // Logged in + no groups → onboarding wizard (create a trip).
      navigate('/onboarding/trip', { replace: true })
    }
  }, [authLoading, user, loading, userGroups]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="loading-screen">Loading…</div>
}
