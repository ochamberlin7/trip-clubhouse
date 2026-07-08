import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

// Display-only formatter: a 10-digit number becomes (xxx) xxx-xxxx; anything else
// (e.g. an international number) is left untouched. The submitted value is always
// raw digits regardless of this.
function formatPhone(raw) {
  const d = (raw || '').replace(/\D/g, '')
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  return raw
}

export default function Signup() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, loading: authLoading } = useAuth()

  // Preserve an invite redirect (e.g. /join/:token) for the post-signup landing
  // and the "Sign In" link, so the invite context survives.
  const redirect = searchParams.get('redirect')
  const safeRedirect = redirect && redirect.startsWith('/') ? redirect : null
  const target = safeRedirect || '/groups'
  const loginTo = safeRedirect ? `/login?redirect=${encodeURIComponent(safeRedirect)}` : '/login'

  // Navigate only once auth is confirmed in context — so we land back on
  // /join/:token with `user` already set (JoinTrip won't bounce to login). Also
  // redirects an already-signed-in visitor away from signup.
  useEffect(() => {
    if (!authLoading && user) navigate(target, { replace: true })
  }, [user, authLoading, target, navigate])

  async function handleSignup(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    // Store the combined name so downstream (invite matching, profiles) is unchanged.
    const displayName = `${firstName.trim()} ${lastName.trim()}`.trim()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      // phone is carried in user_metadata so JoinTrip can store it on the profile
      // and use it to match the invitee against the trip's guest list. Stored as
      // raw digits (any display formatting is stripped) for consistent matching.
      options: { data: { display_name: displayName, phone: phone.replace(/\D/g, '') } }
    })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    // Auto-confirm → a session exists now; the effect above navigates to `target`
    // once `user` updates. If email confirmation is required, no session is
    // returned, so surface that instead of silently hanging.
    if (!data.session) {
      setError('Account created — check your email to confirm, then sign in.')
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div>
          <p className="auth-brand">Trip Clubhouse</p>
          <h2>Create Account</h2>
        </div>
        <form className="auth-form" onSubmit={handleSignup}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label className="field-label">First Name</label>
              <input type="text" placeholder="First" value={firstName}
                onChange={e => setFirstName(e.target.value)} required />
            </div>
            <div style={{ flex: 1 }}>
              <label className="field-label">Last Name</label>
              <input type="text" placeholder="Last" value={lastName}
                onChange={e => setLastName(e.target.value)} required />
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
            <input type="email" placeholder="you@example.com" value={email}
              onChange={e => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="field-label">Password</label>
            <input type="password" placeholder="Min 6 characters" value={password}
              onChange={e => setPassword(e.target.value)} required minLength={6} />
          </div>
          {error && <p className="error-msg">{error}</p>}
          <button type="submit" className="btn btn-primary"
            disabled={loading || !firstName.trim() || !lastName.trim()}>
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>
        <p style={{ textAlign: 'center', fontSize: 14, color: '#6b7280' }}>
          Already have an account?{' '}
          <Link to={loginTo} style={{ color: '#3b82f6', fontWeight: 600 }}>Sign In</Link>
        </p>
      </div>
    </div>
  )
}
