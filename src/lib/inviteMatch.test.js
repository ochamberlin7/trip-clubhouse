// Invite-link matching, incl. the Remove → "Player TBD" → fill in → invite flow.
// Run: `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchInviteSlot, inviteTokenFrom } from './inviteMatch.js'
import { PLACEHOLDER_PATCH } from './roster.js'

const user = (over = {}) => ({ id: 'u-new', email: 'josh@x.com', user_metadata: { phone: '(602) 555-0101', display_name: 'Josh Smith' }, ...over })
const slot = (id, over = {}) => ({ id, first_name: null, last_name: null, guest_name: null, email: null, phone: null, is_claimed: false, claimed_user_id: null, ...over })

// A removed player's row, exactly as removeTripPlayer leaves it.
const tbd = (id = 'tbd') => slot(id, { ...PLACEHOLDER_PATCH })

test('empty Player TBD spot never matches anyone', () => {
  const players = [tbd()]
  assert.equal(matchInviteSlot({ user: user(), players }).kind, 'none')
  // Even a user with no email / phone / name on their account.
  assert.equal(matchInviteSlot({ user: user({ email: '', user_metadata: {} }), players }).kind, 'none')
})

test('blank email on both sides does not count as a match', () => {
  const players = [slot('a', { email: '   ' })]
  assert.equal(matchInviteSlot({ user: user({ email: '', user_metadata: {} }), players }).kind, 'none')
})

test('filled-in spot: email match claims it (case/space-insensitive)', () => {
  const players = [tbd('other'), slot('tbd', { first_name: 'Josh', last_name: 'Smith', email: ' JOSH@x.com ' })]
  assert.deepEqual(matchInviteSlot({ user: user(), players }), { kind: 'claim', slotId: 'tbd', via: 'email' })
})

test('filled-in spot: phone match claims it (formatting / country code ignored)', () => {
  const players = [slot('tbd', { first_name: 'J', phone: '+1 602-555-0101' })]
  assert.deepEqual(matchInviteSlot({ user: user({ email: 'other@x.com' }), players }), { kind: 'claim', slotId: 'tbd', via: 'phone' })
})

test('filled-in spot: exact name claims it; nickname asks to confirm', () => {
  const players = [slot('tbd', { first_name: 'Josh', last_name: 'Smith' })]
  const noContact = { email: 'nope@x.com', user_metadata: { display_name: 'josh smith' } }
  assert.deepEqual(matchInviteSlot({ user: user(noContact), players }), { kind: 'claim', slotId: 'tbd', via: 'name' })
  const bySlot = [slot('tbd', { first_name: 'Joshua', last_name: 'Smith' })]
  const r = matchInviteSlot({ user: user(noContact), players: bySlot })
  assert.equal(r.kind, 'confirm'); assert.equal(r.slotId, 'tbd')
})

test('a claimed spot is never matched again', () => {
  const players = [slot('tbd', { first_name: 'Josh', last_name: 'Smith', email: 'josh@x.com', is_claimed: true, claimed_user_id: 'u-old' })]
  assert.equal(matchInviteSlot({ user: user(), players }).kind, 'none')
})

test('removed player clicking the link again: no longer matched (spot was cleared)', () => {
  const removed = user({ id: 'u-old', email: 'pat@x.com', user_metadata: { phone: '4805550199', display_name: 'Pat Jones' } })
  const players = [slot('tbd', { first_name: 'Josh', last_name: 'Smith', email: 'josh@x.com' })]
  assert.equal(matchInviteSlot({ user: removed, players }).kind, 'none')
})

test('already on the trip → member', () => {
  const players = [slot('s1', { is_claimed: true, claimed_user_id: 'u-new' })]
  assert.deepEqual(matchInviteSlot({ user: user(), players }), { kind: 'member' })
})

test('no-match diagnostic codes', () => {
  const players = [slot('a', { email: 'a@x.com', phone: '1112223333', first_name: 'Zed' })]
  const r = matchInviteSlot({ user: user({ email: 'b@x.com', user_metadata: { display_name: 'Josh Smith' } }), players })
  assert.deepEqual(r, { kind: 'none', diag: { e: '1', p: '1', n: '1' } })
})

test('inviteTokenFrom: pasted link, link without https, bare token, junk', () => {
  const tok = '28d7efc2-14ea-4195-8003-5cf98f097993'
  assert.equal(inviteTokenFrom(`https://thetripclubhouse.com/join/${tok}`), tok)
  assert.equal(inviteTokenFrom(`  thetripclubhouse.com/join/${tok}?x=1 `), tok)
  assert.equal(inviteTokenFrom(tok), tok)
  assert.equal(inviteTokenFrom('hello there'), null)
  assert.equal(inviteTokenFrom(''), null)
})
