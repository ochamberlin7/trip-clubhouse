// Badges — the Trophy Room. One catalog + one function that works out which
// badges a player has earned across all their trips. Everything is computed live
// from scores with the shared stat functions (no stored badges yet):
//   • Daily badges           → buildDailyLeaders (dailyLeaders.js)
//   • Warrior / Workhorse     → pointsDefendedByPlayer / matchPlayPointsByPlayer
//   • On Fire                 → fireStatsByPlayer
//   • completeness            → analyzeScoring
// Rules (Owen, 2026-10-27): scoring badges are GROSS only; practice rounds count;
// Warrior and Workhorse come per day AND per trip; roast badges are in. Ties: every
// tied leader earns the badge.
import {
  analyzeScoring, matchPlayPointsByPlayer, pointsDefendedByPlayer, fireStatsByPlayer,
  roundHoleCount, isNoneRound,
} from './scoring.js'
import { courseHolesFromRounds } from './playerStats.js'
import { buildDailyLeaders } from './dailyLeaders.js'
import { tripTimeStatus } from './myTrips.js'

export const BADGE_GROUPS = [
  { id: 'journey', title: 'Journey' },
  { id: 'scoring', title: 'Scoring' },
  { id: 'daily', title: 'Daily' },
  { id: 'team', title: 'Team' },
  { id: 'roast', title: 'The roast' },
]

export const TIER_NAMES = ['Bronze', 'Silver', 'Gold']

// mark: the short label on the medallion. tiers: milestone thresholds (bronze, silver, gold).
export const BADGES = [
  { id: 'first_trip', group: 'journey', name: 'First Trip', mark: '1st', desc: 'Finish your first trip.' },
  { id: 'trip_veteran', group: 'journey', name: 'Trip Veteran', mark: 'TV', tiers: [3, 5, 10], unit: 'trips', desc: 'Finish 3, 5 or 10 trips.' },
  { id: 'rounds', group: 'journey', name: 'Rounds', mark: 'R', tiers: [10, 25, 50], unit: 'rounds', desc: 'Play 10, 25 or 50 full rounds.' },

  { id: 'hat_trick', group: 'scoring', name: 'Hat Trick', mark: '3', desc: '3 or more birdies in a round (gross).' },
  { id: 'birdie_bonanza', group: 'scoring', name: 'Birdie Bonanza', mark: '5', desc: '5 or more birdies in a round (gross).' },
  { id: 'back_to_back', group: 'scoring', name: 'Back-to-Back', mark: 'B2B', desc: 'Birdies on two holes in a row (gross).' },
  { id: 'par_machine', group: 'scoring', name: 'Par Machine', mark: 'P5', desc: '5 or more pars in a round (gross).' },
  { id: 'par_train', group: 'scoring', name: 'Par Train', mark: 'P10', desc: '10 or more pars in a round (gross).' },
  { id: 'bogey_free', group: 'scoring', name: 'Bogey-Free', mark: 'BF', desc: 'A full round with no bogeys or worse (gross).' },
  { id: 'broke_100', group: 'scoring', name: 'Broke 100', mark: '99', desc: 'An 18-hole round under 100 (gross).' },
  { id: 'broke_90', group: 'scoring', name: 'Broke 90', mark: '89', desc: 'An 18-hole round under 90 (gross).' },
  { id: 'broke_80', group: 'scoring', name: 'Broke 80', mark: '79', desc: 'An 18-hole round under 80 (gross).' },
  { id: 'eagle', group: 'scoring', name: 'Eagle', mark: 'E', desc: 'Two or more under par on a hole (gross).' },
  { id: 'hole_in_one', group: 'scoring', name: 'Hole in One', mark: 'H1', desc: 'An ace.' },

  { id: 'low_gross_day', group: 'daily', name: 'Low Gross of the Day', mark: 'LG', desc: 'Best gross round of a day.' },
  { id: 'low_net_day', group: 'daily', name: 'Low Net of the Day', mark: 'LN', desc: 'Best net round of a day.' },
  { id: 'most_points_day', group: 'daily', name: 'Most Points of the Day', mark: 'MP', desc: 'Most match-play points on a day.' },

  { id: 'warrior_day', group: 'team', name: 'Warrior of the Day', mark: 'W', desc: 'Led your team in Points Defended for a day.' },
  { id: 'warrior_trip', group: 'team', name: 'Trip Warrior', mark: 'W', desc: 'Led your team in Points Defended for a whole trip.' },
  { id: 'workhorse_day', group: 'team', name: 'Workhorse of the Day', mark: 'WH', desc: 'Most points on your team for a day.' },
  { id: 'workhorse_trip', group: 'team', name: 'Trip Workhorse', mark: 'WH', desc: 'Most points on your team for a whole trip.' },
  { id: 'on_fire', group: 'team', name: 'On Fire', mark: 'F', desc: 'A fire streak of 3 or more holes in a round.' },
  { id: 'champion', group: 'team', name: 'Champion', mark: 'C', desc: 'On the winning team of a trip.', comingSoon: true },

  { id: 'snowman', group: 'roast', name: 'Snowman', mark: '8', desc: 'An 8 or worse on a hole.' },
  { id: 'wooden_spoon', group: 'roast', name: 'Wooden Spoon', mark: 'WS', desc: 'Worst gross round of a day.' },
  { id: 'thirsty', group: 'roast', name: 'Thirsty', mark: 'T', desc: 'Most drinks of a day.' },
]

