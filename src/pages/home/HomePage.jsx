import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useGroup } from '../../context/GroupContext'
import ProfileAvatar from '../../components/ProfileAvatar'
import SwipeDeleteRow, { TrashIcon } from '../../components/SwipeDeleteRow'
import { loadMyTrips, splitTrips, daysUntilTrip, restoreDaysLeft } from '../../lib/myTrips'
import { loadCareerData, buildCareer } from '../../lib/careerStats'
import { getTripPhase } from '../../lib/scoring'
import { inviteTokenFrom } from '../../lib/inviteMatch'

// Player home page ("your clubhouse"): the next trip's countdown, quick actions,
// your trips (active/upcoming, then past), career stats across trips, and a
// badges shelf. The app opens here except from 14 days before a trip through 7
// days after it (landingTrip in scoring.js).

const NAVY = '#1B3F6E'
const INK = '#0D1B2A'
const MUTED = '#8A96A3'
// Clubhouse look ("3A"): the app's navy page, white cards, gold accents.
const GOLD = '#B08A3E'        // fills: New trip pill, initials circle, card edge
const GOLD_SOFT = '#D8C08A'   // text on navy: brand, section titles, links
const ON_NAVY = '#C7D6EA'     // quiet text on navy
const NAVY_LINE = '#2C5F8A'   // card borders on navy
const SERIF = "'Playfair Display', Georgia, serif"

