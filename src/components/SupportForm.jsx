import { useState } from 'react'
import { supabase } from '../lib/supabase'

// Shared feedback/support form. Writes one row to `support_requests`; user_id and
// trip_id are captured automatically (never re-entered). Opened two ways:
//   • Menu → Support   — no defaultCategory (full support: bugs/questions/etc.)
//   • Floating button  — defaultCategory="feature_request" + lighter copy.
const CATEGORIES = [
  { value: 'bug', label: 'Bug' },
  { value: 'feature_request', label: 'Feature Request' },
  { value: 'question', label: 'Question' },
  { value: 'other', label: 'Other' },
]

const styles = {
  intro: { fontSize: '13px', color: '#2C3E50', lineHeight: 1.5, marginBottom: '14px' },
  field: { marginBottom: '12px' },
  textarea: { minHeight: '120px', resize: 'vertical', lineHeight: 1.4 },
  error: { color: '#C0392B', fontSize: '13px', marginBottom: '10px' },
  doneWrap: { textAlign: 'center', padding: '8px 0' },
  doneCheck: { width: 48, height: 48, borderRadius: '50%', background: 'rgba(15,110,86,0.12)', color: '#0F6E56', fontSize: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' },
  doneText: { fontSize: '15px', fontWeight: 700, color: '#0D1B2A', marginBottom: '4px' },
  doneSub: { fontSize: '13px', color: '#7A8FA6', marginBottom: '16px' },
  doneBtns: { display: 'flex', gap: '8px' },
}

export default function SupportForm({ tripId, userId, defaultCategory = 'bug', intro, onDone }) {
  const [category, setCategory] = useState(defaultCategory)
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('idle') // idle | saving | done | error
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    const body = message.trim()
    if (!body) return
    setStatus('saving'); setError(null)
    const { error: err } = await supabase.from('support_requests').insert({
      trip_id: tripId ?? null,
      user_id: userId ?? null,
      category,
      message: body,
    })
    if (err) { setStatus('error'); setError(err.message || 'Could not send — please try again.'); return }
    setMessage('')
    setStatus('done')
  }

  if (status === 'done') {
    return (
      <div style={styles.doneWrap}>
        <div style={styles.doneCheck}>✓</div>
        <div style={styles.doneText}>Thanks — we got it!</div>
        <div style={styles.doneSub}>Your feedback has been sent.</div>
        <div style={styles.doneBtns}>
          <button type="button" className="btn btn-outline" onClick={() => setStatus('idle')}>Send another</button>
          {onDone && <button type="button" className="btn btn-primary" onClick={onDone}>Done</button>}
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit}>
      {intro && <div style={styles.intro}>{intro}</div>}
      <div style={styles.field}>
        <label className="field-label">Category</label>
        <select value={category} onChange={e => setCategory(e.target.value)}>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
      <div style={styles.field}>
        <label className="field-label">Message</label>
        <textarea
          style={styles.textarea}
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Tell us what's on your mind…"
          required
        />
      </div>
      {error && <div style={styles.error}>{error}</div>}
      <button type="submit" className="btn btn-primary" disabled={status === 'saving' || !message.trim()}>
        {status === 'saving' ? 'Sending…' : 'Send'}
      </button>
    </form>
  )
}
