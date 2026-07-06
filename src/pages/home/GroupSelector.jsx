import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useGroup } from '../../context/GroupContext'

export default function GroupSelector() {
  const { user, loading: authLoading } = useAuth()
  const { allTrips, loading, tripsLoaded } = useGroup()
  const navigate = useNavigate()
  const redirected = useRef(false)

  useEffect(() => {
    // Never decide routing until auth has settled — otherwise a still-loading or
    // transiently-null session could be mistaken for "logged in, no trips".
    if (authLoading || redirected.current) return

    // Not logged in (or session cleared) → /login. This guard runs BEFORE any
    // wizard redirect, so a signed-out user is never dropped into create-a-trip.
    if (!user) {
      redirected.current = true
      navigate('/login', { replace: true })
      return
    }

    // Authenticated, but trips are still loading → wait.
    if (loading || !tripsLoaded) return

    redirected.current = true
    if (allTrips.length > 0) {
      // Logged in + has at least one trip → dashboard (context auto-selects the
      // best trip by priority / last-selected).
      navigate('/dashboard', { replace: true })
    } else {
      // Logged in + no trips → onboarding wizard (create a trip).
      navigate('/onboarding/trip', { replace: true })
    }
  }, [authLoading, user, loading, tripsLoaded, allTrips]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="loading-screen">Loading…</div>
}
