import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { GroupProvider } from './context/GroupContext'
import Login from './pages/auth/Login'
import Signup from './pages/auth/Signup'
import InviteAccept from './pages/auth/InviteAccept'
import GroupSelector from './pages/home/GroupSelector'
import TripWizard from './pages/onboarding/TripWizard'
import TripDashboard from './pages/dashboard/TripDashboard'
import JoinTrip from './pages/JoinTrip'
import ProfilePage from './pages/ProfilePage'
import AppShell from './components/layout/AppShell'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <GroupProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/invite/:token" element={<InviteAccept />} />
            <Route path="/join/:inviteToken" element={<JoinTrip />} />
            <Route element={<AppShell />}>
              <Route path="/groups" element={<GroupSelector />} />
              <Route path="/onboarding/trip" element={<TripWizard />} />
              <Route path="/dashboard" element={<TripDashboard />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Route>
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </GroupProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
