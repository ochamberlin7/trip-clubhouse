import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// ── Getting Started checklist ────────────────────────────────────
// Two distinct parts on the Home tab:
//
//  1. PERSISTENT items — re-computed from live data on every load. Never stored
//     as "done", so an item reappears if its underlying data is cleared later
//     (e.g. someone blanks their phone). The card shows only if at least one
//     persistent item is incomplete.
//
//  2. FIRST-LOGIN section — one-time tips + welcome tour, shown once per
//     trip_player. Tracked by trip_players.onboarding_completed, which is flipped
//     true immediately after the first display (NOT contingent on acting on
//     anything). This flag gates ONLY this section — never the persistent items.
//
// Role-aware: everyone with a player row sees the member items (their own
// contact/flight info); commissioners additionally see trip-setup items.

const FLIGHT_FIELDS = [
  'arrive_date', 'arrive_time', 'arrive_airport', 'flight_number_in',
  'depart_date', 'depart_time', 'depart_airport', 'flight_number_out',
]

const nonEmpty = (v) => !!(v != null && String(v).trim())

// A round has a real course once a course id is set or the name is a real name
// (not the "TBD" placeholder the wizard writes when no course was picked).
function hasRealCourse(r) {
  if (r.golfcourse_id) return true
  const n = (r.course_name || '').trim()
  return !!n && n.toUpperCase() !== 'TBD'
}

const styles = {
  // Centered modal overlay — matches the app's backdrop convention (ScoringTab).
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { position: 'relative', background: '#FFFFFF', border: '1px solid #DDE3EA', borderRadius: '14px', padding: 0, overflow: 'hidden', width: '100%', maxWidth: 400, maxHeight: 'calc(100vh - 40px)', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.25)' },
  header: { background: '#1B3F6E', color: '#fff', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', padding: '12px 40px 12px 14px' },
  close: { position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 16, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
  body: { padding: '6px 14px 12px' },
  sectionLabel: { fontSize: '10px', fontWeight: 800, color: '#7A8FA6', textTransform: 'uppercase', letterSpacing: '1px', margin: '12px 0 4px' },
  subLabel: { fontSize: '12px', fontWeight: 800, color: '#1B3F6E', margin: '12px 0 2px' },
  item: { display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0', borderBottom: '1px solid #E8EDF3' },
  itemLast: { borderBottom: 'none' },
  dot: { width: '18px', height: '18px', borderRadius: '50%', border: '2px solid #C6D0DC', flexShrink: 0, marginTop: '1px' },
  itemText: { fontSize: '14px', fontWeight: 600, color: '#0D1B2A', lineHeight: 1.3 },
  itemHint: { fontSize: '11px', color: '#7A8FA6', marginTop: '1px' },
  tipButton: { display: 'flex', alignItems: 'center', gap: '8px', width: '100%', textAlign: 'left', background: '#1B3F6E', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 12px', margin: '6px 0', fontSize: '13px', fontWeight: 700, lineHeight: 1.3, cursor: 'pointer', fontFamily: 'inherit' },
  tipButtonArrow: { marginLeft: 'auto', fontWeight: 800, flexShrink: 0 },
}

function Item({ label, hint, isLast }) {
  return (
    <div style={{ ...styles.item, ...(isLast ? styles.itemLast : null) }}>
      <span style={styles.dot} />
      <span>
        <div style={styles.itemText}>{label}</div>
        {hint && <div style={styles.itemHint}>{hint}</div>}
      </span>
    </div>
  )
}

export default function GettingStartedCard({ trip, rounds = [], userId, isCommissioner, onOpenMenuPage }) {
  const [state, setState] = useState({ status: 'loading' })
  const [dismissed, setDismissed] = useState(false) // session-only; never persisted
  const flippedRef = useRef(false) // flip onboarding_completed at most once

  // Load the current user's player row + flights row, and (for commissioners)
  // whether every player has a handicap index.
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!trip?.id || !userId) { setState({ status: 'ready', playerRow: null }); return }

      const { data: playerRow } = await supabase
        .from('trip_players')
        .select('id, phone, email, onboarding_completed')
        .eq('trip_id', trip.id).eq('user_id', userId).maybeSingle()

      let flight = null
      if (playerRow) {
        const { data: fl } = await supabase
          .from('flights').select('*')
          .eq('trip_id', trip.id).eq('trip_player_id', playerRow.id).maybeSingle()
        flight = fl || null
      }

      let allHandicaps = true
      if (isCommissioner) {
        const { data: hcps } = await supabase
          .from('trip_players').select('handicap_index').eq('trip_id', trip.id)
        allHandicaps = (hcps || []).length > 0 && (hcps || []).every(p => p.handicap_index != null)
      }

      if (cancelled) return
      setState({ status: 'ready', playerRow, flight, allHandicaps })
    }
    load()
    return () => { cancelled = true }
  }, [trip?.id, userId, isCommissioner])

  // Flip the one-time flag as soon as the first-login view is shown — not
  // contingent on completing anything. Runs unconditionally (Rules of Hooks);
  // the guards inside decide whether to write.
  const pr = state.status === 'ready' ? state.playerRow : null
  const isFirstLogin = !!pr && pr.onboarding_completed === false
  useEffect(() => {
    if (!isFirstLogin || flippedRef.current || !pr?.id) return
    flippedRef.current = true
    supabase.from('trip_players').update({ onboarding_completed: true }).eq('id', pr.id).then(() => {})
  }, [isFirstLogin, pr?.id])

  if (state.status !== 'ready') return null
  const { playerRow, flight, allHandicaps } = state

  // ── Persistent items (computed live, never stored as done) ──
  // Tracked items auto-complete from data and drive whether the modal reappears.
  // Flight info is satisfied by flight fields being filled OR the member marking
  // themselves driving — it does NOT require a separate "driving answered" step
  // (that item was removed).
  const flightInfoFilled = !!flight && (flight.is_driving === true || FLIGHT_FIELDS.some(k => nonEmpty(flight[k])))
  const phoneDone = !!playerRow && nonEmpty(playerRow.phone)

  const playable = rounds.filter(r => r.round_type !== 'none')
  const withCourse = playable.filter(hasRealCourse)
  // Companion to the tee-time check: a playable round with a tee time but no
  // course (course_name 'TBD'/null) would slip past the course-scoped tee-time
  // item, so flag missing courses directly.
  const coursesAssigned = playable.length === 0 || playable.every(hasRealCourse)
  const teeTimesSet = withCourse.length === 0 || withCourse.every(r => nonEmpty(r.tee_time_1))

  // Commissioner rows: three first-login-only setup tips (no reliable "done"
  // signal — shown once, gated by onboarding_completed like the welcome tip),
  // followed by the tracked items which reappear live until complete.
  const commissionerRows = []
  if (isCommissioner) {
    if (isFirstLogin) {
      commissionerRows.push({ label: 'Name your teams', hint: 'Menu → Commissioner Tools' })
      commissionerRows.push({ label: 'Set your handicap allowance %', hint: 'Menu → Commissioner Tools' })
      commissionerRows.push({ label: 'Send your invite link', hint: 'Menu → Commissioner Tools' })
    }
    if (!allHandicaps) commissionerRows.push({ label: 'Set every player’s handicap index', hint: 'Menu → Players' })
    if (!coursesAssigned) commissionerRows.push({ label: 'Assign a course to every round', hint: 'Menu → Schedule & Courses' })
    if (!teeTimesSet) commissionerRows.push({ label: 'Add tee times to your rounds', hint: 'Tee Times tab' })
  }

  // Member rows: tracked items, shown only while incomplete.
  const memberRows = []
  if (playerRow) {
    if (!phoneDone) memberRows.push({ label: 'Add your phone number', hint: 'Menu → Players → your card' })
    if (!flightInfoFilled) memberRows.push({ label: 'Add your flight info', hint: 'Menu → Flights' })
  }

  // Only the tracked items decide whether the modal reappears — the guidance
  // tips never nag on their own once first login has passed.
  const trackedIncomplete =
    (playerRow ? (!phoneDone ? 1 : 0) + (!flightInfoFilled ? 1 : 0) : 0) +
    (isCommissioner ? (!allHandicaps ? 1 : 0) + (!coursesAssigned ? 1 : 0) + (!teeTimesSet ? 1 : 0) : 0)
  const hasToDo = commissionerRows.length > 0 || memberRows.length > 0

  // Tracked items gate the modal on return visits; on first login it shows once
  // regardless so the welcome tip appears.
  if (!isFirstLogin && trackedIncomplete === 0) return null

  // Session-only dismissal — closing just hides it for now. It never persists,
  // so it reappears next login while the trigger conditions still hold.
  if (dismissed) return null

  return (
    <GettingStartedView
      isFirstLogin={isFirstLogin}
      hasToDo={hasToDo}
      commissionerRows={commissionerRows}
      memberRows={memberRows}
      onHomeScreen={() => { setDismissed(true); onOpenMenuPage?.('app-info') }}
      onClose={() => setDismissed(true)}
    />
  )
}

