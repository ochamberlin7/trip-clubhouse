import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// Trash Talk Thread — trip chat for the dashboard home tab.
//
// iOS keyboard stability: the card shell (header / message area / input row) is
// rendered once and never conditionally removed. Only the message list contents
// re-render when `messages` changes, so the <input> element is never unmounted
// and the soft keyboard stays open when new messages arrive.

const styles = {
  card: { background: '#FFFFFF', border: '1px solid #DDE3EA', borderRadius: '10px', overflow: 'hidden', marginBottom: '10px' },
  header: { background: '#1B3F6E', padding: '10px 14px' },
  headerText: { fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: '#fff' },
  area: { padding: '12px', maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' },
  msgRow: { display: 'flex', flexDirection: 'column', gap: '2px' },
  meta: { fontSize: '10px', color: '#7A8FA6', padding: '0 4px' },
  senderName: { fontWeight: 700, color: '#1B3F6E' },
  bubble: { maxWidth: '75%', padding: '7px 10px', fontSize: '13px', lineHeight: 1.4, wordBreak: 'break-word' },
  bubbleMine: { background: '#1B3F6E', color: '#fff', borderRadius: '12px 12px 2px 12px' },
  bubbleOther: { background: '#E8EDF3', color: '#0D1B2A', borderRadius: '12px 12px 12px 2px' },
  empty: { textAlign: 'center', color: '#7A8FA6', fontSize: '13px', padding: '20px 0', fontStyle: 'italic' },
  error: { color: '#C0392B', fontSize: '11px', padding: '6px 14px 0', textAlign: 'center' },
  inputRow: { display: 'flex', gap: '8px', padding: '10px 12px', borderTop: '1px solid #DDE3EA', background: '#FFFFFF' },
  input: { flex: 1, background: '#E8EDF3', border: '1px solid #DDE3EA', borderRadius: '20px', padding: '8px 14px', fontSize: '16px', color: '#0D1B2A', outline: 'none', fontFamily: 'inherit' },
  sendBtn: { width: '38px', height: '38px', borderRadius: '50%', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default function ChatWidget({ tripId, currentUserId, currentUserName }) {
  const [messages, setMessages] = useState([])
  const [nameMap, setNameMap] = useState({}) // user_id -> profiles.display_name
  const [text, setText] = useState('')
  const [pressed, setPressed] = useState(false)
  const [sendError, setSendError] = useState(null)
  const areaRef = useRef(null)
  const nameMapRef = useRef({})
  const mountedRef = useRef(true)

  useEffect(() => () => { mountedRef.current = false }, [])

  // Resolve sender display names from profiles by user_id — the authoritative
  // source — rather than each message's stored sender_name (which can be stale
  // or a role like "Member"/"Player" captured on another device). Fetches only
  // the ids we don't already have.
  async function fetchNames(ids) {
    const missing = [...new Set(ids)].filter(id => id && !nameMapRef.current[id])
    if (!missing.length) return
    const { data } = await supabase.from('profiles').select('id, display_name').in('id', missing)
    if (!data || !data.length || !mountedRef.current) return
    const merged = { ...nameMapRef.current }
    data.forEach(p => { if (p.display_name) merged[p.id] = p.display_name })
    nameMapRef.current = merged
    setNameMap(merged)
  }

  // Load history + subscribe to realtime inserts.
  useEffect(() => {
    let cancelled = false
    let channel

    async function init() {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: true })
        .limit(100)

      if (!cancelled && data) {
        setMessages(data)
        fetchNames(data.map(m => m.user_id))
      }

      channel = supabase
        .channel(`messages:${tripId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `trip_id=eq.${tripId}`,
        }, payload => {
          const incoming = payload.new
          fetchNames([incoming.user_id])
          setMessages(prev => {
            // Skip if we already have it (e.g. from the insert response).
            if (prev.some(m => m.id === incoming.id)) return prev
            // Replace a matching optimistic message from this user, if present.
            const optIdx = prev.findIndex(m =>
              m._optimistic && m.user_id === incoming.user_id && m.content === incoming.content
            )
            if (optIdx !== -1) {
              const next = prev.slice()
              next[optIdx] = incoming
              return next
            }
            return [...prev, incoming]
          })
        })
        .subscribe()
    }

    init()
    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [tripId])

  // Scroll to bottom whenever the message list changes.
  useEffect(() => {
    const el = areaRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  async function handleSend() {
    const content = text.trim()
    if (!content) return

    setText('') // clear immediately
    setSendError(null)

    const optimistic = {
      id: 'opt_' + Date.now(),
      trip_id: tripId,
      user_id: currentUserId,
      sender_name: currentUserName,
      content,
      created_at: new Date().toISOString(),
      _optimistic: true,
    }
    setMessages(prev => [...prev, optimistic])

    const { data, error } = await supabase
      .from('messages')
      .insert({ trip_id: tripId, user_id: currentUserId, sender_name: currentUserName, content })
      .select()
      .single()

    if (error) {
      // Roll back the optimistic message and surface why it failed.
      setMessages(prev => prev.filter(m => m.id !== optimistic.id))
      setText(content) // restore the text so it isn't lost
      setSendError(error.message || 'Message failed to send')
      // eslint-disable-next-line no-console
      console.error('[ChatWidget] insert failed:', error)
      return
    }

    // Replace the optimistic message with the real row (if realtime hasn't already).
    setMessages(prev => {
      if (prev.some(m => m.id === data.id)) {
        return prev.filter(m => m.id !== optimistic.id)
      }
      return prev.map(m => (m.id === optimistic.id ? data : m))
    })
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <span style={styles.headerText}>Trash Talk Thread</span>
      </div>

      <div style={styles.area} ref={areaRef}>
        {messages.length === 0 ? (
          <div style={styles.empty}>No messages yet — start the trash talk.</div>
        ) : (
          messages.map(m => {
            const mine = m.user_id === currentUserId
            // Always resolve the name from profiles by user_id; fall back to the
            // stored sender_name only until the profile lookup lands.
            const resolved = nameMap[m.user_id] || m.sender_name || 'Player'
            const firstName = resolved.split(' ')[0] || resolved
            return (
              <div
                key={m.id}
                style={{ ...styles.msgRow, alignItems: mine ? 'flex-end' : 'flex-start' }}
              >
                <div style={{ ...styles.meta, textAlign: mine ? 'right' : 'left' }}>
                  {!mine && <span style={styles.senderName}>{firstName} </span>}
                  {fmtTime(m.created_at)}
                </div>
                {/* React escapes text children, so message content is rendered safely. */}
                <div style={{ ...styles.bubble, ...(mine ? styles.bubbleMine : styles.bubbleOther) }}>
                  {m.content}
                </div>
              </div>
            )
          })
        )}
      </div>

      {sendError && <div style={styles.error}>Couldn’t send: {sendError}</div>}

      <div style={styles.inputRow}>
        <input
          type="text"
          style={styles.input}
          placeholder="Say something…"
          value={text}
          maxLength={300}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={e => { e.target.style.borderColor = '#1B3F6E' }}
          onBlur={e => { e.target.style.borderColor = '#DDE3EA' }}
        />
        <button
          type="button"
          aria-label="Send message"
          style={{ ...styles.sendBtn, background: pressed ? '#163560' : '#1B3F6E' }}
          onMouseDown={() => setPressed(true)}
          onMouseUp={() => setPressed(false)}
          onMouseLeave={() => setPressed(false)}
          onTouchStart={() => setPressed(true)}
          onTouchEnd={() => setPressed(false)}
          onClick={handleSend}
        >
          <SendIcon />
        </button>
      </div>
    </div>
  )
}
