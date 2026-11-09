import { useLayoutEffect } from 'react'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import ErrorBoundary from '../ErrorBoundary'
import NoSignalTab from '../NoSignalTab'
import { useScoreSyncEngine } from '../../lib/useScoreSync'

export default function AppShell() {
  const { user, loading } = useAuth()
  const { pathname } = useLocation()
  // Every page opens at the top. The browser keeps the window's scroll across
  // in-app navigation, so without this a new page can open part way down.
  useLayoutEffect(() => { window.scrollTo(0, 0) }, [pathname])
  // Sends scores saved offline as soon as there's signal, whatever screen is open.
  useScoreSyncEngine()

  if (loading) {
    return <div className="loading-screen">Loading…</div>
  }

  if (!user) return <Navigate to="/login" replace />

  return (
    <div className="app-shell">
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
      <NoSignalTab />
    </div>
  )
}
