import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, loading: authLoading } = useAuth()

  // One-time notice shown after a flow that bounces back to login (e.g. a completed
  // password reset: "Password updated — please log in.").
  const message = searchParams.get('message')
  // Honor ?redirect= (e.g. /join/:token from an invite), internal paths only.
  const redirect = searchParams.get('redirect')
  const target = redirect && redirect.startsWith('/') ? redirect : '/groups'
  // Carry the redirect through to signup so a new user doesn't lose the invite.
  const signupTo = redirect && redirect.startsWith('/')
    ? `/signup?redirect=${encodeURIComponent(redirect)}`
    : '/signup'

  // Navigate only once auth is confirmed in context. This avoids a race where we
  // navigate to /join before `user` is set, which would bounce JoinTrip back to
  // login. It also redirects an already-authenticated visitor (e.g. the bounce
  // from a just-completed signup) straight to the target.
  useEffect(() => {
    if (!authLoading && user) navigate(target, { replace: true })
  }, [user, authLoading, target, navigate])

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    }
    // On success, the effect above navigates to `target` once `user` updates.
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div>
          <p className="auth-brand">Trip Clubhouse</p>
          <h2>Sign In</h2>
        </div>
        {message && (
          <div style={{ color: '#0F6E56', fontSize: 14, background: 'rgba(15,110,86,0.08)', border: '1px solid rgba(15,110,86,0.25)', borderRadius: 8, padding: '12px 14px', lineHeight: 1.5 }}>
            {message}
          </div>
        )}
        <form className="auth-form" onSubmit={handleLogin}>
          <div>
            <label className="field-label">Email</label>
            <input type="email" placeholder="you@example.com" value={email}
              onChange={e => setEmail(e.target.value)} required />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <label className="field-label">Password</label>
              <Link to="/forgot-password" style={{ fontSize: 12, color: '#3b82f6', fontWeight: 600, textDecoration: 'none' }}>
                Forgot password?
              </Link>
            </div>
            <input type="password" placeholder="••••••••" value={password}
              onChange={e => setPassword(e.target.value)} required />
          </div>
          {error && <p className="error-msg">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
        <div style={{ textAlign: 'center', marginTop: 4 }}>
          <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 10px' }}>New to Trip Clubhouse?</p>
          <Link
            to={signupTo}
            style={{
              display: 'block', textAlign: 'center', padding: '13px',
              borderRadius: 8, border: '2px solid #3b82f6', color: '#3b82f6',
              fontWeight: 700, fontSize: 16, textDecoration: 'none',
            }}
          >
            Create an account
          </Link>
        </div>
      </div>
    </div>
  )
}
