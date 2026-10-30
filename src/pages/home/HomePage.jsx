import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useGroup } from '../../context/GroupContext'
import ProfileAvatar from '../../components/ProfileAvatar'
import SwipeDeleteRow, { TrashIcon } from '../../components/SwipeDeleteRow'
import { splitTrips, daysUntilTrip, restoreDaysLeft } from '../../lib/myTrips'
import { useMyCareer } from '../../lib/useMyCareer'
import { bestBadges } from '../../lib/badges'
import BadgeMedallion from '../../components/BadgeMedallion'
import { getTripPhase } from '../../lib/scoring'
import { inviteTokenFrom } from '../../lib/inviteMatch'

// Player home page ("your clubhouse"): the next trip's countdown, quick actions,
// your trips (active/upcoming, then past), career stats across trips, and a
// badges shelf. The app opens here except from 14 days before a trip through 7
// days after it (landingTrip in scoring.js).

const NAVY = '#1B3F6E'
const INK = '#0D1B2A'
const MUTED = '#5F6B7A'       // small labels / sub-lines (passes contrast on white)
const HAIR = '#E3E1DA'        // warm hairline, as in the trip wizard
const RULE = '#C9D3E0'        // section-heading side rules
const BORDER = '#D5D9DF'
// Letterhead look (2026-10-29): navy masthead with the app name in gold serif,
// a large profile photo, the user's name and a short gold rule ("2B" layout,
// "2A" title font, "2C" gold); light page below in the trip wizard's editorial
// style (serif names, small-caps labels, hairlines, square corners).
const GOLD = '#B08A3E'        // masthead rule, profile-photo ring
const GOLD_TEXT = '#D8C08A'   // "Trip Clubhouse" on navy
const SERIF = "'Playfair Display', Georgia, serif"
const CAPS = { fontWeight: 700, letterSpacing: '1.6px', textTransform: 'uppercase' }