// Presentational modal — split out from the data-fetching container above so
// the view is easy to reason about (and render in isolation).
function GettingStartedView({ isFirstLogin, hasToDo, commissionerRows = [], memberRows = [], onHomeScreen, onClose }) {
  return (
    <div style={styles.overlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div style={styles.card} onClick={e => e.stopPropagation()}>
        <button style={styles.close} aria-label="Close" onClick={onClose}>✕</button>
        <div style={styles.header}>Getting Started</div>
        <div style={styles.body}>

          {/* First things first — one-time tip (can't detect install, so it
              only shows on first login). */}
          {isFirstLogin && (
            <>
              <div style={styles.sectionLabel}>First things first</div>
              <button style={styles.tipButton} onClick={onHomeScreen}>
                <span>Add this app to your phone’s home screen for quick access</span>
                <span style={styles.tipButtonArrow}>Tap here →</span>
              </button>
            </>
          )}

          {/* To Do — live checklist, grouped by role. */}
          {hasToDo && <div style={styles.sectionLabel}>To Do</div>}

          {commissionerRows.length > 0 && (
            <>
              <div style={styles.subLabel}>As Commissioner</div>
              {commissionerRows.map((it, i) => (
                <Item key={it.label} label={it.label} hint={it.hint} isLast={i === commissionerRows.length - 1} />
              ))}
            </>
          )}

          {memberRows.length > 0 && (
            <>
              <div style={styles.subLabel}>As Member</div>
              {memberRows.map((it, i) => (
                <Item key={it.label} label={it.label} hint={it.hint} isLast={i === memberRows.length - 1} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
