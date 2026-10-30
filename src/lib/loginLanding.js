// Where someone lands after they log in or sign up. One place for the rule:
//   1. Following an invite link (?redirect=/join/:token, or the older ?invite=:token)
//      → back to that invite, which takes them into the trip.
//   2. Otherwise → the trip that's inside its landing window (landingTrip:
//      14 days before → 7 days after, trip-local dates), if any.
//   3. Otherwise → Trip Clubhouse Home (/home). Never the trip wizard.
import { landingTrip } from './scoring.js'

// An internal path only: "/x" yes; "//evil.com", "/\evil.com", "https://…" no.
export function safeRedirect(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/')) return null
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null
  return raw
}

// Step 1, read from the login/signup URL: the explicit ?redirect= wins, else the
// older group-invite ?invite=<token> becomes /invite/<token>. null → no invite;
// the caller sends the user on to /groups, which applies steps 2–3.
export function authRedirectTarget({ redirect, invite } = {}) {
  const r = safeRedirect(redirect)
  if (r) return r
  if (typeof invite === 'string' && /^[A-Za-z0-9_-]+$/.test(invite)) return `/invite/${invite}`
  return null
}

// Steps 2–3, once the user's trips have loaded. Returns { path, tripId } —
// tripId is set only when opening a trip (the caller activates it).
export function postLoginDestination({ trips = [], now = new Date() } = {}) {
  const trip = landingTrip(trips, now)
  return trip ? { path: '/dashboard', tripId: trip.id } : { path: '/home', tripId: null }
}
