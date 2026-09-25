import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { supabase, uniqueChannelName } from '../lib/supabase'
import { useResumeRefetch } from '../lib/useResumeRefetch'
import { HOME_CARD, HOME_CARD_HEADER, HOME_CARD_LABEL } from './homeCardTokens'
import { isPushSupported, pushPermission, enablePush, markChatRead, isPromptDismissed, markPromptDismissed, hasActiveSubscription } from '../lib/push'

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
  pushPrompt: { display: 'flex', alignItems: 'center', gap: 9, margin: '10px 10px 0', padding: '9px 10px 9px 12px', background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: 12, boxShadow: '0 2px 6px rgba(15,30,51,.06)', flexShrink: 0 },
  pushIcon: { display: 'flex', flexShrink: 0, color: '#1B3F6E' },
  pushText: { fontSize: 12.5, color: '#33455E', flex: 1, lineHeight: 1.3 },
  pushEnable: { background: '#1B3F6E', color: '#fff', border: 'none', borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 },
  pushDismiss: { background: 'none', border: 'none', padding: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0, color: '#94A3B8' },
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

// Stroke icons for the notification prompt — same spec as the Stats page
// (currentColor, viewBox 24, round caps/joins), so colour is set via the parent.
function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}
function DismissXIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
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
  // Bumped on background→resume to re-run the load+subscribe effect below: catches
  // up messages missed while suspended AND rebuilds the stalled realtime channel.
  const [resumeTick, setResumeTick] = useState(0)
  useResumeRefetch(() => setResumeTick(t => t + 1))
  const areaRef = useRef(null)
  const taRef = useRef(null)
  const nameMapRef = useRef({})
  const ptNamesRef = useRef({})
  const mountedRef = useRef(true)

  useEffect(() => () => { mountedRef.current = false }, [])

  // Re-derive whether the "enable notifications" prompt should show. It shows on
  // EVERY open whenever notifications are OFF for this device — i.e. there's no
  // active push subscription (never enabled, OR enabled then turned off) — and it
  // hasn't been dismissed. It keeps showing until the user explicitly taps Turn On
  // (OS flow) or the X. Hidden while a subscription is active, or if the OS
  // permission is hard-denied (Turn On couldn't re-prompt anyway). showPushPrompt
  // is only flipped true AFTER the async checks resolve (never a flash), and runs
  // on mount, tab-return (remount), AND background→resume/focus (useResumeRefetch
  // below) so "chat is visible" drives it — never stale.
  const deriveShowPrompt = useCallback(async () => {
    if (!isPushSupported() || pushPermission() === 'denied') { setShowPushPrompt(false); return }
    const [hasSub, dismissed] = await Promise.all([
      hasActiveSubscription(),
      isPromptDismissed(currentUserId),
    ])
    if (mountedRef.current) setShowPushPrompt(!hasSub && !dismissed)
  }, [currentUserId])

  useEffect(() => {
    if (currentUserId && tripId) markChatRead(currentUserId, tripId)
    deriveShowPrompt()
  }, [currentUserId, tripId, deriveShowPrompt])

  // Chat became visible again (OS resume / window focus) → re-derive, so the
  // prompt survives backgrounding exactly as it was rather than going stale.
  useResumeRefetch(deriveShowPrompt)

  async function handleEnablePush() {
    setPushBusy(true)
    const res = await enablePush(currentUserId)
    setPushBusy(false)
    setShowPushPrompt(false)
    // Answering the OS dialog either way (grant/deny/dismiss) is a decision —
    // record it permanently so the prompt never returns on any device. Technical
    // failures (unsupported / no key / subscribe error) are NOT a decision.
    if (res.ok || res.reason === 'denied' || res.reason === 'default') {
      await markPromptDismissed(currentUserId)
    }
  }
  function dismissPushPrompt() {
    setShowPushPrompt(false)
    markPromptDismissed(currentUserId) // permanent, per account
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
  }, [tripId, resumeTick]) // eslint-disable-line react-hooks/exhaustive-deps

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
          <span style={styles.pushIcon}><BellIcon /></span>
          <span style={styles.pushText}>Get notified about new messages</span>
          <button type="button" style={styles.pushEnable} onClick={handleEnablePush} disabled={pushBusy}>
            {pushBusy ? '…' : 'Turn On'}
          </button>
          <button type="button" style={styles.pushDismiss} onClick={dismissPushPrompt} aria-label="Dismiss">
            <DismissXIcon />
          </button>
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
