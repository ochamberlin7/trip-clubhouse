// Commissioner Tools → Trip Dates: change the trip's dates after it's created.
// Rounds, meals, lodging and the day-by-day schedule move with the trip — the
// rule lives in src/lib/tripDates.js (planTripDateChange); this screen only
// shows the plan and saves it in one transaction (change_trip_dates RPC).
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import RangeCalendar from './RangeCalendar'
import { rowUI, SaveLink } from './DisclosureRow'
import { mealTypeLabel } from '../lib/meals'
import { planTripDateChange, rpcArgsForPlan, tripLength, dayNumber, nextRange } from '../lib/tripDates'

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmt(iso) {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  return isNaN(d) ? '—' : `${WD[d.getDay()]}, ${MO[d.getMonth()]} ${d.getDate()}`
}
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

const ui = {
  current: { fontSize: 13.5, color: '#2C3E50', margin: '2px 0 12px' },
  rangeText: { marginTop: 10, fontFamily: 'var(--font-serif)', fontSize: 18, color: '#0D1B2A' },
  choiceRow: { display: 'flex', gap: 8, marginTop: 6 },
  choice: { flex: 1, padding: '10px 8px', borderRadius: 8, border: '1px solid #DDE3EA', background: '#EEF2F6', color: '#2C3E50', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1.3 },
  choiceOn: { background: '#1B3F6E', borderColor: '#1B3F6E', color: '#fff' },
  moveRow: { display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '6px 0', borderBottom: '1px solid #EEF1F4', color: '#0D1B2A' },
  moveName: { fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 },
  moveDates: { color: '#5E6E80', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  warn: { fontSize: 12.5, color: '#7A4B00', lineHeight: 1.5, marginTop: 10, background: '#FFF4DC', borderRadius: 8, padding: '9px 11px' },
}

function roundName(r) { return (r.scorecard_name || r.club_name || r.course_name || 'Round').trim() }
function mealName(m) { return [mealTypeLabel(m), m.location].filter(Boolean).join(' · ') }
function stayName(s) { return (s.hotel_name || 'Lodging').trim() }

export default function TripDatesBody({ tripId, startDate, endDate, onSaved, onClose }) {
  const [data, setData] = useState(null) // { rounds, meals, stays, schedule, scored, flights }
  const [loadErr, setLoadErr] = useState('')
  const [newStart, setNewStart] = useState(startDate || '')
  const [newEnd, setNewEnd] = useState(endDate || '')
  const [anchor, setAnchor] = useState('start')
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [rRes, mRes, sRes, tRes, fRes] = await Promise.all([
        supabase.from('rounds').select('id, date, round_number, course_name, club_name, scorecard_name').eq('trip_id', tripId).order('date').order('round_number'),
        supabase.from('meals').select('id, day, meal_type, custom_label, location, meal_time').eq('trip_id', tripId).order('day'),
        supabase.from('stays').select('id, hotel_name, check_in, check_out').eq('trip_id', tripId).order('check_in'),
        supabase.from('trips').select('schedule').eq('id', tripId).maybeSingle(),
        supabase.from('flights').select('id', { count: 'exact', head: true }).eq('trip_id', tripId),
      ])
      if (rRes.error || mRes.error || sRes.error) {
        if (!cancelled) setLoadErr('Couldn’t load the schedule. Check your signal and try again.')
        return
      }
      const rounds = rRes.data || []
      let scored = false
      if (rounds.length) {
        const { count, error } = await supabase.from('scores').select('round_id', { count: 'exact', head: true }).in('round_id', rounds.map(r => r.id))
        scored = error ? true : (count || 0) > 0
      }
      if (!cancelled) {
        setData({
          rounds, meals: mRes.data || [], stays: sRes.data || [],
          schedule: tRes.data?.schedule || [], scored, flights: fRes.count || 0,
        })
      }
    })()
    return () => { cancelled = true }
  }, [tripId])

  const plan = useMemo(() => {
    if (!data || !newStart || !newEnd) return null
    return planTripDateChange({
      oldStart: startDate, oldEnd: endDate, newStart, newEnd, anchor,
      rounds: data.rounds, meals: data.meals, stays: data.stays, schedule: data.schedule,
      roundLabel: roundName, mealLabel: mealName, stayLabel: stayName,
    })
  }, [data, startDate, endDate, newStart, newEnd, anchor])

  if (loadErr) return <div style={rowUI.err}>{loadErr}</div>
  if (!data) return <div style={rowUI.note}>Checking…</div>
  if (data.scored) {
    return <div style={rowUI.note}>Scores have been entered, so the trip dates are locked.</div>
  }

  const oldLen = tripLength(startDate, endDate)
  const newLen = newStart && newEnd ? tripLength(newStart, newEnd) : 0
  const diff = newLen - oldLen
  const lengthChanged = !!(newStart && newEnd) && diff !== 0
  const longer = diff > 0
  const n = Math.abs(diff)

  function pick(iso) {
    const [a, b] = nextRange(newStart, newEnd, iso)
    setNewStart(a); setNewEnd(b); setErr(''); setTouched(true)
  }

  async function save() {
    setErr('')
    if (!plan || !plan.ok) { setErr(plan?.error || 'Pick a start and end date.'); return }
    if (plan.clampedItems.length) {
      const ok = window.confirm(`${plural(plan.clampedItems.length, 'item')} won’t fit in the new dates and will be moved to the nearest day. Continue?`)
      if (!ok) return
    }
    setSaving(true)
    const { error } = await supabase.rpc('change_trip_dates', rpcArgsForPlan(tripId, newStart, newEnd, plan))
    setSaving(false)
    if (error) {
      const msg = error.message || ''
      if (/change_trip_dates/i.test(msg) && /(find|exist)/i.test(msg)) setErr('This needs a database update first (migration 20260677).')
      else if (/locked/i.test(msg)) setErr('Scores have been entered, so the trip dates are locked.')
      else setErr(`Save failed: ${msg || 'unknown error'}`)
      return
    }
    setSaved(true); setTimeout(() => setSaved(false), 2000)
    onSaved?.(newStart, newEnd)
    onClose?.()
  }

  const moves = plan?.ok ? [
    ...plan.rounds.map(m => ({ key: `r${m.id}`, name: roundName(data.rounds.find(r => r.id === m.id) || {}), from: fmt(m.from), to: fmt(m.to) })),
    ...plan.meals.map(m => ({ key: `m${m.id}`, name: mealName(data.meals.find(x => x.id === m.id) || {}), from: fmt(m.from), to: fmt(m.to) })),
    ...plan.stays.map(m => ({ key: `s${m.id}`, name: stayName(data.stays.find(x => x.id === m.id) || {}), from: `${fmt(m.from.check_in)} – ${fmt(m.from.check_out)}`, to: `${fmt(m.to.check_in)} – ${fmt(m.to.check_out)}` })),
  ] : []
  const nothingScheduled = !data.rounds.length && !data.meals.length && !data.stays.length

  return (
    <>
      <div style={ui.current}>Current: {fmt(startDate)} – {fmt(endDate)} · {plural(oldLen, 'day')}</div>
      <RangeCalendar startDate={newStart} endDate={newEnd} onSelect={pick} markStart={startDate} markEnd={endDate} />
      <div style={ui.rangeText}>
        {newStart
          ? (newEnd ? `${fmt(newStart)} – ${fmt(newEnd)} · ${plural(newLen, 'day')}` : `${fmt(newStart)} – select end date`)
          : 'Tap a date to set the new start'}
      </div>

      {lengthChanged && (
        <>
          <div style={rowUI.fieldLabel}>{longer ? `Add ${plural(n, 'day')}` : `Cut ${plural(n, 'day')}`}</div>
          <div style={ui.choiceRow}>
            <button type="button" style={{ ...ui.choice, ...(anchor === 'start' ? ui.choiceOn : null) }} onClick={() => setAnchor('start')}>
              {longer ? 'At the end' : 'From the end'}
            </button>
            <button type="button" style={{ ...ui.choice, ...(anchor === 'end' ? ui.choiceOn : null) }} onClick={() => setAnchor('end')}>
              {longer ? 'At the start' : 'From the start'}
            </button>
          </div>
          <div style={rowUI.note}>
            {anchor === 'start'
              ? `Day 1 stays Day 1. ${longer ? 'New days go after the last day.' : `The last ${plural(n, 'day')} of the trip ${n === 1 ? 'is' : 'are'} dropped.`}`
              : `The last day stays the last day. ${longer ? 'New days go before Day 1.' : `The first ${plural(n, 'day')} of the trip ${n === 1 ? 'is' : 'are'} dropped.`}`}
          </div>
        </>
      )}

      {plan?.ok && (
        <>
          <div style={rowUI.fieldLabel}>What moves</div>
          {nothingScheduled && <div style={rowUI.note}>Nothing is scheduled yet — only the trip dates change.</div>}
          {!nothingScheduled && moves.length === 0 && <div style={rowUI.note}>Everything already scheduled stays on the same date.</div>}
          {moves.map(m => (
            <div key={m.key} style={ui.moveRow}>
              <span style={ui.moveName}>{m.name}</span>
              <span style={ui.moveDates}>{m.from} → {m.to}</span>
            </div>
          ))}

          {plan.clampedItems.length > 0 && (
            <div style={ui.warn}>
              <strong>Won’t fit in the new dates:</strong>{' '}
              {plan.clampedItems.map(c => `${c.label} (moved to Day ${dayNumber(c.to, newStart)}${c.noNights ? ', no nights left' : ''})`).join(', ')}.
              {' '}Nothing is deleted — remove or edit these in Schedule &amp; Courses if you don’t need them.
            </div>
          )}
          {plan.addedDays.length > 0 && (
            <div style={rowUI.info}>
              New {plan.addedDays.length === 1 ? 'day' : 'days'} ({plan.addedDays.map(fmt).join(', ')}) start as “Not Scheduled Yet” — add rounds or meals in Schedule &amp; Courses.
            </div>
          )}
          {(data.stays.length > 0 || data.flights > 0) && (
            <div style={rowUI.note}>
              {data.stays.length > 0 && 'This only changes dates in the app — update your actual hotel booking too. '}
              {data.flights > 0 && 'Player flights aren’t changed; each player updates their own.'}
            </div>
          )}
        </>
      )}

      <SaveLink onClick={save} saving={saving} saved={saved} error={err || (touched && plan && !plan.ok ? plan.error : '')} label="Change dates" />
    </>
  )
}
