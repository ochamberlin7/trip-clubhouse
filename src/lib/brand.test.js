import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isHexColor, mixHex, brandThemeVars, inviteTokenFromRedirect } from './brand.js'

test('isHexColor accepts only #RRGGBB', () => {
  assert.equal(isHexColor('#1F1F1F'), true)
  assert.equal(isHexColor('#abc'), false)
  assert.equal(isHexColor('red'), false)
  assert.equal(isHexColor(null), false)
})

test('mixHex blends toward a second color', () => {
  assert.equal(mixHex('#000000', '#FFFFFF', 0), '#000000')
  assert.equal(mixHex('#000000', '#FFFFFF', 1), '#FFFFFF')
  assert.equal(mixHex('#000000', '#FFFFFF', 0.5), '#808080')
})

test('brandThemeVars maps primary to the navy family', () => {
  const v = brandThemeVars({ primary_color: '#1f1f1f', accent_color: '#A6192E' })
  assert.equal(v['--navy'], '#1F1F1F')
  assert.equal(v['--brand-accent'], '#A6192E')
  assert.ok(v['--accent-bg'] && v['--navy2'] && v['--navy-soft-text'])
})

test('brandThemeVars is empty without a valid primary color', () => {
  assert.deepEqual(brandThemeVars(null), {})
  assert.deepEqual(brandThemeVars({ primary_color: 'navy' }), {})
})

test('brandThemeVars skips a bad accent color', () => {
  assert.equal(brandThemeVars({ primary_color: '#111111', accent_color: 'oops' })['--brand-accent'], undefined)
})

test('inviteTokenFromRedirect reads the join token', () => {
  const t = '3f2b8c1e-9a4d-4b7e-8c21-0d5e6f7a8b9c'
  assert.equal(inviteTokenFromRedirect(`/join/${t}`), t)
  assert.equal(inviteTokenFromRedirect(`/join/${t}?x=1`), t)
  assert.equal(inviteTokenFromRedirect('/dashboard'), null)
  assert.equal(inviteTokenFromRedirect('/join/not-a-token'), null)
  assert.equal(inviteTokenFromRedirect(null), null)
})
