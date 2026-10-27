import { useEffect, useMemo, useState } from 'react'
import { supabase, uniqueChannelName } from '../lib/supabase'
import { useResumeRefetch } from '../lib/useResumeRefetch'
import { useSwipePager } from '../lib/useSwipePager'
import { playerName } from '../lib/scoring'
import { buildDailyLeaders } from '../lib/dailyLeaders'
import { HOME_CARD, HOME_CARD_HEADER, HOME_CARD_LABEL, HOME_CARD_TAIL } from './homeCardTokens'
import HomeCard from './homeCard'

// Daily Leaders (formerly Daily MVPs) — the Home card with one page per trip day
// that has a completed round (practice rounds included and labelled in the header). Swipe left/right (like Weather) to see
// earlier days; it opens on the most recent day and stays after the trip, so by
// the end you can flip through every day. All math is in src/lib/dailyLeaders.js.

const NAVY = '#1B3F6E'
const GREY = '#8a96a3'
const MUTED = '#A9B4C0'
const st = {
  body: { display: 'flex', flexDirection: 'column', gap: 8, padding: 10 },
  tile: { border: '1px solid #E3E8EE', borderRadius: 10, overflow: 'hidden', minWidth: 0 },
  // Light navy title bar across the top of each tile; the title keeps its tone colour.
  titleBar: { background: '#EEF2F7', padding: '5px 12px' },
  inner: { padding: '7px 12px 9px' },
  wideRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  title: { fontSize: 15, fontWeight: 700, lineHeight: 1.3 },
  who: { fontSize: 13, fontWeight: 500, color: '#5A7290', lineHeight: 1.35 },
  bigNum: { fontSize: 24, fontWeight: 700, color: NAVY, flexShrink: 0, lineHeight: 1.1 },
  split: { display: 'grid', gridTemplateColumns: '1fr 1fr' },
  half: { minWidth: 0 },
  halfRight: { minWidth: 0, borderLeft: '1px solid #E3E8EE', paddingLeft: 12 },
  mode: { fontSize: 10, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 },
  num: { fontSize: 18, fontWeight: 700, color: NAVY, lineHeight: 1.25 },
  nm: { fontSize: 12, color: '#5A7290', lineHeight: 1.35 },
  none: { color: MUTED, fontWeight: 500 },
  placeholder: { fontSize: 13, color: GREY, fontStyle: 'italic', padding: '14px 16px' },
  dotsRow: { display: 'flex', justifyContent: 'center', gap: 6, padding: '2px 0 12px' },
  dot: { width: 7, height: 7, borderRadius: '50%', background: '#C4CEDA', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 },
  dotActive: { background: NAVY },
}

// Title colour says what kind of stat it is: green = bragging rights,
// red = the roast, gold = drinks.
const TONE = { good: '#0F6E56', bad: '#A32D2D', drinks: '#92600A' }

// Card layout, top to bottom: full-width tiles for Most Points, Points Defended
// and Most Drinks; Gross | Net split tiles for everything else. Keys are the
// category keys from src/lib/dailyLeaders.js.
const LAYOUT = [
  { type: 'wide', title: 'Most points', tone: 'good', key: 'points' },
  { type: 'wide', title: 'Points defended', tone: 'good', key: 'defended' },
  { type: 'split', title: 'Best score', tone: 'good', gross: 'bestGross', net: 'bestNet' },
  { type: 'split', title: 'Most birdies', tone: 'good', gross: 'birdiesGross', net: 'birdiesNet' },
  { type: 'split', title: 'Most pars', tone: 'good', gross: 'parsGross', net: 'parsNet' },
  { type: 'split', title: 'Most bogeys', tone: 'bad', gross: 'bogeysGross', net: 'bogeysNet' },
  { type: 'split', title: 'Most doubles or worse', tone: 'bad', gross: 'doublesGross', net: 'doublesNet' },
  { type: 'split', title: 'Worst round', tone: 'bad', gross: 'worstGross', net: 'worstNet' },
  { type: 'wide', title: 'Most drinks', tone: 'drinks', key: 'drinks' },
]

const firstOf = name => name.trim().split(/\s+/)[0]

// "Jeff Nelson" → "Jeff N." (a single-word name stays as is).
function firstAndInitial(name) {
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0]
}

