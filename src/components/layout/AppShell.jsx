import { Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import ErrorBoundary from '../ErrorBoundary'
import NoSignalTab from '../NoSignalTab'
import { useScoreSyncEngine } from '../../lib/useScoreSync'

export default function AppShell() {
  const { user, loading } = useAuth()
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
