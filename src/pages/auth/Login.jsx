import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { authRedirectTarget } from '../../lib/loginLanding'
import Icon from '../../components/ui/Icon'

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
  // Following an invite (?redirect=/join/:token, or older ?invite=:token) → back to
  // it. Otherwise /groups, which opens an in-window trip or Home (loginLanding.js).
  const redirect = authRedirectTarget({ redirect: searchParams.get('redirect'), invite: searchParams.get('invite') })
  const target = redirect || '/groups'
  // Carry the redirect through to signup so a new user doesn't lose the invite.
  const signupTo = redirect ? `/signup?redirect=${encodeURIComponent(redirect)}` : '/signup'

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
          <h2>Sign in</h2>
        </div>
        {message && (
          <div style={{ color: 'var(--ok)', fontSize: 14, background: 'rgba(15,110,86,0.08)', border: '1px solid rgba(15,110,86,0.25)', borderRadius: 8, padding: '12px 14px', lineHeight: 1.5 }}>
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
              <Link to="/forgot-password" style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>
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
                style={{ position: 'absolute', top: 0, right: 0, height: '100%', width: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--slate)' }}
              >
                <Icon name={showPassword ? 'eye-off' : 'eye'} size={18} />
              </button>
            </div>
          </div>
          {error && <p className="error-msg">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Signing in' : 'Sign in'}
          </button>
        </form>
        <div style={{ textAlign: 'center', marginTop: 4 }}>
          <p style={{ fontSize: 14, color: 'var(--slate)', margin: '0 0 10px' }}>New to Trip Clubhouse?</p>
          <Link
            to={signupTo}
            className="btn btn-secondary"
            style={{ textDecoration: 'none' }}
          >
            Create an account
          </Link>
        </div>
      </div>
    </div>
  )
}
