import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Carry an invite redirect (e.g. /join/:token) through to signup so a new user
  // who needs an account doesn't lose the invite context.
  const redirect = searchParams.get('redirect')
  const signupTo = redirect && redirect.startsWith('/')
    ? `/signup?redirect=${encodeURIComponent(redirect)}`
    : '/signup'

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      // Honor ?redirect= (e.g. from an invite link), but only allow internal paths.
      navigate(redirect && redirect.startsWith('/') ? redirect : '/groups', { replace: true })
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div>
          <p className="auth-brand">Trip Clubhouse</p>
          <h2>Sign In</h2>
        </div>
        <form className="auth-form" onSubmit={handleLogin}>
          <div>
            <label className="field-label">Email</label>
            <input type="email" placeholder="you@example.com" value={email}
              onChange={e => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="field-label">Password</label>
            <input type="password" placeholder="••••••••" value={password}
              onChange={e => setPassword(e.target.value)} required />
          </div>
          {error && <p className="error-msg">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
        <p style={{ textAlign: 'center', fontSize: 14, color: '#6b7280' }}>
          No account?{' '}
          <Link to={signupTo} style={{ color: '#3b82f6', fontWeight: 600 }}>Create one</Link>
        </p>
      </div>
    </div>
  )
}
