// Fuzzy name-match regression checks. Run: `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { firstNamesEquivalent, findNameMatch } from './nameMatch.js'

test('firstNamesEquivalent — nickname / prefix pairs match', () => {
  assert.equal(firstNamesEquivalent('Jon', 'Jonathan'), true)   // prefix
  assert.equal(firstNamesEquivalent('Bob', 'Robert'), true)     // nickname
  assert.equal(firstNamesEquivalent('Bill', 'William'), true)   // nickname
  assert.equal(firstNamesEquivalent('Sam', 'Samuel'), true)     // prefix
  assert.equal(firstNamesEquivalent('Jim', 'James'), true)
  assert.equal(firstNamesEquivalent('Dick', 'Richard'), true)
  assert.equal(firstNamesEquivalent('jonathan', 'JON'), true)   // case-insensitive, either order
})

test('firstNamesEquivalent — unrelated names do NOT match', () => {
  assert.equal(firstNamesEquivalent('Jon', 'James'), false)
  assert.equal(firstNamesEquivalent('Bob', 'Bill'), false)
  assert.equal(firstNamesEquivalent('Mike', 'Mark'), false)
  assert.equal(firstNamesEquivalent('Sarah', 'Michael'), false)
  assert.equal(firstNamesEquivalent('Al', 'Alan'), false)       // <3-char fragment, no group
})

test('findNameMatch — matches nickname/variant with the same last name', () => {
  assert.deepEqual(findNameMatch('Jon Smith', [{ id: '1', name: 'Jonathan Smith' }]), { id: '1', name: 'Jonathan Smith' })
  assert.deepEqual(findNameMatch('Bob Jones', [{ id: '2', name: 'Robert Jones' }]), { id: '2', name: 'Robert Jones' })
  assert.deepEqual(findNameMatch('Bill Adams', [{ id: '3', name: 'William Adams' }]), { id: '3', name: 'William Adams' })
})

test('findNameMatch — does NOT match a nickname with a different last name', () => {
  // Same first-name family but a different surname is a different person.
  assert.equal(findNameMatch('Jon Smith', [{ id: '4', name: 'Jonathan Jones' }]), null)
})

test('findNameMatch — unrelated name returns null', () => {
  assert.equal(findNameMatch('Michael Brown', [{ id: '5', name: 'Sarah Johnson' }]), null)
})

test('findNameMatch — a light typo in the last name still matches (fuzzy fallback)', () => {
  const hit = findNameMatch('Jonathan Smith', [{ id: '6', name: 'Jonathan Smtih' }])
  assert.equal(hit?.id, '6')
})
