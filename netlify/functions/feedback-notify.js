// Feedback email notification. Triggered by a Supabase Database Webhook on
// INSERT into public.support_requests; sends an email to the platform owner with
// the new feedback. Kept server-side so the email API key never reaches the
// browser (same pattern as golf-course-proxy / scan-scorecard).
//
// Why a dedicated provider: password reset goes through Supabase Auth's built-in
// email, which only sends Auth-templated messages — it can't be repurposed for a
// custom application email, and it exposes no API credentials to a function. So
// this uses Resend (free tier: 100 emails/day).
//
// Environment (set in .env.local for `netlify dev`, and in Netlify site env for
// production — none are VITE_-prefixed, so they stay server-only):
//   RESEND_API_KEY            (required) Resend API key.
//   FEEDBACK_FROM             (optional) From address. Default onboarding@resend.dev,
//                             which Resend allows for sending to your own account
//                             email with no domain verification. Set a verified
//                             domain sender once one exists.
//   FEEDBACK_WEBHOOK_SECRET   (optional but recommended) Shared secret; if set, the
//                             request must send a matching `x-webhook-secret` header
//                             (configure it as a custom header on the Supabase webhook).
//   SUPABASE_URL              (optional) Used to resolve the trip name + build a
//                             dashboard link. Falls back to VITE_SUPABASE_URL.
//   SUPABASE_SERVICE_ROLE_KEY (optional) If present, resolves trip_id -> trip name
//                             (trips is RLS-protected, so the anon key can't read it).
//
// TODO (flagged, not built): recipient is hardcoded to the platform owner. Once
// more than one commissioner exists, this should notify the trip's OWN
// commissioner instead of always emailing the owner. Later problem.
const RECIPIENT = 'o.chamberlin@gmail.com'

const CATEGORY_LABELS = { bug: 'Bug', feature_request: 'Feature Request', question: 'Question', other: 'Other' }

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  // Optional shared-secret gate (Supabase webhooks can send a custom header).
  const secret = process.env.FEEDBACK_WEBHOOK_SECRET
  if (secret) {
    const got = event.headers['x-webhook-secret'] || event.headers['X-Webhook-Secret']
    if (got !== secret) return { statusCode: 401, body: 'Unauthorized' }
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { statusCode: 500, body: 'RESEND_API_KEY not configured on the server' }

  let payload
  try { payload = JSON.parse(event.body || '{}') } catch { return { statusCode: 400, body: 'Invalid JSON' } }

  // Supabase DB webhook shape: { type, table, schema, record, old_record }.
  // Also accept a bare row (record/new/root) so the endpoint is easy to test.
  const row = payload.record || payload.new || payload
  if (!row || (!row.message && !row.id)) {
    return { statusCode: 400, body: 'No feedback row in payload' }
  }

  const { id, message, name, email, trip_id, category, created_at } = row

  // Resolve the trip name if we can (needs the service-role key — trips is
  // RLS-protected). Gracefully falls back to the raw id.
  const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  let tripLabel = trip_id ? `Trip ${trip_id}` : '—'
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (trip_id && svc && base) {
    try {
      const r = await fetch(`${base}/rest/v1/trips?id=eq.${encodeURIComponent(trip_id)}&select=name`, {
        headers: { apikey: svc, Authorization: `Bearer ${svc}` },
      })
      const arr = await r.json()
      if (arr && arr[0] && arr[0].name) tripLabel = arr[0].name
    } catch { /* keep the id fallback */ }
  }

  // Dashboard link to the table (project ref = the subdomain of the Supabase URL).
  const ref = base.match(/https?:\/\/([^.]+)\.supabase\./)?.[1]
  const dashboardLink = ref ? `https://supabase.com/dashboard/project/${ref}/editor` : null

  const when = created_at ? new Date(created_at).toLocaleString('en-US', { timeZone: 'America/Detroit', dateStyle: 'medium', timeStyle: 'short' }) : 'just now'
  const catLabel = CATEGORY_LABELS[category] || category || 'Feedback'
  const fromName = name || 'Unknown'
  const fromEmail = email || 'no email on record'

  const subject = `New ${catLabel} from ${fromName}`

  const text = [
    `New feedback submitted to Trip Clubhouse.`,
    ``,
    `Category: ${catLabel}`,
    `From:     ${fromName} <${fromEmail}>`,
    `Trip:     ${tripLabel}`,
    `When:     ${when}`,
    ``,
    `Message:`,
    message || '(empty)',
    ``,
    dashboardLink ? `View in Supabase: ${dashboardLink}` : '',
  ].filter(Boolean).join('\n')

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0D1B2A">
      <h2 style="margin:0 0 4px;font-size:18px;color:#1B3F6E">New ${esc(catLabel)}</h2>
      <p style="margin:0 0 16px;color:#7A8FA6;font-size:13px">Trip Clubhouse feedback · ${esc(when)}</p>
      <table style="border-collapse:collapse;font-size:14px;margin-bottom:16px">
        <tr><td style="padding:4px 12px 4px 0;color:#7A8FA6">From</td><td style="padding:4px 0;font-weight:600">${esc(fromName)} &lt;${esc(fromEmail)}&gt;</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#7A8FA6">Trip</td><td style="padding:4px 0;font-weight:600">${esc(tripLabel)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#7A8FA6">Category</td><td style="padding:4px 0;font-weight:600">${esc(catLabel)}</td></tr>
      </table>
      <div style="background:#EEF2F6;border:1px solid #DDE3EA;border-radius:8px;padding:14px 16px;font-size:15px;line-height:1.5;white-space:pre-wrap">${esc(message || '(empty)')}</div>
      ${dashboardLink ? `<p style="margin:16px 0 0"><a href="${dashboardLink}" style="color:#1B3F6E;font-weight:600">View in Supabase →</a></p>` : ''}
      ${id ? `<p style="margin:12px 0 0;color:#B4BECB;font-size:12px">Row id: ${esc(String(id))}</p>` : ''}
    </div>`

  const from = process.env.FEEDBACK_FROM || 'Trip Clubhouse <onboarding@resend.dev>'

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [RECIPIENT], subject, html, text }),
    })
    if (!res.ok) {
      const detail = await res.text()
      return { statusCode: 502, body: `Email send failed: ${detail}` }
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true }) }
  } catch (err) {
    return { statusCode: 500, body: `Email send error: ${err.message}` }
  }
}

// Minimal HTML escape for user-supplied fields interpolated into the email body.
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
