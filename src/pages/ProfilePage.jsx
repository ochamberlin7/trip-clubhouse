// The signed-in user's own account/profile — this edits the AUTH record
// (Supabase auth user + the shared `profiles` row), NOT any per-trip
// `trip_players` slot. Editing here does not touch a user's per-trip player
// rows across their trips.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// Display-only phone formatting — matches Signup.jsx. Stored value is raw digits.
function formatPhone(raw) {
  const d = (raw || '').replace(/\D/g, '')
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  return raw
}

function splitName(displayName) {
  const parts = (displayName || '').trim().split(/\s+/).filter(Boolean)
  return { first: parts[0] || '', last: parts.slice(1).join(' ') || '' }
}

const emailLooksValid = (e) => /^\S+@\S+\.\S+$/.test((e || '').trim())

export default function ProfilePage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  // AppShell guarantees `user` is present before this renders, so seed directly.
  const seeded = splitName(user?.user_metadata?.display_name)
  const [firstName, setFirstName] = useState(seeded.first)
  const [lastName, setLastName] = useState(seeded.last)
  const [phone, setPhone] = useState(formatPhone(user?.user_metadata?.phone || ''))
  const [email, setEmail] = useState(user?.email || '')

  const [profileMsg, setProfileMsg] = useState(null)
  const [profileErr, setProfileErr] = useState(null)
  const [savingProfile, setSavingProfile] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwMsg, setPwMsg] = useState(null)
  const [pwErr, setPwErr] = useState(null)
  const [savingPw, setSavingPw] = useState(false)

  async function saveProfile(e) {
    e.preventDefault()
    setProfileMsg(null)
    setProfileErr(null)
    if (!firstName.trim() || !lastName.trim()) { setProfileErr('First and last name are required.'); return }
    if (!emailLooksValid(email)) { setProfileErr('Enter a valid email address.'); return }

    setSavingProfile(true)
    const displayName = `${firstName.trim()} ${lastName.trim()}`.trim()
    const phoneDigits = phone.replace(/\D/g, '') || null
    const emailChanged = email.trim().toLowerCase() !== (user.email || '').toLowerCase()

    try {
      // Name + phone update immediately in both auth metadata and the shared profile row.
      const { error: metaErr } = await supabase.auth.updateUser({ data: { display_name: displayName, phone: phoneDigits } })
      if (metaErr) throw metaErr
      const { error: profErr } = await supabase.from('profiles').update({ display_name: displayName, phone: phoneDigits }).eq('id', user.id)
      if (profErr) throw profErr

      // Email change goes through Supabase Auth, which requires confirming the
      // new address before it takes effect — surface that instead of implying
      // it's already changed.
      if (emailChanged) {
        const { error: emailErr } = await supabase.auth.updateUser({ email: email.trim() })
        if (emailErr) throw emailErr
        setProfileMsg(`Profile saved. Check your new email (${email.trim()}) to confirm the address change — until then your login email stays the same.`)
      } else {
        setProfileMsg('Profile saved.')
      }
    } catch (err) {
      setProfileErr(err?.message || String(err))
    } finally {
      setSavingProfile(false)
    }
  }

  async function changePassword(e) {
    e.preventDefault()
    setPwMsg(null)
    setPwErr(null)
    if (!currentPassword) { setPwErr('Enter your current password.'); return }
    if (newPassword.length < 6) { setPwErr('New password must be at least 6 characters.'); return }
    if (newPassword !== confirmPassword) { setPwErr('New passwords do not match.'); return }
    if (newPassword === currentPassword) { setPwErr('New password must be different from the current one.'); return }

    setSavingPw(true)
    try {
      // Re-authenticate to confirm the current password before allowing a change —
      // no silent/unconfirmed password updates.
      const { error: reauthErr } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword })
      if (reauthErr) { setPwErr('Current password is incorrect.'); setSavingPw(false); return }

      const { error: updErr } = await supabase.auth.updateUser({ password: newPassword })
      if (updErr) throw updErr

      setPwMsg('Password updated.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setPwErr(err?.message || String(err))
    } finally {
      setSavingPw(false)
    }
  }

  // Same sign-out logic previously used by the drawer.
  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn-ghost" style={{ paddingLeft: 0 }} onClick={() => navigate(-1)}>← Back</button>
        </div>
        <div>
          <p className="auth-brand">Your Account</p>
          <h2>Profile</h2>
        </div>

        <form className="auth-form" onSubmit={saveProfile}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label className="field-label">First Name</label>
              <input type="text" placeholder="First" value={firstName} onChange={e => setFirstName(e.target.value)} required />
            </div>
            <div style={{ flex: 1 }}>
              <label className="field-label">Last Name</label>
              <input type="text" placeholder="Last" value={lastName} onChange={e => setLastName(e.target.value)} required />
            </div>
          </div>
          <div>
            <label className="field-label">Phone Number</label>
            <input type="tel" placeholder="(555) 000-0000" value={phone}
              onChange={e => setPhone(e.target.value)}
              onBlur={() => setPhone(formatPhone(phone))} />
          </div>
          <div>
            <label className="field-label">Email</label>
            <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          {profileErr && <p className="error-msg">{profileErr}</p>}
          {profileMsg && <div className="info-banner">{profileMsg}</div>}
          <button type="submit" className="btn btn-primary" disabled={savingProfile}>
            {savingProfile ? 'Saving…' : 'Save Changes'}
          </button>
        </form>

        <div>
          <p className="auth-brand">Security</p>
          <h2>Change Password</h2>
        </div>
        <form className="auth-form" onSubmit={changePassword}>
          <div>
            <label className="field-label">Current Password</label>
            <input type="password" placeholder="Current password" value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)} autoComplete="current-password" />
          </div>
          <div>
            <label className="field-label">New Password</label>
            <input type="password" placeholder="Min 6 characters" value={newPassword}
              onChange={e => setNewPassword(e.target.value)} minLength={6} autoComplete="new-password" />
          </div>
          <div>
            <label className="field-label">Confirm New Password</label>
            <input type="password" placeholder="Re-enter new password" value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)} minLength={6} autoComplete="new-password" />
          </div>
          {pwErr && <p className="error-msg">{pwErr}</p>}
          {pwMsg && <div className="info-banner">{pwMsg}</div>}
          <button type="submit" className="btn btn-primary" disabled={savingPw}>
            {savingPw ? 'Updating…' : 'Update Password'}
          </button>
        </form>

        <button
          type="button"
          onClick={handleSignOut}
          style={{
            width: '100%',
            background: 'transparent',
            border: '1px solid #E8EDF3',
            color: '#C0392B',
            fontWeight: 600,
            fontSize: 15,
            padding: '12px',
            borderRadius: 8,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}
