// Chat push fan-out. Triggered by a Supabase Database Webhook on INSERT to
// public.messages: sends a Web Push to every OTHER member of the trip (never the
// sender) and includes their personal unread count so the SW can set the app
// badge. Same server-side-secrets discipline as feedback-notify — VAPID private
// key and service-role key stay in function env, never shipped to the client.
//
// Environment (Netlify function env; none VITE_-prefixed except the reused public key):
//   CHAT_WEBHOOK_SECRET        (REQUIRED — fail closed) must match the `x-webhook-secret`
//                              header configured on the Supabase webhook.
//   SUPABASE_URL               project URL (falls back to VITE_SUPABASE_URL).
//   SUPABASE_SERVICE_ROLE_KEY  (REQUIRED) reads members/subscriptions past RLS.
//   VAPID_PUBLIC_KEY           (falls back to VITE_VAPID_PUBLIC_KEY)
//   VAPID_PRIVATE_KEY          (REQUIRED) — server-only signing key.
//   VAPID_SUBJECT              mailto: or https: contact (defaults to a mailto).
const webpush = require('web-push')

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' }

  // FAIL CLOSED: no configured secret → reject everything (built in from the start).
  const secret = process.env.CHAT_WEBHOOK_SECRET
  if (!secret) return { statusCode: 503, body: 'Webhook secret not configured' }
  const got = event.headers['x-webhook-secret'] || event.headers['X-Webhook-Secret']
  if (got !== secret) return { statusCode: 401, body: 'Unauthorized' }

  const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY
  const vapidPublic = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:o.chamberlin@gmail.com'
  if (!base || !svc) return { statusCode: 500, body: 'Supabase env not configured' }
  if (!vapidPublic || !vapidPrivate) return { statusCode: 500, body: 'VAPID keys not configured' }
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

  let payload
  try { payload = JSON.parse(event.body || '{}') } catch { return { statusCode: 400, body: 'Invalid JSON' } }
  const msg = payload.record || payload.new || payload
  const tripId = msg?.trip_id
  const senderId = msg?.user_id
  if (!tripId || !msg?.content) return { statusCode: 400, body: 'No message row in payload' }

  // Service-role auth via the apikey header. Only add Authorization: Bearer for a
  // JWT-shaped (legacy) key — a non-JWT sb_secret_ key fails PostgREST's JWT parse
  // in the Bearer slot, so for those the apikey header alone grants service_role.
  const svcHeaders = /^eyJ/.test(svc || '') ? { apikey: svc, Authorization: `Bearer ${svc}` } : { apikey: svc }
  const keyKind = /^eyJ/.test(svc || '') ? 'jwt' : (svc || '').startsWith('sb_secret_') ? 'sb_secret' : 'other'
  // First 8 chars only — safe to log (a JWT header start `eyJhbGci` or the literal
  // `sb_secret` prefix; neither reveals the secret). Removes all ambiguity about
  // WHICH key the deployed function is actually reading at runtime.
  const keyPrefix = (svc || '').slice(0, 8)
  console.log('[chat-notify] key in use', JSON.stringify({ keyKind, keyPrefix, len: (svc || '').length }))
  // Surface REST failures instead of silently defaulting to []/null. A non-2xx
  // (401 bad key, 42501 grant/RLS as anon, etc.) is logged with status + body so
  // the actual cause is visible in the function log — no more silent zeros.
  async function sb(path) {
    let res
    try {
      res = await fetch(`${base}/rest/v1/${path}`, { headers: svcHeaders })
    } catch (e) {
      console.error('[chat-notify] REST fetch threw', { path: path.slice(0, 60), keyKind, error: String(e && e.message) })
      return null
    }
    const text = await res.text()
    if (!res.ok) {
      console.error('[chat-notify] REST error', { path: path.slice(0, 60), status: res.status, keyKind, body: text.slice(0, 200) })
      return null
    }
    try { return JSON.parse(text) } catch { return null }
  }

  // 1. Recipients = everyone who can be in this thread, minus the sender. This MUST
  //    mirror the messages RLS (20260621): a member reaches the chat via a
  //    trip_players row (user_id OR claimed_user_id) *or* by being a group member
  //    of the trip's group. Scoping to trip_players alone silently drops
  //    group-member-only participants — who can post but have no trip_players row.
  const tripRows = await sb(`trips?id=eq.${tripId}&select=group_id`)
  const groupId = Array.isArray(tripRows) && tripRows[0] ? tripRows[0].group_id : null
  const [roster, members] = await Promise.all([
    sb(`trip_players?trip_id=eq.${tripId}&select=user_id,claimed_user_id`),
    groupId ? sb(`group_members?group_id=eq.${groupId}&select=user_id`) : Promise.resolve([]),
  ])
  const rosterIds = (Array.isArray(roster) ? roster : []).flatMap(r => [r.user_id, r.claimed_user_id]).filter(Boolean)
  const memberIds = (Array.isArray(members) ? members : []).map(m => m.user_id).filter(Boolean)
  const recipients = [...new Set([...rosterIds, ...memberIds])].filter(uid => uid !== senderId)
  if (!recipients.length) {
    console.log('[chat-notify]', JSON.stringify({ trip_id: tripId, sender: senderId, group_id: groupId, keyKind, trip_players: rosterIds.length, group_members: memberIds.length, recipients: 0, note: 'no recipients' }))
    return { statusCode: 200, body: JSON.stringify({ ok: true, sent: 0, note: 'no recipients' }) }
  }

  const inList = `(${recipients.join(',')})`

  // 2. Their subscriptions + read state + the trip's messages (for unread counts).
  const [subs, reads, allMsgs] = await Promise.all([
    sb(`push_subscriptions?user_id=in.${inList}&select=user_id,endpoint,p256dh,auth`),
    sb(`chat_reads?trip_id=eq.${tripId}&user_id=in.${inList}&select=user_id,last_read_at`),
    sb(`messages?trip_id=eq.${tripId}&select=user_id,created_at`),
  ])
  const lastRead = {}
  ;(Array.isArray(reads) ? reads : []).forEach(r => { lastRead[r.user_id] = new Date(r.last_read_at).getTime() })
  const msgs = (Array.isArray(allMsgs) ? allMsgs : []).map(m => ({ uid: m.user_id, t: new Date(m.created_at).getTime() }))
  const unreadFor = (uid) => {
    const since = lastRead[uid] || 0
    return msgs.filter(m => m.uid !== uid && m.t > since).length
  }

  const title = msg.sender_name || 'Trash Talk'
  const body = String(msg.content).slice(0, 140)

  // 3. Send to every subscription. Prune expired ones (404/410); LOG every other
  //    failure (403/400 = VAPID mismatch/bad JWT, etc.) instead of swallowing it,
  //    so the function's real outcome is visible in the Netlify logs.
  const subsList = Array.isArray(subs) ? subs : []
  const results = await Promise.all(subsList.map(async (s) => {
    const data = JSON.stringify({ title, body, badge: unreadFor(s.user_id), url: '/', tag: `trash-talk:${tripId}` })
    try {
      const res = await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, data)
      return { user_id: s.user_id, ok: true, status: res.statusCode }
    } catch (err) {
      const status = err && err.statusCode
      if (status === 404 || status === 410) {
        await fetch(`${base}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, {
          method: 'DELETE', headers: svcHeaders,
        }).catch(() => {})
        return { user_id: s.user_id, ok: false, pruned: true, status }
      }
      const detail = (err && (err.body || err.message)) || 'unknown'
      console.error('[chat-notify] send failed', { endpoint: String(s.endpoint).slice(0, 50), status, detail: String(detail).slice(0, 200) })
      return { user_id: s.user_id, ok: false, status, error: String(detail).slice(0, 200) }
    }
  }))

  const sent = results.filter(r => r.ok).length
  const pruned = results.filter(r => r.pruned).length
  const failures = results.filter(r => !r.ok && !r.pruned).map(r => ({ status: r.status, error: r.error }))
  const summary = { trip_id: tripId, sender: senderId, recipients: recipients.length, subscriptions: subsList.length, sent, pruned, failures }
  console.log('[chat-notify]', JSON.stringify(summary))

  return { statusCode: 200, body: JSON.stringify({ ok: true, ...summary }) }
}
