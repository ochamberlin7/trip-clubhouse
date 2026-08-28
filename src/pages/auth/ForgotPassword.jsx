import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Link } from 'react-router-dom'

// Request-a-reset page. Submitting emails a Supabase recovery link that lands on
// /reset-password. We always show the SAME generic confirmation whether or not the
// email matched an account — Supabase itself returns success for unknown emails, so
// this never reveals whether a given address is registered (enumeration safety).
export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    // redirectTo uses the current origin so it matches whatever domain the app is
    // served from (localhost while testing, the production domain in prod). This
    // exact URL must be on the Supabase project's allowed Redirect URLs.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    // Only a genuine transport/rate-limit failure surfaces — a non-existent email
    // is NOT an error from Supabase, so account status is never revealed.
    if (error) { setError(error.message); return }
    setSent(true)
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div>
          <p className="auth-brand">Trip Clubhouse</p>
          <h2>Reset Password</h2>
        </div>

        {sent ? (
          <>
            <div style={successBox}>
              If an account exists for that email, a reset link has been sent. Check your inbox (and spam).
            </div>
            <Link to="/login" className="btn btn-primary" style={{ textAlign: 'center', textDecoration: 'none' }}>
              Back to Sign In
            </Link>
          </>
        ) : (
          <>
            <p style={{ fontSize: 14, color: '#6b7280', margin: 0, lineHeight: 1.5 }}>
              Enter your account email and we’ll send you a link to set a new password.
            </p>
            <form className="auth-form" onSubmit={handleSubmit}>
              <div>
                <label className="field-label">Email</label>
                <input type="email" placeholder="you@example.com" value={email}
                  onChange={e => setEmail(e.target.value)} required />
              </div>
              {error && <p className="error-msg">{error}</p>}
              <button type="submit" className="btn btn-primary" disabled={loading || !email.trim()}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
            <p style={{ textAlign: 'center', fontSize: 14, color: '#6b7280' }}>
              Remembered it? <Link to="/login" style={{ color: '#3b82f6', fontWeight: 600 }}>Sign In</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}

const successBox = {
  color: '#0F6E56', fontSize: 14, background: 'rgba(15,110,86,0.08)',
  border: '1px solid rgba(15,110,86,0.25)', borderRadius: 8, padding: '12px 14px', lineHeight: 1.5,
}
