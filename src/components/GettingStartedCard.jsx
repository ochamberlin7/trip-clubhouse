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
  header: { position: 'relative', background: '#1B3F6E', color: '#fff', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', padding: '12px 40px 12px 14px' },
  // Absolutely centered within the header (the blue banner): top:50% + translateY
  // vertically centers the circle to the banner; the flexbox centers the ✕ glyph
  // within the circle. lineHeight:0 removes the glyph's line-box bias so it's
  // optically centered rather than sitting slightly low.
  close: { position: 'absolute', top: '50%', right: 8, transform: 'translateY(-50%)', width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 15, lineHeight: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
  body: { padding: '6px 14px 12px' },
  sectionLabel: { fontSize: '10px', fontWeight: 800, color: '#7A8FA6', textTransform: 'uppercase', letterSpacing: '1px', margin: '12px 0 4px' },
  subLabel: { fontSize: '12px', fontWeight: 800, color: '#1B3F6E', margin: '12px 0 2px' },
  item: { display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0', borderBottom: '1px solid #E8EDF3' },
  // Turn the row into a full-width tappable button without changing its look
  // (overrides the global button reset: transparent bg, no border/rounding).
  itemButton: { width: '100%', background: 'none', border: 'none', borderRadius: 0, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', font: 'inherit' },
  itemBody: { flex: 1, minWidth: 0 },
  itemChevron: { flexShrink: 0, alignSelf: 'center', color: '#7A8FA6', fontSize: '20px', fontWeight: 700, lineHeight: 1, marginLeft: '4px' },
  itemLast: { borderBottom: 'none' },
  dot: { width: '18px', height: '18px', borderRadius: '50%', border: '2px solid #C6D0DC', flexShrink: 0, marginTop: '1px' },
  itemText: { fontSize: '14px', fontWeight: 600, color: '#0D1B2A', lineHeight: 1.3 },
  itemHint: { fontSize: '11px', color: '#7A8FA6', marginTop: '1px' },
  tipButton: { display: 'flex', alignItems: 'center', gap: '8px', width: '100%', textAlign: 'left', background: '#1B3F6E', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 12px', margin: '6px 0', fontSize: '13px', fontWeight: 700, lineHeight: 1.3, cursor: 'pointer', fontFamily: 'inherit' },
  tipButtonArrow: { marginLeft: 'auto', fontWeight: 800, flexShrink: 0 },
  footer: { display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid #E8EDF3', padding: '11px 14px', cursor: 'pointer', userSelect: 'none' },
  // Restore the native checkbox: the global `input` reset stretches it to 100%
  // width and strips its appearance, which renders it as a full-width bar.
  checkbox: { width: '16px', height: '16px', flexShrink: 0, margin: 0, padding: 0, appearance: 'auto', WebkitAppearance: 'auto', accentColor: '#1B3F6E' },
  footerLabel: { fontSize: '13px', color: '#5A6B7A', whiteSpace: 'nowrap' },
}

// Each item is a button that navigates to the section it describes. The trailing
// chevron signals it's tappable.
function Item({ label, hint, isLast, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ ...styles.item, ...styles.itemButton, ...(isLast ? styles.itemLast : null) }}
    >
      <span style={styles.dot} />
      <span style={styles.itemBody}>
        <div style={styles.itemText}>{label}</div>
        {hint && <div style={styles.itemHint}>{hint}</div>}
      </span>
      <span style={styles.itemChevron} aria-hidden="true">›</span>
    </button>
  )
}

export default function GettingStartedCard({ trip, rounds = [], userId, isCommissioner, onOpenMenuPage, onNavigateTab }) {
  const [state, setState] = useState({ status: 'loading' })
  const [dismissed, setDismissed] = useState(false) // session-only; never persisted
  const [optOut, setOptOut] = useState(false) // "don't remind me again" checkbox
  const flippedRef = useRef(false) // flip onboarding_completed at most once
  // Whether to show the modal is decided ONCE, the first time data is ready after
  // mount (a fresh app load landing on Home). null = undecided; true/false latches
  // the decision so the modal can never re-open in reaction to later data changes.
  const [decidedShow, setDecidedShow] = useState(null)

  // Load the current user's player row + flights row, and (for commissioners)
  // whether every player has a handicap index.
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!trip?.id || !userId) { setState({ status: 'ready', playerRow: null }); return }

      // Prefer the columns including the opt-out flag; if the migration adding
      // it hasn't run yet the query errors, so fall back without it (opt-out
      // then reads as false until the column exists).
      let playerRow = null
      {
        const base = supabase.from('trip_players')
        let res = await base
          .select('id, phone, email, onboarding_completed, getting_started_opted_out')
          .eq('trip_id', trip.id).eq('user_id', userId).maybeSingle()
        if (res.error) {
          res = await supabase.from('trip_players')
            .select('id, phone, email, onboarding_completed')
            .eq('trip_id', trip.id).eq('user_id', userId).maybeSingle()
        }
        playerRow = res.data
      }

      let flight = null
      if (playerRow) {
        const { data: fl } = await supabase
          .from('flights').select('*')
          .eq('trip_id', trip.id).eq('trip_player_id', playerRow.id).maybeSingle()
        flight = fl || null
      }

      let allHandicaps = true
      let playerCount = 0
      if (isCommissioner) {
        const { data: hcps } = await supabase
          .from('trip_players').select('handicap_index').eq('trip_id', trip.id)
        playerCount = (hcps || []).length
        allHandicaps = playerCount > 0 && (hcps || []).every(p => p.handicap_index != null)
      }

      if (cancelled) return
      setState({ status: 'ready', playerRow, flight, allHandicaps, playerCount })
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
  const { playerRow, flight, allHandicaps, playerCount = 0 } = state

  // Permanent opt-out ("don't remind me again") — an independent flag that
  // suppresses the modal entirely, regardless of onboarding_completed or which
  // persistent items are (in)complete.
  if (playerRow?.getting_started_opted_out) return null

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
  // A round needs a tee time for EVERY pairing, not just the first — same count
  // the Tee Times tab shows (one 2v2 foursome per 4 players, up to 5). Checking
  // only tee_time_1 wrongly marked a partly-timed round complete.
  const numPairings = Math.min(5, Math.max(1, Math.ceil(playerCount / 4)))
  const roundTeeTimesSet = r => Array.from({ length: numPairings }, (_, i) => `tee_time_${i + 1}`).every(c => nonEmpty(r[c]))
  const teeTimesSet = withCourse.length === 0 || withCourse.every(roundTeeTimesSet)

  // Commissioner rows: three first-login-only setup tips (no reliable "done"
  // signal — shown once, gated by onboarding_completed like the welcome tip),
  // followed by the tracked items which reappear live until complete.
  // Each row carries a `target` that clicking it navigates to: `{ page }` opens
  // that drawer page, `{ tab }` switches a main dashboard tab. Destinations follow
  // the hint text (Commissioner Tools, Players, Schedule & Courses, etc.).
  const commissionerRows = []
  if (isCommissioner) {
    if (isFirstLogin) {
      commissionerRows.push({ label: 'Name your teams', hint: 'Menu → Commissioner Tools', target: { page: 'commissioner' } })
      commissionerRows.push({ label: 'Set your handicap allowance %', hint: 'Menu → Commissioner Tools', target: { page: 'commissioner' } })
      commissionerRows.push({ label: 'Send your invite link', hint: 'Menu → Commissioner Tools', target: { page: 'commissioner' } })
    }
    if (!allHandicaps) commissionerRows.push({ label: 'Set every player’s handicap index', hint: 'Menu → Players', target: { page: 'players' } })
    if (!coursesAssigned) commissionerRows.push({ label: 'Assign a course to every round', hint: 'Menu → Schedule & Courses', target: { page: 'courses' } })
    if (!teeTimesSet) commissionerRows.push({ label: 'Add tee times to your rounds', hint: 'Tee Times tab', target: { tab: 'tee-times' } })
  }

  // Member rows: tracked items, shown only while incomplete.
  const memberRows = []
  if (playerRow) {
    if (!phoneDone) memberRows.push({ label: 'Add your phone number', hint: 'Menu → Players → your card', target: { page: 'players' } })
    if (!flightInfoFilled) memberRows.push({ label: 'Add your flight info', hint: 'Menu → Flights', target: { page: 'flights' } })
  }

  // Only the tracked items decide whether the modal reappears — the guidance
  // tips never nag on their own once first login has passed.
  const trackedIncomplete =
    (playerRow ? (!phoneDone ? 1 : 0) + (!flightInfoFilled ? 1 : 0) : 0) +
    (isCommissioner ? (!allHandicaps ? 1 : 0) + (!coursesAssigned ? 1 : 0) + (!teeTimesSet ? 1 : 0) : 0)
  const hasToDo = commissionerRows.length > 0 || memberRows.length > 0

  // Decide ONCE whether to show, the first time data is ready after mount — i.e.
  // a fresh app load that lands on Home (this card only mounts on the Home tab).
  // On first login it shows regardless (so the welcome tip appears); otherwise it
  // shows only if a tracked item is incomplete. Latching the decision means the
  // modal never pops up as a side effect of actions taken elsewhere later in the
  // session (e.g. adding a round on Schedule & Courses flips a course item
  // incomplete) — it re-evaluates only on the next fresh load.
  if (decidedShow === null) {
    // Latch during render — React discards this render's output and immediately
    // re-renders with the decision applied, so there's no flash.
    setDecidedShow(isFirstLogin || trackedIncomplete > 0)
    return null
  }
  if (!decidedShow) return null

  // Session-only dismissal — closing just hides it for now. It never persists,
  // so it reappears next login while the trigger conditions still hold —
  // UNLESS "don't remind me again" is checked, which persists a permanent opt-out.
  if (dismissed) return null

  // On any dismissal, persist the permanent opt-out if the box is checked.
  const dismiss = () => {
    if (optOut && playerRow?.id) {
      supabase.from('trip_players').update({ getting_started_opted_out: true }).eq('id', playerRow.id).then(() => {})
    }
    setDismissed(true)
  }

  // Clicking a checklist item closes the modal and jumps to its destination —
  // a drawer page ({ page }) or a main dashboard tab ({ tab }).
  const navigateTo = (target) => {
    dismiss()
    if (!target) return
    if (target.tab) onNavigateTab?.(target.tab)
    else if (target.page) onOpenMenuPage?.(target.page)
  }

  return (
    <GettingStartedView
      isFirstLogin={isFirstLogin}
      hasToDo={hasToDo}
      commissionerRows={commissionerRows}
      memberRows={memberRows}
      optOut={optOut}
      onToggleOptOut={setOptOut}
      onNavigate={navigateTo}
      onHomeScreen={() => { dismiss(); onOpenMenuPage?.('app-info') }}
      onClose={dismiss}
    />
  )
}

// Presentational modal — split out from the data-fetching container above so
// the view is easy to reason about (and render in isolation).
function GettingStartedView({ isFirstLogin, hasToDo, commissionerRows = [], memberRows = [], optOut = false, onToggleOptOut, onNavigate, onHomeScreen, onClose }) {
  return (
    <div style={styles.overlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div style={styles.card} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          Getting Started
          <button style={styles.close} aria-label="Close" onClick={onClose}>
            {/* SVG X — geometrically centered; the ✕ text glyph carries a baked-in
                vertical offset that flex centering can't correct. */}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
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
                <Item key={it.label} label={it.label} hint={it.hint} isLast={i === commissionerRows.length - 1} onClick={() => onNavigate?.(it.target)} />
              ))}
            </>
          )}

          {memberRows.length > 0 && (
            <>
              <div style={styles.subLabel}>As Member</div>
              {memberRows.map((it, i) => (
                <Item key={it.label} label={it.label} hint={it.hint} isLast={i === memberRows.length - 1} onClick={() => onNavigate?.(it.target)} />
              ))}
            </>
          )}
        </div>

        {/* Footer: permanent opt-out. When checked, dismissing (X / click-outside)
            suppresses this modal forever for this trip_player. */}
        <label style={styles.footer}>
          <input type="checkbox" style={styles.checkbox} checked={optOut} onChange={e => onToggleOptOut?.(e.target.checked)} />
          <span style={styles.footerLabel}>Don’t remind me again</span>
        </label>
      </div>
    </div>
  )
}