// Winners show by first name, A–Z, comma-separated ("Jeff, Jon, Owen"). A player
// whose first name is shared with someone else on the trip also gets their last
// initial ("Mike S., Mike T."), so no name is ambiguous. Same rule for one winner.
function winnersLabel(cat, nameById) {
  const names = (cat?.leader?.ids || []).map(id => nameById.get(id)).filter(Boolean).sort((a, b) => a.localeCompare(b))
  if (names.length === 0) return null
  const firstCounts = new Map()
  for (const n of nameById.values()) { const f = firstOf(n).toLowerCase(); firstCounts.set(f, (firstCounts.get(f) || 0) + 1) }
  return names.map(n => (firstCounts.get(firstOf(n).toLowerCase()) > 1 ? firstAndInitial(n) : firstOf(n))).join(', ')
}

function WideTile({ title, tone, cat, nameById }) {
  const who = winnersLabel(cat, nameById)
  return (
    <div style={st.tile}>
      <div style={{ ...st.titleBar, ...st.title, color: TONE[tone] }}>{title}</div>
      <div style={{ ...st.inner, ...st.wideRow }}>
        <div style={{ ...st.who, minWidth: 0, ...(who ? null : st.none) }}>{who || 'None'}</div>
        <div style={{ ...st.bigNum, ...(who ? null : st.none) }}>{who ? cat.format(cat.leader.value) : '—'}</div>
      </div>
    </div>
  )
}

function SplitHalf({ mode, cat, nameById, right }) {
  const who = winnersLabel(cat, nameById)
  return (
    <div style={right ? st.halfRight : st.half}>
      <div style={st.mode}>{mode}</div>
      <div style={{ ...st.num, ...(who ? null : st.none) }}>{who ? cat.format(cat.leader.value) : '—'}</div>
      <div style={{ ...st.nm, ...(who ? null : st.none) }}>{who || 'None'}</div>
    </div>
  )
}

function SplitTile({ title, tone, gross, net, nameById }) {
  return (
    <div style={st.tile}>
      <div style={{ ...st.titleBar, ...st.title, color: TONE[tone] }}>{title}</div>
      <div style={{ ...st.inner, ...st.split }}>
        <SplitHalf mode="Gross" cat={gross} nameById={nameById} />
        <SplitHalf mode="Net" cat={net} nameById={nameById} right />
      </div>
    </div>
  )
}

function DayTiles({ day, nameById }) {
  const byKey = new Map(day.leaders.map(c => [c.key, c]))
  return (
    <div style={st.body}>
      {LAYOUT.map(t => t.type === 'wide'
        ? <WideTile key={t.key} title={t.title} tone={t.tone} cat={byKey.get(t.key)} nameById={nameById} />
        : <SplitTile key={t.title} title={t.title} tone={t.tone} gross={byKey.get(t.gross)} net={byKey.get(t.net)} nameById={nameById} />)}
    </div>
  )
}

