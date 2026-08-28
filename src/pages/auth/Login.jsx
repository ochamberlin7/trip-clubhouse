import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
            <div style={{ position: 'relative' }}>
              <input type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={password}
                onChange={e => setPassword(e.target.value)} required style={{ paddingRight: 44 }} />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
                style={{ position: 'absolute', top: 0, right: 0, height: '100%', width: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#7A8FA6' }}
              >
                {showPassword ? (
                  // Eye with a slash — currently visible, click to hide.
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  // Open eye — currently hidden, click to show.
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
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
