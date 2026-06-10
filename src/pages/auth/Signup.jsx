import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Link, useNavigate } from 'react-router-dom'

export default function Signup() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSignup(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } }
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      navigate('/groups')
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
          <div>
            <label className="field-label">Your Name</label>
            <input type="text" placeholder="First Last" value={displayName}
              onChange={e => setDisplayName(e.target.value)} required />
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
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>
        <p style={{ textAlign: 'center', fontSize: 14, color: '#6b7280' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: '#3b82f6', fontWeight: 600 }}>Sign In</Link>
        </p>
      </div>
    </div>
  )
}
