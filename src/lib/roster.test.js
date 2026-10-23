// Roster lock + remove/replace. Run: `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isRosterLocked } from './scoring.js'
import { rosterChangeBlockReason, replacementPatch, removeTripPlayer, replaceTripPlayer } from './roster.js'

const DETROIT = 'America/Detroit'
const trip = { start_date: '2026-11-05', end_date: '2026-11-08' }

// ── isRosterLocked (trip-local date) ─────────────────────────────
test('roster is open before the trip starts', () => {
  assert.equal(isRosterLocked({ trip, now: new Date('2026-11-04T12:00:00Z'), timeZone: DETROIT }), false)
})

test('roster locks on day 1 and stays locked after the trip', () => {
  assert.equal(isRosterLocked({ trip, now: new Date('2026-11-05T14:00:00Z'), timeZone: DETROIT }), true)
  assert.equal(isRosterLocked({ trip, now: new Date('2026-11-12T14:00:00Z'), timeZone: DETROIT }), true)
})

test('lock follows the trip time zone, not the viewer clock', () => {
  // 11:30pm Nov 4 in Phoenix = 2:30am Nov 5 in Detroit → the trip has started.
  const now = new Date('2026-11-05T06:30:00Z')
  assert.equal(isRosterLocked({ trip, now, timeZone: 'America/Phoenix' }), false)
  assert.equal(isRosterLocked({ trip, now, timeZone: DETROIT }), true)
})

test('no start date = not started; no trip = locked; test mode unlocks', () => {
  assert.equal(isRosterLocked({ trip: { start_date: null }, now: new Date(), timeZone: DETROIT }), false)
  assert.equal(isRosterLocked({ trip: null }), true)
  assert.equal(isRosterLocked({ trip, now: new Date('2026-11-06T14:00:00Z'), timeZone: DETROIT, devOverride: true }), false)
})

// ── rosterChangeBlockReason ──────────────────────────────────────
test('block reasons: locked roster and the commissioner', () => {
  assert.match(rosterChangeBlockReason({ player: {}, rosterLocked: true }), /set once the trip starts/)
  assert.match(rosterChangeBlockReason({ player: { is_commissioner: true }, rosterLocked: false }), /commissioner/)
  assert.equal(rosterChangeBlockReason({ player: {}, rosterLocked: false }), null)
})

// ── replacementPatch ─────────────────────────────────────────────
test('replacement keeps the slot (no team/pairing fields) and resets identity + claim', () => {
  const p = replacementPatch({ first_name: ' Sam ', last_name: 'Lee', handicap_index: '12.4', email: ' s@x.com ', phone: '' })
  assert.deepEqual(p, {
    first_name: 'Sam', last_name: 'Lee', guest_name: null, handicap_index: 12.4,
    email: 's@x.com', phone: null, user_id: null, claimed_user_id: null, is_claimed: false, is_captain: false,
  })
  assert.equal('team_id' in p, false)
})

test('replacement validation', () => {
  assert.throws(() => replacementPatch({ first_name: '  ' }), /First name/)
  assert.throws(() => replacementPatch({ first_name: 'A', handicap_index: '60' }), /between 0 and 54/)
  assert.equal(replacementPatch({ first_name: 'A', handicap_index: '' }).handicap_index, null)
})

// ── remove / replace against a fake Supabase client ─────────────
function fakeClient({ otherSlots = [] } = {}) {
  const calls = []
  const client = {
    from(table) {
      const q = { table, op: 'select', filters: [] }
      const chain = {
        select() { return chain },
        delete() { q.op = 'delete'; return chain },
        update(v) { q.op = 'update'; q.value = v; return chain },
        eq(c, v) { q.filters.push(['eq', c, v]); return chain },
        neq(c, v) { q.filters.push(['neq', c, v]); return chain },
        in(c, v) { q.filters.push(['in', c, v]); return chain },
        or(v) { q.filters.push(['or', v]); return chain },
        limit() { return chain },
        then(res) {
          calls.push(q)
          let data = null
          if (q.op === 'select' && table === 'trips') data = [{ id: 't1' }]
          if (q.op === 'select' && table === 'trip_players') data = otherSlots
          return Promise.resolve({ data, error: null }).then(res)
        },
      }
      return chain
    },
  }
  return { client, calls }
}

const player = { id: 'tp1', name: 'Pat', claimed_user_id: 'u9', user_id: null }

test('remove: clears pairings, deletes the row, drops group membership', async () => {
  const { client, calls } = fakeClient()
  const { error } = await removeTripPlayer(client, { player, groupId: 'g1', rosterLocked: false })
  assert.equal(error, null)
  const ops = calls.map(c => `${c.op}:${c.table}`)
  assert.deepEqual(ops, ['delete:pairing_players', 'delete:trip_players', 'select:trips', 'select:trip_players', 'delete:group_members'])
  const gm = calls.at(-1)
  assert.deepEqual(gm.filters, [['eq', 'group_id', 'g1'], ['eq', 'user_id', 'u9'], ['eq', 'role', 'player']])
})

test('remove keeps group membership when they have another trip in the group', async () => {
  const { client, calls } = fakeClient({ otherSlots: [{ id: 'tp7' }] })
  await removeTripPlayer(client, { player, groupId: 'g1', rosterLocked: false })
  assert.equal(calls.some(c => c.table === 'group_members'), false)
})

test('remove/replace refuse a locked roster and write nothing', async () => {
  const { client, calls } = fakeClient()
  const r1 = await removeTripPlayer(client, { player, groupId: 'g1', rosterLocked: true })
  const r2 = await replaceTripPlayer(client, { player, groupId: 'g1', rosterLocked: true, replacement: { first_name: 'Sam' } })
  assert.match(r1.error.message, /set once the trip starts/)
  assert.match(r2.error.message, /set once the trip starts/)
  assert.equal(calls.length, 0)
})

test('replace: updates the same row, blanks the flight, never touches pairings', async () => {
  const { client, calls } = fakeClient()
  const { error } = await replaceTripPlayer(client, { player, groupId: 'g1', rosterLocked: false, replacement: { first_name: 'Sam', handicap_index: '8' } })
  assert.equal(error, null)
  assert.equal(calls[0].op, 'update'); assert.equal(calls[0].table, 'trip_players')
  assert.deepEqual(calls[0].filters, [['eq', 'id', 'tp1']])
  assert.equal(calls[1].table, 'flights'); assert.equal(calls[1].op, 'update')
  assert.equal(calls.some(c => c.table === 'pairing_players'), false)
})
