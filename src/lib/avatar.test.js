import { test } from 'node:test'
import assert from 'node:assert/strict'
import { squareCrop, cropSquare, avatarPath, accountAvatarUrl } from './avatar.js'

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

test('cropSquare uses the crop window area', () => {
  assert.deepEqual(cropSquare(4000, 3000, { x: 1200, y: 400, width: 1500, height: 1500 }), { sx: 1200, sy: 400, side: 1500 })
})

test('cropSquare rounds and squares a slightly-off area', () => {
  assert.deepEqual(cropSquare(4000, 3000, { x: 10.6, y: 20.4, width: 999.7, height: 1000.2 }), { sx: 11, sy: 20, side: 1000 })
})

test('cropSquare keeps the square inside the image', () => {
  assert.deepEqual(cropSquare(1000, 800, { x: 900, y: 700, width: 300, height: 300 }), { sx: 700, sy: 500, side: 300 })
  assert.deepEqual(cropSquare(1000, 800, { x: -5, y: -5, width: 2000, height: 2000 }), { sx: 0, sy: 0, side: 800 })
})

test('cropSquare falls back to a centered square without an area', () => {
  assert.deepEqual(cropSquare(4000, 3000, null), { sx: 500, sy: 0, side: 3000 })
  assert.deepEqual(cropSquare(4000, 3000, { x: 0, y: 0, width: 0, height: 0 }), { sx: 500, sy: 0, side: 3000 })
})