const h = {
  page: { minHeight: '100vh', background: 'var(--bg0)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 40px)', boxSizing: 'border-box' },
  // Masthead: clears the phone's status bar / notch.
  mast: { background: NAVY, padding: '18px 16px 22px', paddingTop: 'calc(env(safe-area-inset-top) + 18px)', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  brand: { margin: 0, fontFamily: SERIF, fontSize: 36, fontWeight: 700, lineHeight: 1.05, letterSpacing: '0.2px', color: GOLD_TEXT, textAlign: 'center' },
  // Large profile photo (initials if none) in a gold ring; opens the Profile page.
  avatar: { position: 'static', top: 'auto', right: 'auto', marginTop: 14, width: 68, height: 68, fontSize: 22, border: `2px solid ${GOLD}`, boxShadow: `0 0 0 3px ${NAVY}, 0 0 0 4px rgba(176,138,62,0.5)` },
  who: { margin: '10px 0 0', fontFamily: SERIF, fontSize: 22, fontWeight: 400, color: '#fff' },
  goldRule: { width: 80, height: 2, background: GOLD, marginTop: 8 },
  inner: { maxWidth: 480, margin: '0 auto', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 22 },
  // Next-trip countdown / live card: sits below the masthead; tapping opens the trip.
  heroCard: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', marginTop: 22, textAlign: 'center', padding: '22px 16px 20px', background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', color: INK, boxSizing: 'border-box' },
  // Lining (capital-height) figures so the serif digits sit on the baseline.
  big: { marginTop: 10, fontFamily: SERIF, fontSize: 72, fontWeight: 700, lineHeight: 1, color: NAVY, fontVariantNumeric: 'lining-nums', fontFeatureSettings: '"lnum" 1' },
  eyebrow: { fontSize: 10.5, letterSpacing: '1.8px', color: MUTED, fontWeight: 700, textTransform: 'uppercase' },
  until: { marginTop: 6, fontFamily: SERIF, fontStyle: 'italic', fontSize: 17, color: '#2C3E50' },
  heroName: { fontFamily: SERIF, fontSize: 23, fontWeight: 700, color: INK, marginTop: 10 },
  heroSub: { fontSize: 13, color: MUTED, marginTop: 4 },
  actions: { display: 'flex', flexDirection: 'column', gap: 8 },
  actionRow: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 },
  btn: { padding: '13px 0', borderRadius: 4, border: `1px solid ${NAVY}`, background: 'transparent', color: NAVY, fontSize: 12, ...CAPS, letterSpacing: '1.4px', cursor: 'pointer', fontFamily: 'inherit' },
  btnPrimary: { background: NAVY, borderColor: NAVY, color: '#fff', fontSize: 13, padding: '15px 16px' },
  sec: { display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 6px', fontSize: 11, fontWeight: 800, letterSpacing: '2.2px', textTransform: 'uppercase', color: NAVY },
  secRule: { flex: 1, height: 1, background: RULE },
  link: { display: 'block', width: '100%', textAlign: 'center', background: 'none', border: 'none', padding: '12px 0 0', color: NAVY, fontSize: 10.5, ...CAPS, cursor: 'pointer', fontFamily: 'inherit' },
  // Bottom-right footnote.
  footLink: { display: 'flex', alignItems: 'center', gap: 5, alignSelf: 'flex-end', margin: '4px 0 0', padding: 0, background: 'none', border: 'none', color: MUTED, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  box: { background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 3, overflow: 'hidden' },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px', width: '100%', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: INK },
  rowLine: { borderTop: `1px solid ${HAIR}` },
  tripName: { fontFamily: SERIF, fontSize: 17, lineHeight: 1.2, color: INK },
  tripSub: { fontSize: 12, color: MUTED, marginTop: 2 },
  chev: { marginLeft: 'auto', color: '#9AA6B5', fontSize: 20, lineHeight: 1 },
  empty: { border: `1px dashed ${RULE}`, borderRadius: 3, padding: 14, textAlign: 'center', fontSize: 13, color: MUTED, lineHeight: 1.45 },
  stats: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', textAlign: 'center', padding: '8px 0' },
  statNum: { display: 'block', fontFamily: SERIF, fontSize: 28, fontWeight: 400, lineHeight: 1, color: INK, fontVariantNumeric: 'lining-nums', fontFeatureSettings: '"lnum" 1' },
  statLab: { display: 'block', marginTop: 6, fontSize: 10, ...CAPS, color: MUTED },
  statLine: { borderLeft: `1px solid ${BORDER}` },
  shelf: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', width: '100%' },
  shelfCell: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  shelfName: { fontSize: 11, fontWeight: 600, color: '#2C3E50', textAlign: 'center', lineHeight: 1.25 },
  badge: { width: 58, height: 58, borderRadius: '50%', border: `1.5px dashed ${RULE}`, boxSizing: 'border-box' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: { background: '#fff', borderRadius: 4, padding: 22, width: '100%', maxWidth: 380, boxSizing: 'border-box' },
  input: { width: '100%', boxSizing: 'border-box', padding: '11px 12px', border: `1px solid ${BORDER}`, borderRadius: 3, fontSize: 15, fontFamily: 'inherit', marginTop: 12 },
}
// Dialog buttons (Cancel / Join / Delete / Restore) share the page's button look.
h.pill = { ...h.btn, flex: 1 }
h.pillPrimary = { background: NAVY, borderColor: NAVY, color: '#fff' }

// Section heading: small caps between two hairline rules.
// Pass onClick to make the title itself a link (e.g. Trophy room).
function SectionHead({ children, style, onClick }) {
  const title = onClick
    ? <button onClick={onClick} style={{ background: 'none', border: 'none', padding: '6px 0', margin: '-6px 0', font: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit', color: 'inherit', cursor: 'pointer' }}>{children} ›</button>
    : children
  return <h2 style={{ ...h.sec, ...style }}><span style={h.secRule} />{title}<span style={h.secRule} /></h2>
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
// No status pills: the Upcoming / Past sections say it; a live trip says
// "Live now" in its sub-line and a past trip shows its finish there.
function TripRow({ trip, live, first, unread, finish, onOpen, onDelete }) {
  const parts = [live ? 'Live now' : null, fmtRange(trip), finish, trip.location].filter(Boolean)
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
      <span style={h.chev}>›</span>
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
        <div style={{ fontSize: 14, color: MUTED, marginTop: 6, lineHeight: 1.45 }}>Paste the invite link your commissioner sent you.</div>
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
  // Trips, career totals and badges — shared loader with the Trophy Room.
  const { trips, deleted, career, badges, finishes, reload } = useMyCareer(user?.id)
  const [showAllPast, setShowAllPast] = useState(false)
  const [joining, setJoining] = useState(false)
  const [copied, setCopied] = useState(false)
  const [careerSoon, setCareerSoon] = useState(false) // full career page is on the backlog
  const [pendingDelete, setPendingDelete] = useState(null) // trip awaiting the delete confirm
  const [showDeleted, setShowDeleted] = useState(false)

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

  const displayName = (user?.user_metadata?.display_name || '').trim()
  const firstName = displayName.split(/\s+/)[0]
  const pastShown = showAllPast ? past : past.slice(0, 3)

  let hero
  if (trips == null) {
    hero = <div style={{ ...h.heroCard, ...h.heroSub, cursor: 'default', padding: '30px 0' }}>Loading…</div>
  } else if (next && live.includes(next)) {
    const phase = getTripPhase({ trip: next, now, timeZone: next.time_zone || undefined })
    hero = (
      <button style={h.heroCard} onClick={() => openTrip(next.id)}>
        <div style={{ ...h.eyebrow, color: '#0F6E56' }}>Live now{phase.dayNumber ? ` · Day ${phase.dayNumber} of ${phase.totalDays}` : ''}</div>
        <div style={{ ...h.heroName, fontSize: 26 }}>{next.name}</div>
        <div style={h.heroSub}>{[fmtRange(next), next.location].filter(Boolean).join(' · ')}</div>
      </button>
    )
  } else if (next) {
    const days = daysUntilTrip(next, now)
    const facts = [fmtRange(next), next.golfers ? `${next.golfers} players` : null, next.rounds ? `${next.rounds} rounds` : null].filter(Boolean)
    hero = (
      <button style={h.heroCard} onClick={() => openTrip(next.id)}>
        <div style={h.eyebrow}>Next on the calendar</div>
        <div style={h.big}>{days ?? '—'}</div>
        <div style={h.until}>{days === 1 ? 'day until' : 'days until'}</div>
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
      <header style={h.mast}>
        <h1 style={h.brand}>Trip Clubhouse</h1>
        <ProfileAvatar style={h.avatar} />
        {displayName && <p style={h.who}>{displayName}</p>}
        <div style={h.goldRule} />
      </header>

      <div style={h.inner}>
        {hero}

        <div style={h.actions}>
          <button style={{ ...h.btn, ...h.btnPrimary }} onClick={() => navigate('/onboarding/trip')}>Start a new trip</button>
          <div style={h.actionRow}>
            <button style={h.btn} onClick={() => setJoining(true)}>Join a trip</button>
            <button style={h.btn} onClick={inviteFriends}>{copied ? 'Link copied' : 'Invite friends'}</button>
          </div>
        </div>

        {isNew && (
          <div style={{ ...h.box, padding: 14, fontSize: 13, color: '#2C3E50', lineHeight: 1.5 }}>
            <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 700, color: INK, marginBottom: 4 }}>Got an invite?</div>
            Tap the link your commissioner sent, or tap <b>Join a trip</b> and paste it.
          </div>
        )}

        {trips != null && !isNew && (
          <>
            <section>
              <SectionHead>Upcoming</SectionHead>
              {activeAndUpcoming.length ? (
                <div style={h.box}>
                  {activeAndUpcoming.map((t, i) => (
                    <TripRow key={t.id} trip={t} live={live.includes(t)} first={i === 0} unread={unreadTripIds?.has(t.id)} onOpen={openTrip} onDelete={setPendingDelete} />
                  ))}
                </div>
              ) : (
                <div style={h.empty}>No trips on the calendar. Start one, or join with an invite link.</div>
              )}
            </section>

            {past.length > 0 && (
              <section>
                <SectionHead>Past</SectionHead>
                <div style={h.box}>
                  {pastShown.map((t, i) => <TripRow key={t.id} trip={t} first={i === 0} unread={unreadTripIds?.has(t.id)} finish={finishes?.get(t.id)} onOpen={openTrip} onDelete={setPendingDelete} />)}
                </div>
                {past.length > 3 && (
                  <button style={h.link} onClick={() => setShowAllPast(v => !v)}>{showAllPast ? 'Show less' : `See all ${past.length} past trips`}</button>
                )}
              </section>
            )}
          </>
        )}

        <section>
          {/* Title is the link (like Trophy room) once there are stats; the full career page is still to come. */}
          <SectionHead style={{ marginBottom: 4 }} onClick={hasCareer ? () => setCareerSoon(true) : undefined}>Career</SectionHead>
          {hasCareer ? (
            <>
              <div style={h.stats}>
                <div><b style={h.statNum}>{career.trips}</b><span style={h.statLab}>Trips</span></div>
                <div style={h.statLine}><b style={h.statNum}>{career.rounds}</b><span style={h.statLab}>Rounds</span></div>
                <div style={h.statLine}><b style={h.statNum}>{career.points}</b><span style={h.statLab}>Points</span></div>
                <div style={h.statLine}><b style={h.statNum}>{career.bestRound ?? '—'}</b><span style={h.statLab}>Best</span></div>
              </div>
              {careerSoon && <div style={{ fontSize: 12, color: MUTED, textAlign: 'center', marginTop: 6 }}>The full career stats page is coming soon.</div>}
            </>
          ) : (
            <div style={{ ...h.empty, marginTop: 6 }}>{career == null && trips != null && !isNew ? 'Adding up your stats…' : 'Your stats start with your first round.'}</div>
          )}
        </section>

        <section>
          <SectionHead style={{ marginBottom: 14 }} onClick={() => navigate('/trophies')}>Trophy room</SectionHead>
          {/* Shelf: your 4 best badges (never roast ones), or faint placeholders until you earn some. */}
          <button style={h.shelf} onClick={() => navigate('/trophies')} aria-label="Open the Trophy Room">
            {(() => {
              const cells = bestBadges(badges, 4).map(b => (
                <span key={b.id} style={h.shelfCell}>
                  <BadgeMedallion badge={b} state={badges.get(b.id)} size={58} />
                  <span style={h.shelfName}>{b.name}</span>
                </span>
              ))
              while (cells.length < 4) cells.push(<span key={`ph${cells.length}`} style={h.shelfCell}><span style={h.badge} /><span style={h.shelfName}>&nbsp;</span></span>)
              return cells
            })()}
          </button>
        </section>

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
                  reload()
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
                      onClick={async () => { await restoreTrip(t.id); reload(); if (deleted.length <= 1) setShowDeleted(false) }}>Restore</button>
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