const h = {
  // Clear the phone's status bar / notch (time, Wi-Fi, battery) and home bar.
  page: { minHeight: '100vh', background: 'var(--navy)', padding: '18px 16px 40px', paddingTop: 'calc(env(safe-area-inset-top) + 18px)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 40px)', boxSizing: 'border-box' },
  inner: { maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 },
  top: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  brand: { fontFamily: SERIF, fontSize: 30, fontWeight: 700, lineHeight: 1.1, letterSpacing: '0.3px', color: GOLD_SOFT },
  // Next-trip countdown / live card: light outline; tapping anywhere opens the trip.
  heroCard: { display: 'block', width: '100%', textAlign: 'center', padding: '20px 16px', background: '#fff', border: `1px solid ${GOLD}`, borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit', boxSizing: 'border-box' },
  // Lining (capital-height) figures so the serif digits sit on the baseline — the
  // default old-style 9 dips below it and leaves extra space above.
  big: { fontFamily: SERIF, fontSize: 64, fontWeight: 700, lineHeight: 1, color: INK, fontVariantNumeric: 'lining-nums', fontFeatureSettings: '"lnum" 1' },
  eyebrow: { fontSize: 11, letterSpacing: '1.6px', color: MUTED, fontWeight: 700, textTransform: 'uppercase' },
  heroName: { fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: INK, marginTop: 6 },
  heroSub: { fontSize: 13, color: MUTED, marginTop: 2 },
  pills: { display: 'flex', gap: 8 },
  pill: { flex: 1, padding: '9px 0', borderRadius: 999, border: `1px solid ${NAVY_LINE}`, background: '#fff', color: NAVY, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  pillPrimary: { background: GOLD, borderColor: GOLD, color: '#fff' },
  secRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  sec: { fontFamily: SERIF, fontSize: 18, fontWeight: 700, color: GOLD_SOFT, margin: 0 },
  link: { background: 'none', border: 'none', padding: 0, color: GOLD_SOFT, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  // Bottom-right footnote.
  footLink: { display: 'flex', alignItems: 'center', gap: 5, alignSelf: 'flex-end', margin: '4px 0 0', padding: 0, background: 'none', border: 'none', color: ON_NAVY, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  seeAll: { display: 'block', width: '100%', padding: 11, background: '#FBFCFD', border: 'none', borderTop: '1px solid var(--bg2)', color: NAVY, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  box: { background: '#fff', border: `1px solid ${NAVY_LINE}`, borderRadius: 14, overflow: 'hidden' },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', width: '100%', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' },
  rowLine: { borderTop: '1px solid var(--bg2)' },
  tripName: { fontSize: 15, fontWeight: 700, color: INK },
  tripSub: { fontSize: 12, color: MUTED, marginTop: 2 },
  tag: { marginLeft: 'auto', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' },
  chev: { color: '#A9B4C0', fontSize: 18, lineHeight: 1 },
  empty: { border: '1.5px dashed rgba(199,214,234,0.45)', borderRadius: 14, padding: 14, textAlign: 'center', fontSize: 13, color: ON_NAVY, lineHeight: 1.45 },
  stats: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', textAlign: 'center', padding: '12px 4px' },
  statNum: { display: 'block', fontSize: 20, fontWeight: 800, color: NAVY },
  statLab: { fontSize: 11, color: MUTED },
  badges: { display: 'flex', gap: 10 },
  badge: { flex: 1, aspectRatio: '1', borderRadius: '50%', border: '1.5px dashed rgba(216,192,138,0.55)', background: 'transparent' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: { background: '#fff', borderRadius: 14, padding: 22, width: '100%', maxWidth: 380, boxSizing: 'border-box' },
  input: { width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid #DDE3EA', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', marginTop: 12 },
}

const TAG = {
  live: { background: '#E1F2EB', color: '#0F6E56' },
  upcoming: { background: '#EEF2F7', color: NAVY },
}

const INVITE_MESSAGE = 'Join me on Trip Clubhouse to run your golf trip: pairings, live scores, leaderboards and the trash talk.'
const APP_URL = 'https://thetripclubhouse.com'

function fmtRange(t) {
  if (!t.start_date) return 'Dates to be set'
  const d = iso => new Date(`${iso}T12:00:00Z`)
  const opts = { month: 'short', day: 'numeric', timeZone: 'UTC' }
  const s = d(t.start_date), e = d(t.end_date || t.start_date)
  const year = e.getUTCFullYear()
  const sameMonth = s.getUTCMonth() === e.getUTCMonth()
  const end = sameMonth ? e.getUTCDate() : e.toLocaleDateString('en-US', opts)
  return `${s.toLocaleDateString('en-US', opts)} – ${end}, ${year}`
}

// One trip row. The trip's commissioner can swipe left to delete it (soft delete,
// restorable for 30 days); everyone else just taps to open it.
function TripRow({ trip, status, first, unread, onOpen, onDelete }) {
  const parts = [fmtRange(trip), trip.location].filter(Boolean)
  return (
    <SwipeDeleteRow canDelete={!!trip.canDelete} rowStyle={{ ...h.row, ...(first ? null : h.rowLine) }} outerStyle={first ? undefined : h.rowLine}
      coverBg="#fff" onPick={() => onOpen(trip.id)} onDelete={() => onDelete(trip)}>
      <span style={{ minWidth: 0 }}>
        <div style={h.tripName}>
          {trip.name}
          {unread && <span aria-label="Unread trash talk" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#C0392B', marginLeft: 6, verticalAlign: 'middle' }} />}
        </div>
        <div style={h.tripSub}>{parts.join(' · ')}</div>
      </span>
      {status === 'live' && <span style={{ ...h.tag, ...TAG.live }}>Live</span>}
      {status === 'upcoming' && <span style={{ ...h.tag, ...TAG.upcoming }}>Upcoming</span>}
      <span style={{ ...h.chev, ...(status === 'past' ? { marginLeft: 'auto' } : null) }}>›</span>
    </SwipeDeleteRow>
  )
}

function JoinTripModal({ onClose, onJoin }) {
  const [text, setText] = useState('')
  const [err, setErr] = useState(null)
  function submit() {
    const token = inviteTokenFrom(text)
    if (!token) { setErr("That doesn't look like an invite link. Paste the whole link your commissioner sent."); return }
    onJoin(token)
  }
  return createPortal(
    <div style={h.overlay} onClick={onClose}>
      <div style={h.sheet} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: INK }}>Join a trip</div>
        <div style={{ fontSize: 14, color: '#5A7290', marginTop: 6, lineHeight: 1.45 }}>Paste the invite link your commissioner sent you.</div>
        <input style={h.input} value={text} onChange={e => { setText(e.target.value); setErr(null) }} placeholder="thetripclubhouse.com/join/…" autoFocus />
        {err && <div style={{ fontSize: 12, color: '#C0392B', marginTop: 8 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button style={{ ...h.pill, flex: 1 }} onClick={onClose}>Cancel</button>
          <button style={{ ...h.pill, ...h.pillPrimary, flex: 1 }} onClick={submit}>Join</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default function HomePage() {
  const { user } = useAuth()
  const { switchTrip, restoreTrip, softDeleteTrip, unreadTripIds } = useGroup()
  const navigate = useNavigate()
  const [trips, setTrips] = useState(null) // null = loading
  const [deleted, setDeleted] = useState([])
  const [career, setCareer] = useState(null)
  const [showAllPast, setShowAllPast] = useState(false)
  const [joining, setJoining] = useState(false)
  const [copied, setCopied] = useState(false)
  const [careerSoon, setCareerSoon] = useState(false) // full career page is on the backlog
  const [pendingDelete, setPendingDelete] = useState(null) // trip awaiting the delete confirm
  const [showDeleted, setShowDeleted] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { rows, deleted: gone } = await loadMyTrips(supabase, user?.id)
      if (cancelled) return
      setTrips(rows)
      setDeleted(gone)
      const perTrip = await loadCareerData(supabase, rows.map(t => t.id))
      if (!cancelled) setCareer(buildCareer(perTrip, user?.id))
    })()
    return () => { cancelled = true }
  }, [user?.id, reload])

  const now = new Date()
  const { live, upcoming, past } = useMemo(() => splitTrips(trips || [], now), [trips]) // eslint-disable-line react-hooks/exhaustive-deps
  const next = live[0] || upcoming[0] || null

  function openTrip(id) { switchTrip(id); navigate('/dashboard') }

  async function inviteFriends() {
    if (navigator.share) {
      try { await navigator.share({ title: 'Trip Clubhouse', text: INVITE_MESSAGE, url: APP_URL }) } catch { /* cancelled */ }
      return
    }
    try { await navigator.clipboard.writeText(`${INVITE_MESSAGE} ${APP_URL}`) } catch { /* ignore */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const firstName = (user?.user_metadata?.display_name || '').trim().split(/\s+/)[0]
  const pastShown = showAllPast ? past : past.slice(0, 3)

  let hero
  if (trips == null) {
    hero = <div style={{ ...h.heroCard, ...h.heroSub, cursor: 'default', padding: '30px 0' }}>Loading…</div>
  } else if (next && live.includes(next)) {
    const phase = getTripPhase({ trip: next, now, timeZone: next.time_zone || undefined })
    hero = (
      <button style={h.heroCard} onClick={() => openTrip(next.id)}>
        <div style={{ ...h.eyebrow, color: '#0F6E56' }}>Live now{phase.dayNumber ? ` · Day ${phase.dayNumber} of ${phase.totalDays}` : ''}</div>
        <div style={{ ...h.heroName, fontSize: 24 }}>{next.name}</div>
        <div style={h.heroSub}>{[fmtRange(next), next.location].filter(Boolean).join(' · ')}</div>
      </button>
    )
  } else if (next) {
    const days = daysUntilTrip(next, now)
    const facts = [fmtRange(next), next.golfers ? `${next.golfers} players` : null, next.rounds ? `${next.rounds} rounds` : null].filter(Boolean)
    hero = (
      <button style={h.heroCard} onClick={() => openTrip(next.id)}>
        <div style={h.big}>{days ?? '—'}</div>
        <div style={{ ...h.eyebrow, marginTop: 10 }}>{days === 1 ? 'Day until' : 'Days until'}</div>
        <div style={h.heroName}>{next.name}</div>
        <div style={h.heroSub}>{facts.join(' · ')}</div>
      </button>
    )
  } else if (past.length) {
    hero = (
      <div style={{ ...h.heroCard, cursor: 'default' }}>
        <div style={h.eyebrow}>Next trip</div>
        <div style={{ ...h.heroName, fontSize: 26 }}>Not booked yet</div>
      </div>
    )
  } else {
    hero = (
      <div style={{ ...h.heroCard, cursor: 'default' }}>
        <div style={{ ...h.heroName, fontSize: 26 }}>Welcome{firstName ? `, ${firstName}` : ''}</div>
        <div style={{ ...h.heroSub, maxWidth: 260, margin: '6px auto 0', lineHeight: 1.45 }}>Run your golf trip in one place: pairings, live scores, leaderboards and the trash talk.</div>
      </div>
    )
  }

  const activeAndUpcoming = [...live, ...upcoming]
  const isNew = trips != null && trips.length === 0
  const hasCareer = career && career.trips > 0

  return (
    <div style={h.page}>
      <div style={h.inner}>
        <div style={h.top}>
          <div style={h.brand}>Trip Clubhouse Home</div>
          <ProfileAvatar style={{ position: 'static', top: 'auto', right: 'auto', background: GOLD, borderColor: 'transparent', boxShadow: 'none' }} />
        </div>

        {hero}

        <div style={h.pills}>
          <button style={{ ...h.pill, ...h.pillPrimary }} onClick={() => navigate('/onboarding/trip')}>New trip</button>
          <button style={h.pill} onClick={() => setJoining(true)}>Join trip</button>
          <button style={h.pill} onClick={inviteFriends}>{copied ? 'Link copied' : 'Invite friends'}</button>
        </div>

        {isNew && (
          <div style={{ ...h.box, padding: 14, fontSize: 13, color: '#2C3E50', lineHeight: 1.5 }}>
            <div style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 700, color: INK, marginBottom: 4 }}>Got an invite?</div>
            Tap the link your commissioner sent, or tap <b>Join trip</b> and paste it.
          </div>
        )}

        {trips != null && !isNew && (
          <>
            <div style={h.secRow}><h2 style={h.sec}>Active and upcoming</h2></div>
            {activeAndUpcoming.length ? (
              <div style={h.box}>
                {activeAndUpcoming.map((t, i) => (
                  <TripRow key={t.id} trip={t} status={live.includes(t) ? 'live' : 'upcoming'} first={i === 0} unread={unreadTripIds?.has(t.id)} onOpen={openTrip} onDelete={setPendingDelete} />
                ))}
              </div>
            ) : (
              <div style={h.empty}>No trips on the calendar. Start one, or join with an invite link.</div>
            )}

            {past.length > 0 && (
              <>
                <div style={h.secRow}><h2 style={h.sec}>Past trips</h2></div>
                <div style={h.box}>
                  {pastShown.map((t, i) => <TripRow key={t.id} trip={t} status="past" first={i === 0} unread={unreadTripIds?.has(t.id)} onOpen={openTrip} onDelete={setPendingDelete} />)}
                  {past.length > 3 && (
                    <button style={h.seeAll} onClick={() => setShowAllPast(v => !v)}>{showAllPast ? 'Show less' : `See all ${past.length} past trips ›`}</button>
                  )}
                </div>
              </>
            )}
          </>
        )}

        <div style={h.secRow}>
          <h2 style={h.sec}>Your career</h2>
          {hasCareer && <button style={h.link} onClick={() => setCareerSoon(true)}>See all career stats ›</button>}
        </div>
        {careerSoon && <div style={{ fontSize: 12, color: ON_NAVY, marginTop: -8 }}>The full career stats page is coming soon.</div>}
        {hasCareer ? (
          <div style={{ ...h.box, ...h.stats }}>
            <div><b style={h.statNum}>{career.trips}</b><span style={h.statLab}>Trips</span></div>
            <div><b style={h.statNum}>{career.rounds}</b><span style={h.statLab}>Rounds</span></div>
            <div><b style={h.statNum}>{career.points}</b><span style={h.statLab}>Points</span></div>
            <div><b style={h.statNum}>{career.bestRound ?? '—'}</b><span style={h.statLab}>Best round</span></div>
          </div>
        ) : (
          <div style={h.empty}>{career == null && trips != null && !isNew ? 'Adding up your stats…' : 'Your stats start with your first round.'}</div>
        )}

        <div style={h.secRow}>
          <h2 style={h.sec}>Badges</h2>
          <span style={{ fontSize: 13, color: ON_NAVY }}>Coming soon</span>
        </div>
        <div style={h.badges} aria-hidden="true">
          {[0, 1, 2, 3].map(i => <span key={i} style={h.badge} />)}
        </div>

        {/* Subtle footer — only when there's something to restore. */}
        {deleted.length > 0 && (
          <button style={h.footLink} onClick={() => setShowDeleted(true)}>
            <TrashIcon size={14} color="currentColor" />
            Deleted trips ({deleted.length})
          </button>
        )}
      </div>

      {pendingDelete && createPortal(
        <div style={h.overlay} onClick={() => setPendingDelete(null)}>
          <div style={h.sheet} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: INK }}>Delete this trip?</div>
            <div style={{ fontSize: 14, color: '#2C3E50', marginTop: 8, lineHeight: 1.5 }}>
              <b>{pendingDelete.name}</b> will be deleted for everyone on it. You'll have 30 days to restore it before it's gone for good.
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button style={{ ...h.pill, flex: 1 }} onClick={() => setPendingDelete(null)}>Cancel</button>
              <button style={{ ...h.pill, flex: 1, background: '#C0392B', borderColor: '#C0392B', color: '#fff' }}
                onClick={async () => {
                  const t = pendingDelete
                  setPendingDelete(null)
                  const { error } = await softDeleteTrip(t.id)
                  if (error) window.alert('Delete failed — please try again.')
                  setReload(x => x + 1)
                }}>Delete</button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {showDeleted && createPortal(
        <div style={h.overlay} onClick={() => setShowDeleted(false)}>
          <div style={h.sheet} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: INK }}>Recently deleted</div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>Trips can be restored for 30 days.</div>
              </div>
              <button onClick={() => setShowDeleted(false)} aria-label="Close" style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'var(--bg2)', color: '#7A8FA6', fontSize: 14, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ marginTop: 10 }}>
              {deleted.map((t, i) => {
                const left = restoreDaysLeft(t.deleted_at)
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', ...(i ? { borderTop: '1px solid var(--bg2)' } : null) }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>{t.name}</div>
                      {left != null && <div style={{ fontSize: 12, color: MUTED }}>{left} day{left === 1 ? '' : 's'} left</div>}
                    </div>
                    <button style={{ ...h.pill, flex: 'none', marginLeft: 'auto', padding: '6px 14px' }}
                      onClick={async () => { await restoreTrip(t.id); setReload(x => x + 1); if (deleted.length <= 1) setShowDeleted(false) }}>Restore</button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {joining && <JoinTripModal onClose={() => setJoining(false)} onJoin={token => { setJoining(false); navigate(`/join/${token}`) }} />}
    </div>
  )
}
