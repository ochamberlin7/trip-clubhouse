import { useState } from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import ErrorBoundary from '../ErrorBoundary'
import TopBar from './TopBar'
import DrawerMenu from './DrawerMenu'

export default function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', color: '#4ade80',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        background: '#0f1117',
      }}>
        Loading…
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  return (
    <div className="app-shell">
      <TopBar onMenuOpen={() => setDrawerOpen(true)} />
      <DrawerMenu open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <main className="main-content">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  )
}
