import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useNavigate, Link } from 'react-router-dom'

// Landing page for the emailed recovery link. The Supabase client (with
// detectSessionInUrl enabled) automatically exchanges the recovery token in the URL
// for a temporary session and fires a PASSWORD_RECOVERY event. We wait for that
// session, then let the user set a new password. No valid session shows up →
// the link is invalid/expired and we offer to request a fresh one.
export default function ResetPassword() {
  // If the link itself came back with an error (e.g. expired/already used), Supabase
  // puts it in the URL hash — start straight in the invalid state so we never flash
  // the form. Otherwise begin 'checking' until the recovery session shows up.
  const [status, setStatus] = useState(() =>
    new URLSearchParams(window.location.hash.replace(/^#/, '')).get('error') ? 'invalid' : 'checking'
  ) // 'checking' | 'ready' | 'invalid'
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    // Already resolved to invalid from a hash error (see the state initializer).
    if (new URLSearchParams(window.location.hash.replace(/^#/, '')).get('error')) return

    let done = false
    const finish = ok => { if (!done) { done = true; setStatus(ok ? 'ready' : 'invalid') } }

    // The recovery event can fire before OR after this component mounts, so watch
    // the stream AND check the current session directly.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION'))) finish(true)
    })
    supabase.auth.getSession().then(({ data }) => { if (data.session) finish(true) })

    // No session established within a short grace period → treat the link as invalid.
    const t = setTimeout(() => finish(false), 5000)
    return () => { clearTimeout(t); subscription.unsubscribe() }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setSaving(false); return }
    // Drop the temporary recovery session and send them to the login screen so they
    // sign in fresh with the new password.
    await supabase.auth.signOut()
    navigate(`/login?message=${encodeURIComponent('Password updated — please log in.')}`, { replace: true })
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div>
          <p className="auth-brand">Trip Clubhouse</p>
          <h2>Set New Password</h2>
        </div>

        {status === 'checking' && (
          <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>Verifying your reset link…</p>
        )}

        {status === 'invalid' && (
          <>
            <p className="error-msg">This reset link is invalid or has expired. Request a new one to try again.</p>
            <Link to="/forgot-password" className="btn btn-primary" style={{ textAlign: 'center', textDecoration: 'none' }}>
              Request a new link
            </Link>
          </>
        )}

        {status === 'ready' && (
          <form className="auth-form" onSubmit={handleSubmit}>
            <div>
              <label className="field-label">New Password</label>
              <input type="password" placeholder="Min 6 characters" value={password}
                onChange={e => setPassword(e.target.value)} required minLength={6} />
            </div>
            <div>
              <label className="field-label">Confirm Password</label>
              <input type="password" placeholder="Re-enter password" value={confirm}
                onChange={e => setConfirm(e.target.value)} required minLength={6} />
            </div>
            {error && <p className="error-msg">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
