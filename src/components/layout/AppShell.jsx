import { Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import ErrorBoundary from '../ErrorBoundary'

export default function AppShell() {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="loading-screen">Loading…</div>
  }

  if (!user) return <Navigate to="/login" replace />

  return (
    <div className="app-shell">
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
    </div>
  )
}
