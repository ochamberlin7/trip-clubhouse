// Live-score banner wording on Stableford / Stroke Play trips. Run: `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { liveBannerModel } from './liveBannerView.js'

// 4 holes, pars 4/3/5/4, neutral tee (rating = par) → playing handicap = index.
const HOLES = [{ par: 4, handicap: 1 }, { par: 3, handicap: 2 }, { par: 5, handicap: 3 }, { par: 4, handicap: 4 }]
const round = { id: 'R', holes: HOLES, slope_rating: 113, course_rating: 16, par_total: 16 }
const sm = byPlayer => {
  const m = {}
  for (const [p, gs] of Object.entries(byPlayer)) gs.forEach((g, i) => { if (g != null) m[`R:${p}:${i + 1}`] = g })
  return m
}
const P = (id, first, team = null, user = null) => ({ id, first_name: first, last_name: 'X', team_id: team, user_id: user })
const players = [P('A', 'Owen', null, 'u-owen'), P('B', 'Monty', null, 'u-monty'), P('C', 'Ben'), P('D', 'Jake')]
const hcp = { A: 0, B: 0, C: 0, D: 0 }
const texts = m => m.rows.map(r => [r.label, r.text, r.thru])

test('stroke play, in progress: leader at net to par, then You with place and gap', () => {
  // Owen −1 thru 3 · Monty E thru 3 · Ben +1 thru 2 · Jake not started
  const scoresMap = sm({ A: [3, 3, 5, null], B: [4, 3, 5, null], C: [5, 3, null, null] })
  const m = liveBannerModel({ gameType: 'stroke', round, players, scoresMap, hcpByPlayer: hcp, meId: 'u-monty' })
  assert.equal(m.finished, false)
  assert.deepEqual(texts(m), [['Leader', 'Owen leads at -1', 'Thru 3'], ['You', '2nd at E · 1 back', 'Thru 3']])
  // The leader looking at it: how far ahead they are.
  assert.deepEqual(texts(liveBannerModel({ gameType: 'stroke', round, players, scoresMap, hcpByPlayer: hcp, meId: 'u-owen' }))[1], ['You', '1st at -1 · 1 ahead', 'Thru 3'])
  // Someone not playing sees the next player instead.
  assert.deepEqual(texts(liveBannerModel({ gameType: 'stroke', round, players, scoresMap, hcpByPlayer: hcp, meId: 'u-nobody' }))[1], ['2nd', 'Monty at E · 1 back', 'Thru 3'])
})

test('stroke play: a tie for the lead, and "wins the round" once everyone has holed out', () => {
  const tie = sm({ A: [3, 3, 5, 4], B: [4, 2, 5, null] })
  assert.deepEqual(texts(liveBannerModel({ gameType: 'stroke', round, players, scoresMap: tie, hcpByPlayer: hcp, meId: 'u-owen' })),
    [['Leader', 'Owen, Monty tied at -1', ''], ['You', 'T1 at -1', 'F']])
  const done = sm({ A: [3, 3, 5, 4], B: [4, 3, 5, 5] })
  const m = liveBannerModel({ gameType: 'stroke', round, players, scoresMap: done, hcpByPlayer: hcp, meId: 'u-monty' })
  assert.equal(m.finished, true)
  assert.deepEqual(texts(m), [['Round', 'Owen wins the round at -1', ''], ['You', '2nd at +1', '']])
})

test('stableford: points with Thru; "wins the round" at the end; never "up"', () => {
  // Owen 3+2+2 = 7 thru 3 · Monty 2+2 = 4 thru 2
  const live = sm({ A: [3, 3, 5, null], B: [4, 3, null, null] })
  const m = liveBannerModel({ gameType: 'stableford', round, players, scoresMap: live, hcpByPlayer: hcp, meId: 'u-monty' })
  assert.deepEqual(texts(m), [['Leader', 'Owen leads with 7 pts', 'Thru 3'], ['You', '2nd, 4 pts · 3 back', 'Thru 2']])
  assert.ok(m.rows.every(r => !/\bup\b|square/i.test(r.text)))
  const done = sm({ A: [3, 3, 5, 4], B: [4, 3, 5, 5] })
  assert.deepEqual(texts(liveBannerModel({ gameType: 'stableford', round, players, scoresMap: done, hcpByPlayer: hcp, meId: 'u-monty' })),
    [['Round', 'Owen wins the round, 9 pts', ''], ['You', '2nd, 7 pts', '']])
})

const teams = [{ id: 'T1', name: 'Bandits', team_index: 1 }, { id: 'T2', name: 'Outlaws', team_index: 2 }]
const tp = [P('A', 'Owen', 'T1'), P('B', 'Monty', 'T1'), P('C', 'Ben', 'T2'), P('D', 'Jake', 'T2')]

test('team stableford: one line with the round totals, plural team names', () => {
  // Bandits 3+2 + 2+2 = 9 · Outlaws 1+1 + 2 = 4, thru 2
  const s = sm({ A: [3, 3, null, null], B: [4, 3, null, null], C: [5, 4, null, null], D: [4, null, null, null] })
  assert.deepEqual(texts(liveBannerModel({ gameType: 'stableford', round, players: tp, teams, scoresMap: s, hcpByPlayer: hcp })),
    [['Today', 'Bandits lead 9–4', 'Thru 2']])
  const done = sm({ A: [4, 3, 5, 4], B: [4, 3, 5, 4], C: [4, 3, 5, 5], D: [4, 3, 5, 4] })
  assert.deepEqual(texts(liveBannerModel({ gameType: 'stableford', round, players: tp, teams, scoresMap: done, hcpByPlayer: hcp })),
    [['Today', 'Bandits win the round 16–15', '']])
  // Default team names are singular: "Team 1 leads".
  const plain = [{ id: 'T1', team_index: 1 }, { id: 'T2', team_index: 2 }]
  assert.equal(liveBannerModel({ gameType: 'stableford', round, players: tp, teams: plain, scoresMap: s, hcpByPlayer: hcp }).rows[0].text, 'Team 1 leads 9–4')
})

test('team stroke play: lowest wins, margin in shots; ties', () => {
  // Bandits −1 + E = −1 · Outlaws +1 + +1 = +2 → Bandits by 3 shots
  const s = sm({ A: [3, 3, null, null], B: [4, 3, null, null], C: [5, 3, null, null], D: [4, 4, null, null] })
  const m = liveBannerModel({ gameType: 'stroke', round, players: tp, teams, scoresMap: s, hcpByPlayer: hcp })
  assert.deepEqual(texts(m), [['Today', 'Bandits lead by 3 shots', 'Thru 2']])
  assert.equal(m.rows[0].teamId, 'T1')
  const tie = sm({ A: [4, 3, null, null], B: [4, 3, null, null], C: [4, 3, null, null], D: [4, 3, null, null] })
  assert.deepEqual(texts(liveBannerModel({ gameType: 'stroke', round, players: tp, teams, scoresMap: tie, hcpByPlayer: hcp })),
    [['Today', 'Teams tied at E', 'Thru 2']])
})

test('nothing scored yet → no rows', () => {
  const m = liveBannerModel({ gameType: 'stroke', round, players, scoresMap: {}, hcpByPlayer: hcp })
  assert.equal(m.started, false); assert.deepEqual(m.rows, [])
})
