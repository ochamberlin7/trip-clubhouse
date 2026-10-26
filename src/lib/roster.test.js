// Roster lock + remove/replace. Run: `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isRosterLocked } from './scoring.js'
import { rosterChangeBlockReason, removeTripPlayer, isPlaceholderPlayer, PLACEHOLDER_PATCH } from './roster.js'

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

// ── placeholder spot ─────────────────────────────────────────────
test('placeholder patch wipes the person and sets the team to Unassigned', () => {
  assert.equal(PLACEHOLDER_PATCH.team_id, null)
  assert.equal(PLACEHOLDER_PATCH.is_claimed, false)
  assert.equal(PLACEHOLDER_PATCH.user_id, null)
  assert.equal(PLACEHOLDER_PATCH.claimed_user_id, null)
  assert.equal(PLACEHOLDER_PATCH.is_captain, false)
})

test('isPlaceholderPlayer: empty spot vs filled-in spot', () => {
  assert.equal(isPlaceholderPlayer({ ...PLACEHOLDER_PATCH, team_id: 't1' }), true)
  assert.equal(isPlaceholderPlayer({ ...PLACEHOLDER_PATCH, first_name: 'Sam' }), false)
  assert.equal(isPlaceholderPlayer({ ...PLACEHOLDER_PATCH, email: 'sam@x.com' }), false)
  assert.equal(isPlaceholderPlayer({ ...PLACEHOLDER_PATCH, is_claimed: true }), false)
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

test('remove: clears the row into a placeholder, blanks the flight, drops group membership', async () => {
  const { client, calls } = fakeClient()
  const { error } = await removeTripPlayer(client, { player, groupId: 'g1', rosterLocked: false })
  assert.equal(error, null)
  const ops = calls.map(c => `${c.op}:${c.table}`)
  assert.deepEqual(ops, ['update:trip_players', 'update:flights', 'select:trips', 'select:trip_players', 'delete:group_members'])
  assert.deepEqual(calls[0].value, PLACEHOLDER_PATCH)
  assert.deepEqual(calls[0].filters, [['eq', 'id', 'tp1']])
  // The row is never deleted and pairings are never touched — the spot keeps them.
  assert.equal(calls.some(c => c.table === 'pairing_players'), false)
  assert.equal(calls.some(c => c.op === 'delete' && c.table === 'trip_players'), false)
  const gm = calls.at(-1)
  assert.deepEqual(gm.filters, [['eq', 'group_id', 'g1'], ['eq', 'user_id', 'u9'], ['eq', 'role', 'player']])
})

test('remove keeps group membership when they have another trip in the group', async () => {
  const { client, calls } = fakeClient({ otherSlots: [{ id: 'tp7' }] })
  await removeTripPlayer(client, { player, groupId: 'g1', rosterLocked: false })
  assert.equal(calls.some(c => c.table === 'group_members'), false)
})

test('remove refuses a locked roster or the commissioner, and writes nothing', async () => {
  const { client, calls } = fakeClient()
  const r1 = await removeTripPlayer(client, { player, groupId: 'g1', rosterLocked: true })
  const r2 = await removeTripPlayer(client, { player: { ...player, is_commissioner: true }, groupId: 'g1', rosterLocked: false })
  assert.match(r1.error.message, /set once the trip starts/)
  assert.match(r2.error.message, /commissioner/)
  assert.equal(calls.length, 0)
})
