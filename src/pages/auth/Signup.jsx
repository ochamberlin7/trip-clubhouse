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
    <div className="auth-container">
      <h1>Trip Clubhouse</h1>
      <h2>Create Account</h2>
      <form onSubmit={handleSignup}>
        <input type="text" placeholder="Display Name" value={displayName}
          onChange={e => setDisplayName(e.target.value)} required />
        <input type="email" placeholder="Email" value={email}
          onChange={e => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password (min 6 chars)" value={password}
          onChange={e => setPassword(e.target.value)} required minLength={6} />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Creating account...' : 'Create Account'}
        </button>
      </form>
      <p>Already have an account? <Link to="/login">Sign In</Link></p>
    </div>
  )
}