// perTrip: [{ tripId, tripName, trip: { start_date, end_date, time_zone }, allowance,
//             rounds, scores, pairings, pairingPlayers, tripPlayers, playerRounds, drinks }]
// Returns Map(badgeId → { earned, count, tier, events: [{ date, tripName, detail }] }).
// `tier` is 0/1/2 (bronze/silver/gold) for tiered badges, else null.
export function computeBadges(perTrip = [], userId, now = new Date()) {
  const ev = new Map(BADGES.map(b => [b.id, []]))
  const add = (id, e) => ev.get(id).push(e)
  let finishedTrips = 0, fullRounds = 0

  for (const t of perTrip) {
    const me = (t.tripPlayers || []).find(p => p.user_id === userId || p.claimed_user_id === userId)
    if (!me) continue
    const rounds = (t.rounds || []).filter(r => r && !isNoneRound(r))
    const myScores = (t.scores || []).filter(s => s.trip_player_id === me.id && s.gross_score != null)
    if (!myScores.length) continue
    const tripName = t.tripName || ''
    const tripOver = tripTimeStatus(t.trip, now) === 'past'
    if (tripOver) { finishedTrips++; add('first_trip', { date: t.trip?.end_date, tripName }) }

    // ── Scoring badges: my own gross card, round by round (practice included) ──
    const myByRound = new Map()
    for (const s of myScores) {
      if (!myByRound.has(s.round_id)) myByRound.set(s.round_id, new Map())
      myByRound.get(s.round_id).set(s.hole_number, s.gross_score)
    }
    for (const r of rounds) {
      const card = myByRound.get(r.id)
      if (!card) continue
      const holes = Array.isArray(r.holes) ? r.holes : []
      const n = roundHoleCount(r)
      const full = card.size >= n
      if (full) fullRounds++
      let birdies = 0, pars = 0, bogeyOrWorse = false, total = 0, prevBirdie = false, b2b = false
      for (let h = 1; h <= n; h++) {
        const g = card.get(h)
        const par = holes[h - 1]?.par
        if (g == null) { prevBirdie = false; continue }
        total += g
        if (g === 1) add('hole_in_one', { date: r.date, tripName, detail: `Hole ${h}` })
        if (g >= 8) add('snowman', { date: r.date, tripName, detail: `Hole ${h}` })
        if (par == null) { prevBirdie = false; continue }
        const d = g - par
        if (d <= -2) add('eagle', { date: r.date, tripName, detail: `Hole ${h}` })
        const isBirdie = d <= -1
        if (isBirdie) birdies++
        if (d === 0) pars++
        if (d >= 1) bogeyOrWorse = true
        if (isBirdie && prevBirdie) b2b = true
        prevBirdie = isBirdie
      }
      const detail = r.club_name || r.course_name || ''
      if (birdies >= 3) add('hat_trick', { date: r.date, tripName, detail })
      if (birdies >= 5) add('birdie_bonanza', { date: r.date, tripName, detail })
      if (b2b) add('back_to_back', { date: r.date, tripName, detail })
      if (pars >= 5) add('par_machine', { date: r.date, tripName, detail })
      if (pars >= 10) add('par_train', { date: r.date, tripName, detail })
      if (full && !bogeyOrWorse && holes.length) add('bogey_free', { date: r.date, tripName, detail })
      if (full && n === 18) {
        if (total < 100) add('broke_100', { date: r.date, tripName, detail: `${total}` })
        if (total < 90) add('broke_90', { date: r.date, tripName, detail: `${total}` })
        if (total < 80) add('broke_80', { date: r.date, tripName, detail: `${total}` })
      }
    }

    // ── Daily leader badges (practice included, like Daily Leaders) ──
    const days = buildDailyLeaders(t, { allowance: t.allowance ?? 100, tripStartDate: t.trip?.start_date })
    for (const day of days) {
      const lead = key => day.leaders.find(l => l.key === key)?.leader
      const mine = key => !!lead(key)?.ids.includes(me.id)
      const e = { date: day.date, tripName, detail: day.courseName || '' }
      if (mine('bestGross')) add('low_gross_day', e)
      if (mine('bestNet')) add('low_net_day', e)
      if (mine('points')) add('most_points_day', e)
      if (mine('worstGross')) add('wooden_spoon', e)
      if (mine('drinks')) add('thirsty', e)
    }

    // ── Team badges: Warrior (Points Defended) / Workhorse (points) vs teammates ──
    const base = { scores: t.scores || [], pairings: t.pairings || [], pairingPlayers: t.pairingPlayers || [], tripPlayers: t.tripPlayers || [], playerRounds: t.playerRounds || [] }
    const bundle = rs => ({ ...base, rounds: rs, courseHoles: courseHolesFromRounds(rs) })
    const team = me.team_id ? (t.tripPlayers || []).filter(p => p.team_id === me.team_id).map(p => p.id) : []
    const ledTeam = values => {
      if (team.length < 2) return false
      const mineV = values.get(me.id) || 0
      return mineV > 0 && team.every(id => (values.get(id) || 0) <= mineV)
    }
    const { completeRoundIds } = analyzeScoring(bundle(rounds), null, t.allowance ?? 100)
    const complete = rounds.filter(r => completeRoundIds.has(r.id))
    const byDate = new Map()
    for (const r of complete) { if (!byDate.has(r.date)) byDate.set(r.date, []); byDate.get(r.date).push(r) }
    for (const [date, rs] of byDate) {
      const e = { date, tripName }
      if (ledTeam(pointsDefendedByPlayer(bundle(rs), t.allowance ?? 100))) add('warrior_day', e)
      if (ledTeam(matchPlayPointsByPlayer(bundle(rs), t.allowance ?? 100))) add('workhorse_day', e)
    }
    if (tripOver && complete.length) {
      const e = { date: t.trip?.end_date, tripName }
      if (ledTeam(pointsDefendedByPlayer(bundle(complete), t.allowance ?? 100))) add('warrior_trip', e)
      if (ledTeam(matchPlayPointsByPlayer(bundle(complete), t.allowance ?? 100))) add('workhorse_trip', e)
    }

    // ── On Fire: a 3+ hole fire streak in any one round ──
    for (const r of rounds) {
      const f = fireStatsByPlayer(bundle([r]), t.allowance ?? 100).get(me.id)
      if (f && f.maxStreak >= 3) add('on_fire', { date: r.date, tripName, detail: `${f.maxStreak} holes` })
    }
  }

  // Milestones count across everything.
  for (let i = 0; i < finishedTrips; i++) add('trip_veteran', {})
  for (let i = 0; i < fullRounds; i++) add('rounds', {})

  const out = new Map()
  for (const b of BADGES) {
    const events = ev.get(b.id)
    if (b.id === 'first_trip') {
      out.set(b.id, { earned: events.length > 0, count: events.length ? 1 : 0, tier: null, events: events.slice(0, 1) })
      continue
    }
    if (b.tiers) {
      const count = events.length
      let tier = null
      b.tiers.forEach((th, i) => { if (count >= th) tier = i })
      out.set(b.id, { earned: tier != null, count, tier, events: [] })
      continue
    }
    out.set(b.id, { earned: events.length > 0, count: events.length, tier: null, events: events.sort((a, b2) => (b2.date || '').localeCompare(a.date || '')) })
  }
  return out
}
