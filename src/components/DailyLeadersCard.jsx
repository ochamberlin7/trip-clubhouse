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
const st = {
  row: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 16px', borderBottom: '1px solid #e5e7eb' },
  rowLast: { borderBottom: 'none' },
  labelCol: { minWidth: 84, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 1 },
  label: { fontSize: 10, color: GREY, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 },
  mode: { fontSize: 9, color: '#A9B4C0', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 },
  names: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  name: { fontSize: 13, fontWeight: 600, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  none: { fontSize: 13, color: GREY },
  tie: { fontSize: 11, color: GREY, fontWeight: 500 },
  value: { fontSize: 13, fontWeight: 700, color: NAVY, textAlign: 'right', flexShrink: 0 },
  placeholder: { fontSize: 13, color: GREY, fontStyle: 'italic', padding: '14px 16px' },
  dotsRow: { display: 'flex', justifyContent: 'center', gap: 6, padding: '8px 0 12px' },
  dot: { width: 7, height: 7, borderRadius: '50%', background: '#C4CEDA', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 },
  dotActive: { background: NAVY },
}

// Winners stack one per line (full names); a tie adds a small "Tied" / "3-way tie"
// note under them. The value shows once, on the right. No winner → "None".
function LeaderRow({ cat, nameById, last }) {
  const lead = cat.leader
  const people = lead ? lead.ids.map(id => nameById.get(id)).filter(Boolean).sort((a, b) => a.localeCompare(b)) : []
  const tieNote = people.length === 2 ? 'Tied' : people.length > 2 ? `${people.length}-way tie` : null
  return (
    <div style={{ ...st.row, ...(last ? st.rowLast : null) }}>
      <span style={st.labelCol}>
        <span style={st.label}>{cat.label}</span>
        {cat.mode && <span style={st.mode}>{cat.mode}</span>}
      </span>
      <span style={st.names}>
        {people.length
          ? people.map(n => <span key={n} style={st.name}>{n}</span>)
          : <span style={st.none}>None</span>}
        {tieNote && <span style={st.tie}>{tieNote}</span>}
      </span>
      <span style={st.value}>{lead ? cat.format(lead.value) : ''}</span>
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
            {day.leaders.map((cat, i) => (
              <LeaderRow key={cat.key} cat={cat} nameById={nameById} last={i === day.leaders.length - 1} />
            ))}
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
