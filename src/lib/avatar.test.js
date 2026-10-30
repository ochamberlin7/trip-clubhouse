import { test } from 'node:test'
import assert from 'node:assert/strict'
import { squareCrop, avatarPath, accountAvatarUrl } from './avatar.js'

test('squareCrop centers a landscape photo', () => {
  assert.deepEqual(squareCrop(4000, 3000), { sx: 500, sy: 0, side: 3000 })
})

test('squareCrop centers a portrait photo', () => {
  assert.deepEqual(squareCrop(3000, 4000), { sx: 0, sy: 500, side: 3000 })
})

test('squareCrop leaves a square photo alone', () => {
  assert.deepEqual(squareCrop(800, 800), { sx: 0, sy: 0, side: 800 })
})

test('avatarPath puts the file in the user folder (required by storage RLS)', () => {
  assert.equal(avatarPath('abc-123', 42), 'abc-123/42.jpg')
})

test('accountAvatarUrl reads the account metadata, null when missing', () => {
  assert.equal(accountAvatarUrl({ user_metadata: { avatar_url: 'https://x/y.jpg' } }), 'https://x/y.jpg')
  assert.equal(accountAvatarUrl({ user_metadata: {} }), null)
  assert.equal(accountAvatarUrl(null), null)
})