function dayLabel(day) {
  const when = day.dayNumber
    ? `Day ${day.dayNumber}`
    : new Date(`${day.date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const what = day.roundCount >= 2 ? `${day.roundCount} rounds` : day.courseName
  // Practice days say so up top: "Practice" when every round was practice,
  // "incl. practice" when the day mixed practice and tournament rounds.
  const practice = day.practice === 'all' ? 'Practice' : day.practice === 'some' ? 'incl. practice' : null
  return [when, day.practice === 'all' ? practice : null, what, day.practice === 'some' ? practice : null].filter(Boolean).join(' · ')
}

export default function DailyLeadersCard({ tripId, tripStartDate, allowance = 100 }) {
  const [data, setData] = useState(null)
  const [tick, setTick] = useState(0)             // bumped by realtime changes to refetch
  const [resumeTick, setResumeTick] = useState(0) // bumped on background → resume
  // Session-only swipe, remembered with the day count it was made at: when a new
  // day completes, the count changes and the card jumps to the newest day.
  const [pick, setPick] = useState(null) // { index, count } | null
  useResumeRefetch(() => setResumeTick(t => t + 1))

  // Live refetch on any score / drink / roster / handicap / round change (debounced).
  useEffect(() => {
    let t = null
    const bump = () => { if (t) clearTimeout(t); t = setTimeout(() => setTick(x => x + 1), 400) }
    const ch = supabase.channel(uniqueChannelName(`leaders-${tripId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drinks' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_players', filter: `trip_id=eq.${tripId}` }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds', filter: `trip_id=eq.${tripId}` }, bump)
      .subscribe()
    return () => { if (t) clearTimeout(t); supabase.removeChannel(ch) }
  }, [tripId, resumeTick])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [roundsRes, tpRes] = await Promise.all([
        supabase.from('rounds').select('*').eq('trip_id', tripId),
        supabase.from('trip_players').select('id, user_id, first_name, last_name, guest_name, handicap_index, team_id').eq('trip_id', tripId),
      ])
      const rounds = roundsRes.data || []
      const tripPlayers = tpRes.data || []
      const roundIds = rounds.map(r => r.id)
      let scores = [], pairings = [], pairingPlayers = [], playerRounds = [], drinks = []
      if (roundIds.length) {
        const [sc, pr, prr, dr] = await Promise.all([
          supabase.from('scores').select('round_id, hole_number, trip_player_id, gross_score').in('round_id', roundIds),
          supabase.from('pairings').select('id, round_id, pairing_number, team1_id, team2_id').in('round_id', roundIds),
          supabase.from('player_rounds').select('trip_player_id, round_id, tee_name, slope, rating, par').in('round_id', roundIds),
          supabase.from('drinks').select('round_id, trip_player_id, count').in('round_id', roundIds),
        ])
        scores = sc.data || []; pairings = pr.data || []; playerRounds = prr.data || []; drinks = dr.data || []
        const pairIds = pairings.map(p => p.id)
        if (pairIds.length) {
          const pp = await supabase.from('pairing_players').select('id, pairing_id, trip_player_id, team_slot').in('pairing_id', pairIds)
          pairingPlayers = pp.data || []
        }
      }
      const userIds = tripPlayers.map(p => p.user_id).filter(Boolean)
      const profileMap = {}
      if (userIds.length) {
        const { data: profs } = await supabase.from('profiles').select('id, display_name').in('id', userIds)
        ;(profs || []).forEach(p => { profileMap[p.id] = p.display_name })
      }
      if (!cancelled) setData({ rounds, scores, pairings, pairingPlayers, tripPlayers, playerRounds, drinks, profileMap })
    }
    load()
    return () => { cancelled = true }
  }, [tripId, tick, resumeTick])

  const days = useMemo(() => (data ? buildDailyLeaders(data, { allowance, tripStartDate }) : []), [data, allowance, tripStartDate])
  const nameById = useMemo(() => new Map((data?.tripPlayers || []).map(tp => [tp.id, playerName(tp, data.profileMap)])), [data])

  const latest = Math.max(0, days.length - 1)
  const activeIndex = (pick && pick.count === days.length && pick.index >= 0 && pick.index < days.length) ? pick.index : latest
  const choose = i => setPick({ index: i, count: days.length })
  const { ref: pagerRef, onPointerDown, onPointerUp } = useSwipePager({ count: days.length, index: activeIndex, onIndex: choose })

  if (days.length === 0) {
    return (
      <HomeCard title="Daily Leaders">
        <div style={st.placeholder}>Leaders will appear after the first round is complete</div>
      </HomeCard>
    )
  }

  return (
    <div
      ref={pagerRef}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      style={{ ...HOME_CARD, userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'pan-y' }}
    >
      {/* One full-width face per day; the track slides to the active one. */}
      <div style={{ display: 'flex', transform: `translateX(-${activeIndex * 100}%)`, transition: 'transform 260ms ease-out', willChange: 'transform' }}>
        {days.map(day => (
          <div key={day.date} style={{ flex: '0 0 100%', minWidth: 0 }}>
            <div style={HOME_CARD_HEADER}>
              <span style={HOME_CARD_LABEL}>Daily Leaders</span>
              <span style={HOME_CARD_TAIL}>{dayLabel(day)}</span>
            </div>
            <DayTiles day={day} nameById={nameById} />
          </div>
        ))}
      </div>
      {days.length > 1 && (
        <div style={st.dotsRow}>
          {days.map((d, i) => (
            <button
              key={d.date}
              type="button"
              aria-label={`Show day ${i + 1} of ${days.length}`}
              aria-current={i === activeIndex ? 'true' : undefined}
              onClick={() => choose(i)}
              style={{ ...st.dot, ...(i === activeIndex ? st.dotActive : null) }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
