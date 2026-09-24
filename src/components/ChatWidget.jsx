import { Fragment, useEffect, useRef, useState } from 'react'
import { supabase, uniqueChannelName } from '../lib/supabase'
import { useResumeRefetch } from '../lib/useResumeRefetch'
import { HOME_CARD, HOME_CARD_HEADER, HOME_CARD_LABEL } from './homeCardTokens'
import { isPushSupported, pushPermission, enablePush, markChatRead } from '../lib/push'

// Trash Talk Thread — trip chat for the dashboard home tab.
//
// iOS keyboard stability: the card shell (header / message area / input row) is
// rendered once and never conditionally removed. Only the message list contents
// re-render when `messages` changes, so the <input> element is never unmounted
// and the soft keyboard stays open when new messages arrive.

// Fixed overall widget height: the card never grows. The message area (flex:1)
// gives up its space as the composer grows, so bubbles scroll up and out of view
// rather than the widget getting taller. COMPOSER_MIN is one row; COMPOSER_MAX is
// the tallest the composer can get before it would reach the header — beyond it
// the textarea scrolls internally instead of growing.
const CARD_HEIGHT = 360
const COMPOSER_MIN = 36
const COMPOSER_MAX = 290

const styles = {
  // position/z-index so the widget (esp. its send button) sits ABOVE the floating
  // feedback FAB (.feedback-fab, z-index 201) where they overlap near the bottom of
  // the Home screen — the FAB stays clickable everywhere outside the widget.
  card: { ...HOME_CARD, height: CARD_HEIGHT, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 202 },
  header: { ...HOME_CARD_HEADER, justifyContent: 'flex-start', flexShrink: 0 },
  headerText: { ...HOME_CARD_LABEL },
  area: { padding: '12px', flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' },
  msgRow: { display: 'flex', flexDirection: 'column', gap: '2px' },
  meta: { fontSize: '10px', color: '#7A8FA6', padding: '0 4px' },
  senderName: { fontWeight: 700, color: '#1B3F6E' },
  bubble: { maxWidth: '75%', padding: '7px 10px', fontSize: '13px', lineHeight: 1.4, wordBreak: 'break-word' },
  bubbleMine: { background: '#4472A8', color: '#fff', borderRadius: '12px 12px 2px 12px' },
  bubbleOther: { background: '#E8EDF3', color: '#0F1E33', borderRadius: '12px 12px 12px 2px' },
  empty: { textAlign: 'center', color: '#7A8FA6', fontSize: '13px', padding: '20px 0', fontStyle: 'italic' },
  divider: { alignSelf: 'center', color: '#9AA7B4', fontSize: '10px', letterSpacing: '0.3px', padding: '6px 0 2px', textAlign: 'center' },
  error: { color: '#C0392B', fontSize: '11px', padding: '6px 14px 0', textAlign: 'center' },
  inputRow: { display: 'flex', gap: '8px', padding: '10px 12px', borderTop: '1px solid #DDE3EA', background: '#FFFFFF', flexShrink: 0, alignItems: 'flex-end' },
  input: { flex: 1, background: '#E8EDF3', border: '1px solid #DDE3EA', borderRadius: '20px', padding: '8px 14px', fontSize: '16px', lineHeight: '20px', color: '#0D1B2A', outline: 'none', fontFamily: 'inherit', resize: 'none', overflowY: 'hidden', maxHeight: COMPOSER_MAX, boxSizing: 'border-box', display: 'block' },
  sendBtn: { width: '38px', height: '38px', borderRadius: '50%', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  pushPrompt: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#EAF1F8', borderBottom: '1px solid #DDE3EA', flexShrink: 0 },
  pushText: { fontSize: 12, color: '#2C3E50', flex: 1, lineHeight: 1.35 },
  pushEnable: { background: '#1B3F6E', color: '#fff', border: 'none', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 },
  pushDismiss: { background: 'none', border: 'none', color: '#7A8FA6', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, padding: '5px 2px' },
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

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
function isSameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime()
}
// iMessage-style day divider. Within the last 7 days → weekday name in a light
// font (Monday, Tuesday…); anything older → the date as m/dd/yyyy.
function dividerInfo(ts) {
  const d = new Date(ts)
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000)
  if (diffDays < 7) return { label: d.toLocaleDateString('en-US', { weekday: 'long' }), recent: true }
  return { label: d.toLocaleDateString('en-US', { month: 'numeric', day: '2-digit', year: 'numeric' }), recent: false }
}

export default function ChatWidget({ tripId, currentUserId, currentUserName }) {
  const [messages, setMessages] = useState([])
  const [nameMap, setNameMap] = useState({}) // user_id -> profiles.display_name (fallback)
  const [ptNames, setPtNames] = useState({}) // user_id -> Players & Teams name (authoritative)
  const [text, setText] = useState('')
  const [pressed, setPressed] = useState(false)
  const [sendError, setSendError] = useState(null)
  const [showPushPrompt, setShowPushPrompt] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const areaRef = useRef(null)
  const taRef = useRef(null)
  const nameMapRef = useRef({})
  const ptNamesRef = useRef({})
  const mountedRef = useRef(true)

  useEffect(() => () => { mountedRef.current = false }, [])

  // Opening the thread marks it read (clears the unread badge from real state,
  // not just iOS's foreground auto-clear). Also decide the contextual push
  // prompt: only on a RETURN visit (never first), and only when push is actually
  // supported, permission hasn't been decided, and it wasn't dismissed before —
  // no immediate auto-prompt.
  useEffect(() => {
    if (currentUserId && tripId) markChatRead(currentUserId, tripId)
    try {
      const seen = localStorage.getItem('tc_chat_seen')
      if (!seen) { localStorage.setItem('tc_chat_seen', '1'); return }
      const dismissed = localStorage.getItem('tc_push_prompt_dismissed')
      if (isPushSupported() && pushPermission() === 'default' && !dismissed) setShowPushPrompt(true)
    } catch { /* localStorage unavailable */ }
  }, [currentUserId, tripId])

  async function handleEnablePush() {
    setPushBusy(true)
    const res = await enablePush(currentUserId)
    setPushBusy(false)
    setShowPushPrompt(false)
    // If they declined at the OS level, don't nag again.
    if (!res.ok && (res.reason === 'denied' || res.reason === 'default')) {
      try { localStorage.setItem('tc_push_prompt_dismissed', '1') } catch { /* ignore */ }
    }
  }
  function dismissPushPrompt() {
    setShowPushPrompt(false)
    try { localStorage.setItem('tc_push_prompt_dismissed', '1') } catch { /* ignore */ }
  }

  // Auto-grow the composer like iMessage: reset to measure, then set height to fit
  // the content up to COMPOSER_MAX. Past that the textarea scrolls internally
  // (overflow auto) so the newest lines stay visible while the top scrolls away.
  // The message list is kept pinned to the bottom as the composer eats its space.
  function autoGrow() {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    const next = Math.min(el.scrollHeight, COMPOSER_MAX)
    el.style.height = next + 'px'
    el.style.overflowY = el.scrollHeight > COMPOSER_MAX ? 'auto' : 'hidden'
    const area = areaRef.current
    if (area) area.scrollTop = area.scrollHeight
  }

  function resetComposerHeight() {
    const el = taRef.current
    if (!el) return
    el.style.height = COMPOSER_MIN + 'px'
    el.style.overflowY = 'hidden'
  }

  // Start at a single row.
  useEffect(() => { resetComposerHeight() }, [])

  // Authoritative sender names come from the trip's Players & Teams roster
  // (trip_players: first/last name, or guest_name), NOT the user's profile — a
  // player is shown here by whatever the commissioner entered on that tab. Keyed
  // by both user_id and claimed_user_id (a user who claimed a guest slot), and
  // kept live so a rename on that tab reflects here. profiles.display_name stays
  // only as a fallback for anyone with no name entered on the roster.
  useEffect(() => {
    let cancelled = false
    let channel

    async function loadRoster() {
      const { data } = await supabase
        .from('trip_players')
        .select('user_id, claimed_user_id, first_name, last_name, guest_name')
        .eq('trip_id', tripId)
      if (cancelled || !data) return
      const map = {}
      data.forEach(tp => {
        const nm = [tp.first_name, tp.last_name].filter(Boolean).join(' ').trim() || (tp.guest_name || '').trim()
        if (!nm) return
        if (tp.user_id) map[tp.user_id] = nm
        if (tp.claimed_user_id) map[tp.claimed_user_id] = nm
      })
      ptNamesRef.current = map
      setPtNames(map)
    }

    loadRoster()
    channel = supabase
      .channel(uniqueChannelName(`chat-roster:${tripId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_players', filter: `trip_id=eq.${tripId}` }, loadRoster)
      .subscribe()

    return () => { cancelled = true; if (channel) supabase.removeChannel(channel) }
  }, [tripId])

  // Fallback names from profiles by user_id, used only when the roster has no name
  // entered for that player. Fetches only the ids we don't already have.
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
        .channel(uniqueChannelName(`messages:${tripId}`))
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

  // Background→foreground resume: when the OS suspends the PWA the realtime socket
  // can stall silently (no CLOSED event), so messages that arrive while
  // backgrounded are missed until a full relaunch remounts this widget. Refetch
  // history on resume — the same catch-up a relaunch does — so the thread updates
  // without a restart. (Matches the app-wide useResumeRefetch pattern.)
  useResumeRefetch(async () => {
    if (!tripId) return
    const { data } = await supabase
      .from('messages').select('*').eq('trip_id', tripId)
      .order('created_at', { ascending: true }).limit(100)
    if (data && mountedRef.current) {
      setMessages(data)
      fetchNames(data.map(m => m.user_id))
    }
  })

  // Scroll to bottom whenever the message list changes.
  useEffect(() => {
    const el = areaRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  // While the user is actually looking at the thread, keep it marked read so the
  // badge stays cleared as new messages land (drives off real "viewing" state).
  useEffect(() => {
    if (messages.length && typeof document !== 'undefined' && document.visibilityState === 'visible') {
      markChatRead(currentUserId, tripId)
    }
  }, [messages.length]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSend() {
    const content = text.trim()
    if (!content) return

    setText('') // clear immediately
    resetComposerHeight() // shrink the composer back to one row
    setSendError(null)

    // Store my roster (Players & Teams) name as the sender_name so it's the
    // fallback others see; profile-based currentUserName only if I'm not on the roster.
    const myName = ptNames[currentUserId] || currentUserName || 'Player'

    const optimistic = {
      id: 'opt_' + Date.now(),
      trip_id: tripId,
      user_id: currentUserId,
      sender_name: myName,
      content,
      created_at: new Date().toISOString(),
      _optimistic: true,
    }
    setMessages(prev => [...prev, optimistic])

    const { data, error } = await supabase
      .from('messages')
      .insert({ trip_id: tripId, user_id: currentUserId, sender_name: myName, content })
      .select()
      .single()

    if (error) {
      // Roll back the optimistic message and surface why it failed.
      setMessages(prev => prev.filter(m => m.id !== optimistic.id))
      setText(content) // restore the text so it isn't lost
      requestAnimationFrame(autoGrow) // regrow the composer to fit the restored text
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

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <span style={styles.headerText}>Trash Talk Thread</span>
      </div>

      {showPushPrompt && (
        <div style={styles.pushPrompt}>
          <span style={styles.pushText}>🔔 Get a notification when someone posts here.</span>
          <button type="button" style={styles.pushEnable} onClick={handleEnablePush} disabled={pushBusy}>
            {pushBusy ? '…' : 'Turn on'}
          </button>
          <button type="button" style={styles.pushDismiss} onClick={dismissPushPrompt}>Not now</button>
        </div>
      )}

      <div style={styles.area} ref={areaRef}>
        {messages.length === 0 ? (
          <div style={styles.empty}>No messages yet — start the trash talk.</div>
        ) : (
          messages.map((m, i) => {
            const mine = m.user_id === currentUserId
            // Roster (Players & Teams) name first; profile only as a fallback when
            // none is set there; stored sender_name until either lookup lands.
            const resolved = ptNames[m.user_id] || nameMap[m.user_id] || m.sender_name || 'Player'
            const firstName = resolved.split(' ')[0] || resolved
            // Insert a centered day divider whenever the day changes from the
            // previous message. The first message (no previous) never gets one.
            const prev = messages[i - 1]
            const divider = prev && !isSameDay(new Date(prev.created_at), new Date(m.created_at))
              ? dividerInfo(m.created_at)
              : null
            return (
              <Fragment key={m.id}>
                {divider && (
                  <div style={{ ...styles.divider, fontWeight: divider.recent ? 400 : 600 }}>
                    {divider.label}
                  </div>
                )}
                <div style={{ ...styles.msgRow, alignItems: mine ? 'flex-end' : 'flex-start' }}>
                  <div style={{ ...styles.meta, textAlign: mine ? 'right' : 'left' }}>
                    {!mine && <span style={styles.senderName}>{firstName} </span>}
                    {fmtTime(m.created_at)}
                  </div>
                  {/* React escapes text children, so message content is rendered safely. */}
                  <div style={{ ...styles.bubble, ...(mine ? styles.bubbleMine : styles.bubbleOther) }}>
                    {m.content}
                  </div>
                </div>
              </Fragment>
            )
          })
        )}
      </div>

      {sendError && <div style={styles.error}>Couldn’t send: {sendError}</div>}

      <div style={styles.inputRow}>
        <textarea
          ref={taRef}
          rows={1}
          style={styles.input}
          placeholder="Say something…"
          value={text}
          maxLength={300}
          // Return inserts a newline (native textarea behaviour); the message only
          // sends via the blue send button. No keyboard send shortcut.
          onChange={e => { setText(e.target.value); autoGrow() }}
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
