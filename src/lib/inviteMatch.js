// Invite-link matching — which guest-list slot a signed-in user claims.
// Used by JoinTrip.jsx (/join/:inviteToken). Pure, so it's unit-testable.
//
// Chain (unclaimed slots only): email → phone (last 10 digits) → exact name
// (auto-claim) → fuzzy/nickname name (asks the user to confirm) → no match.
// Blank email / phone / name on a slot never matches, so an empty "Player TBD"
// spot can't be claimed by mistake.
import { findNameMatch } from './nameMatch.js'

const norm = s => (s || '').toLowerCase().trim()
const digitsOf = s => (s || '').replace(/\D/g, '')
export const slotName = p => [p.first_name, p.last_name].filter(Boolean).join(' ') || p.guest_name || ''

// user: { id, email, user_metadata: { phone, display_name } }
// players: the trip's full guest list (invite_guest_list RPC rows).
// Returns one of:
//   { kind: 'member' }                    — already on this trip
//   { kind: 'claim', slotId, via }        — auto-claim (via: 'email' | 'phone' | 'name')
//   { kind: 'confirm', slotId, name, diag } — fuzzy name hit; ask "is this you?"
//   { kind: 'none', diag: { e, p, n } }   — no match (diag feeds the support code)
export function matchInviteSlot({ user, players = [] }) {
  if (players.some(p => p.claimed_user_id === user.id)) return { kind: 'member' }

  const unclaimed = players.filter(p => !p.is_claimed)

  // Email (lowercase + trim on both sides).
  const myEmail = norm(user.email)
  const byEmail = myEmail ? unclaimed.find(p => p.email && norm(p.email) === myEmail) : null
  if (byEmail) return { kind: 'claim', slotId: byEmail.id, via: 'email' }
  const e = unclaimed.some(p => p.email && p.email.trim()) ? '1' : '0'

  // Phone (digits only, last 10 — ignores country codes).
  const myPhone = digitsOf(user.user_metadata?.phone)
  const byPhone = myPhone.length >= 10
    ? unclaimed.find(p => { const d = digitsOf(p.phone); return d.length >= 10 && d.slice(-10) === myPhone.slice(-10) })
    : null
  if (byPhone) return { kind: 'claim', slotId: byPhone.id, via: 'phone' }
  const p = unclaimed.some(s => digitsOf(s.phone).length > 0) ? '1' : '0'

  // Name: exact (case-insensitive) auto-claims; fuzzy needs confirmation.
  const myName = (user.user_metadata?.display_name || '').trim()
  const myNameNorm = norm(myName)
  const named = unclaimed.map(s => ({ id: s.id, name: slotName(s) })).filter(x => x.name)
  const byExact = myNameNorm ? named.find(x => norm(x.name) === myNameNorm) : null
  if (byExact) return { kind: 'claim', slotId: byExact.id, via: 'name' }

  const hit = findNameMatch(myName, named)
  if (hit) return { kind: 'confirm', slotId: hit.id, name: hit.name, diag: { e, p, n: '~' } }

  return { kind: 'none', diag: { e, p, n: named.length ? '1' : '0' } }
}
