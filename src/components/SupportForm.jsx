import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { HOME_CARD, HOME_CARD_HEADER, HOME_CARD_LABEL } from './homeCardTokens'

// Shared feedback/support form. Writes one row to `support_requests`; user_id and
// trip_id are captured automatically (never re-entered). Opened two ways:
//   • Menu → Support   — full page, wrapped in the HOME_CARD shell (framed).
//   • Floating button  — modal (unframed; the modal supplies its own navy header).
// Both entry points share these exact internals so they read as one component.
const CATEGORIES = [
  { value: 'bug', label: 'Bug', icon: 'bug' },
  { value: 'feature_request', label: 'Feature Request', icon: 'bulb' },
  { value: 'question', label: 'Question', icon: 'question' },
  { value: 'other', label: 'Other', icon: 'dots' },
]

// Inline stroke icons matching the Stats icon spec (viewBox 24, stroke currentColor,
// fill none, ~1.7 stroke-width, round caps/joins). `dots` is the one exception —
// three filled dots read better than three hollow rings.
function CatIcon({ name }) {
  const base = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (name === 'bug') return (
    <svg {...base}><rect x="8" y="8" width="8" height="10" rx="4" /><path d="M9 4.2l1.6 2.6M15 4.2l-1.6 2.6M12 8.2v9.6" /><path d="M8 11l-3.6-1M8 14H4.2M8 17l-3.6 1" /><path d="M16 11l3.6-1M16 14h3.8M16 17l3.6 1" /></svg>
  )
  if (name === 'bulb') return (
    <svg {...base}><path d="M12 3a6 6 0 0 0-3.8 10.6c.7.6 1.1 1.3 1.1 2.1V16h5.4v-.3c0-.8.4-1.5 1.1-2.1A6 6 0 0 0 12 3z" /><path d="M9.5 19h5M10.4 21.3h3.2" /></svg>
  )
  if (name === 'question') return (
    <svg {...base}><circle cx="12" cy="12" r="9" /><path d="M9.4 9.4a2.7 2.7 0 0 1 5.2 1c0 1.8-2.6 2.3-2.6 3.9" /><path d="M12 17.4v.01" /></svg>
  )
  // three dots
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="6" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="18" cy="12" r="1.7" /></svg>
  )
}

const styles = {
  intro: { fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5, marginBottom: 16 },
  label: { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--slate)', margin: '0 0 8px' },
  field: { marginBottom: 18 },
  pillRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 },
  pill: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: 7, padding: '12px 4px', borderRadius: 12, cursor: 'pointer', background: '#fff', border: '1.5px solid var(--hairline)', color: 'var(--slate)', fontFamily: 'inherit', textAlign: 'center', transition: 'background .12s, border-color .12s, color .12s' },
  pillSel: { background: 'var(--accent-bg)', border: '1.5px solid var(--navy)', color: 'var(--navy)' },
  pillLabel: { fontSize: 11, fontWeight: 700, lineHeight: 1.2 },
  textarea: { width: '100%', boxSizing: 'border-box', minHeight: 124, resize: 'vertical', lineHeight: 1.45, border: '1px solid var(--hairline)', borderRadius: 14, padding: '12px 14px', fontSize: 14, color: 'var(--ink)', fontFamily: 'inherit', background: '#fff' },
  error: { color: '#C0392B', fontSize: 13, marginBottom: 12 },
  sendBase: { width: '100%', borderRadius: 14, padding: '13px 16px', fontSize: 15, fontWeight: 800, fontFamily: 'inherit', border: 'none', color: '#fff', background: 'var(--navy)' },
  doneWrap: { textAlign: 'center', padding: '8px 0' },
  doneCheck: { width: 48, height: 48, borderRadius: '50%', background: 'rgba(15,110,86,0.12)', color: '#0F6E56', fontSize: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' },
  doneText: { fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 },
  doneSub: { fontSize: 13, color: 'var(--slate)', marginBottom: 16 },
  doneBtns: { display: 'flex', gap: 8 },
}

// On the full page the fields sit inside the shared HOME_CARD shell with a navy
// "SHARE FEEDBACK" header; in the modal they render bare (the modal has its own
// navy header, so a second one would double up).
function Frame({ framed, children }) {
  if (!framed) return children
  return (
    <div style={{ ...HOME_CARD, marginBottom: 0 }}>
      <div style={HOME_CARD_HEADER}><span style={HOME_CARD_LABEL}>Share Feedback</span></div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  )
}

export default function SupportForm({ tripId, userId, defaultCategory = 'bug', intro, onDone, framed = false }) {
  const [category, setCategory] = useState(defaultCategory)
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('idle') // idle | saving | done | error
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    const body = message.trim()
    if (!body) return
    setStatus('saving'); setError(null)
    // Capture the submitter's contact info so a plain read of the table shows who
    // wrote in (no profile join needed). Sourced from the current auth session:
    // email from auth, name from the display_name we keep on user metadata (see
    // ProfilePage), falling back to the profiles table, then the email local part.
    const { data: { user } = {} } = await supabase.auth.getUser()
    const email = user?.email ?? null
    let name = user?.user_metadata?.display_name || null
    if (!name && user?.id) {
      const { data: prof } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
      name = prof?.display_name || null
    }
    if (!name && email) name = email.split('@')[0]
    const { error: err } = await supabase.from('support_requests').insert({
      trip_id: tripId ?? null,
      user_id: userId ?? null,
      email,
      name,
      category,
      message: body,
    })
    if (err) { setStatus('error'); setError(err.message || 'Could not send — please try again.'); return }
    setMessage('')
    setStatus('done')
  }

  if (status === 'done') {
    return (
      <Frame framed={framed}>
        <div style={styles.doneWrap}>
          <div style={styles.doneCheck}>✓</div>
          <div style={styles.doneText}>Thanks — we got it!</div>
          <div style={styles.doneSub}>Your feedback has been sent.</div>
          <div style={styles.doneBtns}>
            <button type="button" className="btn btn-outline" onClick={() => setStatus('idle')}>Send another</button>
            {onDone && <button type="button" className="btn btn-primary" onClick={onDone}>Done</button>}
          </div>
        </div>
      </Frame>
    )
  }

  const canSend = !!message.trim() && status !== 'saving'

  return (
    <Frame framed={framed}>
      <form onSubmit={submit}>
        {intro && <div style={styles.intro}>{intro}</div>}

        <div style={styles.field}>
          <div style={styles.label}>Category</div>
          <div style={styles.pillRow} role="radiogroup" aria-label="Category">
            {CATEGORIES.map(c => {
              const selected = category === c.value
              return (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setCategory(c.value)}
                  style={{ ...styles.pill, ...(selected ? styles.pillSel : null) }}
                >
                  <CatIcon name={c.icon} />
                  <span style={styles.pillLabel}>{c.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div style={styles.field}>
          <div style={styles.label}>Message</div>
          <textarea
            className="sf-textarea"
            style={styles.textarea}
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Tell us what's on your mind…"
            required
          />
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <button
          type="submit"
          disabled={!canSend}
          style={{ ...styles.sendBase, opacity: canSend ? 1 : 0.4, cursor: canSend ? 'pointer' : 'not-allowed' }}
        >
          {status === 'saving' ? 'Sending…' : 'Send'}
        </button>
      </form>
    </Frame>
  )
}
