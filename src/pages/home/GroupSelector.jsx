import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useGroup } from '../../context/GroupContext'
import { postLoginDestination } from '../../lib/loginLanding'

export default function GroupSelector() {
  const { user, loading: authLoading } = useAuth()
  const { allTrips, loading, tripsLoaded, switchTrip } = useGroup()
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
    // Open ON a trip from 14 days before it starts through 7 days after it ends;
    // otherwise Trip Clubhouse Home — also for brand-new users with no trips.
    // Never the trip wizard. Rule + tests: src/lib/loginLanding.js.
    const { path, tripId } = postLoginDestination({ trips: allTrips })
    if (tripId) switchTrip(tripId)
    navigate(path, { replace: true })
  }, [authLoading, user, loading, tripsLoaded, allTrips]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="loading-screen">Loading…</div>
}
