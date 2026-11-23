import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isDeleteConfirmed, deleteAccountErrorMessage, deleteMyAccount } from './deleteAccount.js'

test('confirm word: DELETE in any case, trimmed; anything else is not confirmed', () => {
  assert.equal(isDeleteConfirmed('DELETE'), true)
  assert.equal(isDeleteConfirmed('  delete '), true)
  assert.equal(isDeleteConfirmed('delet'), false)
  assert.equal(isDeleteConfirmed(''), false)
  assert.equal(isDeleteConfirmed(null), false)
})

test('error messages: sole commissioner names the trip and says what to do', () => {
  const m = deleteAccountErrorMessage({ message: 'SOLE_COMMISSIONER:Michigan 2027' })
  assert.match(m, /only commissioner of Michigan 2027/)
  assert.match(m, /Make another player commissioner/)
  assert.match(deleteAccountErrorMessage({ message: 'ACCOUNT_IN_USE:public.trips.created_by' }), /Nothing was deleted/)
  assert.match(deleteAccountErrorMessage({ code: 'PGRST202', message: 'Could not find the function' }), /isn't set up yet/)
  assert.match(deleteAccountErrorMessage({ message: 'network' }), /try again/)
})

function fakeClient({ rpcError = null, files = [] } = {}) {
  const calls = []
  return {
    calls,
    storage: { from: b => ({
      list: async dir => { calls.push(['list', b, dir]); return { data: files } },
      remove: async paths => { calls.push(['remove', b, paths]); return {} },
    }) },
    rpc: async name => { calls.push(['rpc', name]); return { error: rpcError } },
    auth: { signOut: async () => { calls.push(['signOut']) } },
  }
}

test('deleteMyAccount: calls the RPC, then removes photos, then signs out', async () => {
  const c = fakeClient({ files: [{ name: 'a.jpg' }] })
  const r = await deleteMyAccount(c, 'u1')
  assert.equal(r.error, null)
  assert.deepEqual(c.calls.map(x => x[0]), ['rpc', 'list', 'remove', 'signOut'])
  assert.deepEqual(c.calls[2][2], ['u1/a.jpg'])
})

test('deleteMyAccount: an RPC error stops before sign out and returns a sentence', async () => {
  const c = fakeClient({ rpcError: { message: 'SOLE_COMMISSIONER:Trip A' } })
  const r = await deleteMyAccount(c, 'u1')
  assert.match(r.error, /Trip A/)
  assert.deepEqual(c.calls.map(x => x[0]), ['rpc'])
})
