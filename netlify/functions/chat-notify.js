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

  const sb = (path) => fetch(`${base}/rest/v1/${path}`, { headers: { apikey: svc, Authorization: `Bearer ${svc}` } }).then(r => r.json())

  // 1. Recipients: every user tied to this trip's roster, minus the sender.
  const roster = await sb(`trip_players?trip_id=eq.${tripId}&select=user_id,claimed_user_id`)
  const recipients = [...new Set(
    (Array.isArray(roster) ? roster : [])
      .flatMap(r => [r.user_id, r.claimed_user_id])
      .filter(Boolean),
  )].filter(uid => uid !== senderId)
  if (!recipients.length) return { statusCode: 200, body: JSON.stringify({ ok: true, sent: 0, note: 'no recipients' }) }

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

  // 3. Send to every subscription; prune expired ones (404/410).
  const subsList = Array.isArray(subs) ? subs : []
  let sent = 0, pruned = 0
  await Promise.all(subsList.map(async (s) => {
    const data = JSON.stringify({
      title,
      body,
      badge: unreadFor(s.user_id),
      url: '/',
      tag: `trash-talk:${tripId}`,
    })
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        data,
      )
      sent++
    } catch (err) {
      if (err && (err.statusCode === 404 || err.statusCode === 410)) {
        pruned++
        await fetch(`${base}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, {
          method: 'DELETE', headers: { apikey: svc, Authorization: `Bearer ${svc}` },
        }).catch(() => {})
      }
      // other errors: swallow (one bad endpoint shouldn't fail the batch)
    }
  }))

  return { statusCode: 200, body: JSON.stringify({ ok: true, recipients: recipients.length, subscriptions: subsList.length, sent, pruned }) }
}
