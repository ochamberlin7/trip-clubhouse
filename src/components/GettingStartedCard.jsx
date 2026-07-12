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
  item: { display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0', borderBottom: '1px solid #E8EDF3' },
  itemLast: { borderBottom: 'none' },
  dot: { width: '18px', height: '18px', borderRadius: '50%', border: '2px solid #C6D0DC', flexShrink: 0, marginTop: '1px' },
  itemText: { fontSize: '14px', fontWeight: 600, color: '#0D1B2A', lineHeight: 1.3 },
  itemHint: { fontSize: '11px', color: '#7A8FA6', marginTop: '1px' },
  tipDivider: { borderTop: '1px solid #DDE3EA', margin: '10px -14px 0', padding: '2px 14px 0' },
  tip: { display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '6px 0', fontSize: '13px', color: '#334', lineHeight: 1.35 },
  tipBullet: { color: '#1B3F6E', fontWeight: 800, flexShrink: 0 },
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

export default function GettingStartedCard({ trip, rounds = [], userId, isCommissioner }) {
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
  const items = []
  if (playerRow) {
    const drivingAnswered = !!flight // a flights row exists only after an explicit answer
    const flightInfoFilled = !!flight && (flight.is_driving === true || FLIGHT_FIELDS.some(k => nonEmpty(flight[k])))
    items.push({ done: nonEmpty(playerRow.phone), label: 'Add your phone number', hint: 'Menu → Players → your card' })
    items.push({ done: nonEmpty(playerRow.email), label: 'Add your email', hint: 'Menu → Players → your card' })
    items.push({ done: flightInfoFilled, label: 'Add your flight info', hint: 'Menu → Flights (or mark yourself driving)' })
    items.push({ done: drivingAnswered, label: 'Answer whether you’re driving', hint: 'Menu → Flights → Driving?' })
  }
  if (isCommissioner) {
    const playable = rounds.filter(r => r.round_type !== 'none')
    const withCourse = playable.filter(hasRealCourse)
    // Companion to the tee-time check: a playable round with a tee time but no
    // course would otherwise slip past the (course-scoped) tee-time item, so
    // flag missing courses directly.
    const coursesAssigned = playable.length === 0 || playable.every(hasRealCourse)
    const teeTimesSet = withCourse.length === 0 || withCourse.every(r => nonEmpty(r.tee_time_1))
    items.push({ done: allHandicaps, label: 'Set every player’s handicap index', hint: 'Menu → Players' })
    items.push({ done: coursesAssigned, label: 'Assign a course to each round', hint: 'Menu → Courses' })
    items.push({ done: teeTimesSet, label: 'Add tee times to your rounds', hint: 'Tee Times tab' })
  }

  const incomplete = items.filter(i => !i.done)

  // Persistent items gate the card on return visits; the first-login section can
  // keep the card up once even if everything persistent is already done.
  if (!isFirstLogin && incomplete.length === 0) return null

  // Session-only dismissal — closing just hides it for now. It never persists,
  // so it reappears next login while the trigger conditions still hold.
  if (dismissed) return null

  return (
    <div style={styles.overlay} role="dialog" aria-modal="true" onClick={() => setDismissed(true)}>
      <div style={styles.card} onClick={e => e.stopPropagation()}>
        <button style={styles.close} aria-label="Close" onClick={() => setDismissed(true)}>✕</button>
        <div style={styles.header}>Getting Started</div>
        <div style={styles.body}>
        {incomplete.length > 0 ? (
          <>
            <div style={styles.sectionLabel}>To do</div>
            {incomplete.map((it, i) => (
              <Item key={it.label} label={it.label} hint={it.hint} isLast={i === incomplete.length - 1} />
            ))}
          </>
        ) : (
          isFirstLogin && <div style={{ ...styles.itemText, padding: '8px 0' }}>You’re all set — nice work! 🎉</div>
        )}

        {isFirstLogin && (
          <div style={styles.tipDivider}>
            <div style={styles.sectionLabel}>Tips to get going</div>
            {isCommissioner ? (
              <>
                <div style={styles.tip}><span style={styles.tipBullet}>•</span><span>Name your teams so the leaderboard reads nicely.</span></div>
                <div style={styles.tip}><span style={styles.tipBullet}>•</span><span>Set your handicap allowance % for the tournament.</span></div>
                <div style={styles.tip}><span style={styles.tipBullet}>•</span><span>Send your invite link so everyone can join.</span></div>
              </>
            ) : (
              <div style={styles.tip}><span style={styles.tipBullet}>•</span><span>Fill in your details above so your commissioner has what they need.</span></div>
            )}
            <div style={styles.tip}><span style={styles.tipBullet}>•</span><span>Take a look around: <strong>Rules</strong> for the format, <strong>Score</strong> to enter your card, and <strong>Leaderboard</strong> to track standings.</span></div>
            <div style={styles.tip}><span style={styles.tipBullet}>•</span><span>Add this app to your phone’s home screen for quick access — see <strong>Menu → App Info</strong> for step-by-step instructions.</span></div>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
