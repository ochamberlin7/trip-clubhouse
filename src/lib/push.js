// Web Push client helpers for the trash-talk thread. Everything here degrades
// gracefully: on any browser without push support (most Android browsers, desktop
// Safari, a non-installed iOS tab) these no-op and the app behaves exactly as
// before — nothing throws, nothing renders broken.
import { supabase } from './supabase'

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY

// Push on iOS only works from an INSTALLED (Add to Home Screen) PWA. We can't
// perfectly detect that, but requiring the three APIs below is the right gate:
// mobile Safari in a tab doesn't expose PushManager, only the installed PWA does.
export function isPushSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

export function pushPermission() {
  return isPushSupported() ? Notification.permission : 'unsupported' // 'granted'|'denied'|'default'|'unsupported'
}

let swRegPromise = null
export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return Promise.resolve(null)
  if (!swRegPromise) swRegPromise = navigator.serviceWorker.register('/sw.js').catch(() => null)
  return swRegPromise
}

function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

// Request permission (MUST be called from a user gesture), subscribe, and persist
// the subscription. Returns { ok, reason }. Never throws for the expected
// "can't"/"won't" cases so callers can just surface the reason.
export async function enablePush(userId) {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' }
  if (!VAPID_PUBLIC) return { ok: false, reason: 'no-vapid-key' }
  if (!userId) return { ok: false, reason: 'no-user' }

  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return { ok: false, reason: perm } // 'denied' | 'default'

  const reg = await registerServiceWorker()
  if (!reg) return { ok: false, reason: 'no-sw' }
  await navigator.serviceWorker.ready

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC),
      })
    } catch (err) {
      return { ok: false, reason: err?.message || 'subscribe-failed' }
    }
  }

  const json = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
    user_agent: navigator.userAgent,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' })
  if (error) return { ok: false, reason: error.message }
  return { ok: true }
}

export async function disablePush() {
  try {
    const reg = await registerServiceWorker()
    const sub = reg && await reg.pushManager.getSubscription()
    if (sub) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      await sub.unsubscribe()
    }
  } catch { /* best effort — leaving a stale row is harmless; the sender prunes 410s */ }
  return { ok: true }
}

// Does this browser currently hold an active push subscription?
export async function hasActiveSubscription() {
  if (!isPushSupported() || Notification.permission !== 'granted') return false
  const reg = await registerServiceWorker()
  if (!reg) return false
  try { return !!(await reg.pushManager.getSubscription()) } catch { return false }
}

// Clear the home-screen app icon badge (both spellings for older impls).
export async function clearAppBadge() {
  try {
    if ('clearAppBadge' in navigator) await navigator.clearAppBadge()
    else if ('setAppBadge' in navigator) await navigator.setAppBadge(0)
  } catch { /* unsupported */ }
}

// ── In-chat prompt dismissal (permanent, per account) ───────────────────────
// Source of truth is profiles.push_prompt_dismissed_at; localStorage is only a
// fast-path cache so we can skip the network read once we know it's dismissed.
const DISMISS_CACHE = 'tc_push_prompt_dismissed'

// Has the user permanently dismissed / answered the prompt? Checks the local
// cache first (cheap), then the DB (authoritative — catches reinstall / new
// device where the cache is empty). Caches a true result locally.
export async function isPromptDismissed(userId) {
  try { if (localStorage.getItem(DISMISS_CACHE) === '1') return true } catch { /* ignore */ }
  if (!userId) return false
  try {
    const { data } = await supabase.from('profiles').select('push_prompt_dismissed_at').eq('id', userId).maybeSingle()
    const dismissed = !!data?.push_prompt_dismissed_at
    if (dismissed) { try { localStorage.setItem(DISMISS_CACHE, '1') } catch { /* ignore */ } }
    return dismissed
  } catch { return false }
}

// Record the dismissal permanently (DB) + cache it locally. Idempotent.
export async function markPromptDismissed(userId) {
  try { localStorage.setItem(DISMISS_CACHE, '1') } catch { /* ignore */ }
  if (!userId) return
  try {
    await supabase.from('profiles').update({ push_prompt_dismissed_at: new Date().toISOString() }).eq('id', userId)
  } catch { /* non-fatal — local cache still suppresses it on this device */ }
}

// Mark the thread read up to now for this user+trip, and clear the badge. Driven
// by "the user actually opened the thread", not by app foreground.
export async function markChatRead(userId, tripId) {
  if (!userId || !tripId) return
  try {
    await supabase.from('chat_reads').upsert(
      { user_id: userId, trip_id: tripId, last_read_at: new Date().toISOString() },
      { onConflict: 'user_id,trip_id' },
    )
  } catch { /* non-fatal */ }
  await clearAppBadge()
}
