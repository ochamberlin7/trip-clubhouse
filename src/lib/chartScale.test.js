// Chart scales and colours (chartScale.js). Run: `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { niceScale, winShareColor } from './chartScale.js'

test('niceScale gives about five gridlines that cover the data', () => {
  for (const vals of [[80.7, 87], [12.4, 17.8], [20, 169], [-20, 8], [3, 3]]) {
    const { lo, hi, ticks } = niceScale(vals)
    assert.ok(lo <= Math.min(...vals) && hi >= Math.max(...vals), `${vals} covered`)
    assert.ok(ticks.length >= 2 && ticks.length <= 8, `${vals}: ${ticks.length} ticks`)
  }
})

test('winShareColor: blue when winning more, red when losing more, light grey when even', () => {
  assert.equal(winShareColor(1).bg, 'rgb(33,102,172)')
  assert.equal(winShareColor(0).bg, 'rgb(178,24,43)')
  assert.equal(winShareColor(0.5).bg, 'rgb(242,242,242)')
  assert.equal(winShareColor(0.5).dark, false)
})
