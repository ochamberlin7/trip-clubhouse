import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useMyCareer } from '../../lib/useMyCareer'
import { BADGES, BADGE_GROUPS, TIER_NAMES } from '../../lib/badges'
import BadgeMedallion from '../../components/BadgeMedallion'

// Trophy Room: every badge, earned ones lit up in gold, locked ones as faint
// placeholders. Tap a badge for what it takes and when you earned it.
const SERIF = "'Playfair Display', Georgia, serif"
const GOLD_SOFT = '#D8C08A'
const ON_NAVY = '#C7D6EA'

const t = {
  page: { minHeight: '100vh', background: 'var(--navy)', padding: '18px 16px 40px', paddingTop: 'calc(env(safe-area-inset-top) + 18px)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 40px)', boxSizing: 'border-box' },
  inner: { maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 },
  back: { background: 'none', border: 'none', padding: 0, color: GOLD_SOFT, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start' },
  title: { fontFamily: SERIF, fontSize: 30, fontWeight: 700, color: GOLD_SOFT, margin: 0, lineHeight: 1.1 },
  sub: { fontSize: 13, color: ON_NAVY, marginTop: 4 },
  sec: { fontFamily: SERIF, fontSize: 18, fontWeight: 700, color: GOLD_SOFT, margin: '0 0 10px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '14px 8px' },
  cell: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' },
  name: { fontSize: 11, fontWeight: 600, textAlign: 'center', lineHeight: 1.25 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: { background: '#fff', borderRadius: 14, padding: 22, width: '100%', maxWidth: 360, boxSizing: 'border-box', textAlign: 'center' },
}

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function statusLine(badge, state) {
  if (badge.comingSoon) return 'Coming soon.'
  if (badge.tiers) {
    const n = state?.count || 0
    const next = badge.tiers.find(th => n < th)
    const have = state?.tier != null ? `${TIER_NAMES[state.tier]} · ` : ''
    return next ? `${have}${n} of ${next} ${badge.unit} for ${TIER_NAMES[badge.tiers.indexOf(next)]}.` : `${have}${n} ${badge.unit}. Top tier reached.`
  }
  if (!state?.earned) return 'Not earned yet.'
  const first = state.events[0]
  const where = first ? [fmtDate(first.date), first.tripName].filter(Boolean).join(', ') : ''
  return where ? `Earned ${where}.` : 'Earned.'
}

export default function TrophyRoomPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { badges } = useMyCareer(user?.id)
  const [open, setOpen] = useState(null) // badge id
  const earnedCount = badges ? BADGES.filter(b => badges.get(b.id)?.earned).length : 0
  const openBadge = BADGES.find(b => b.id === open)

  return (
    <div style={t.page}>
      <div style={t.inner}>
        <button style={t.back} onClick={() => navigate('/home')}>‹ Home</button>
        <div>
          <h1 style={t.title}>Trophy Room</h1>
          <div style={t.sub}>{badges ? `${earnedCount} of ${BADGES.length} badges earned` : 'Loading your badges…'}</div>
        </div>

        {BADGE_GROUPS.map(g => (
          <section key={g.id}>
            <h2 style={t.sec}>{g.title}</h2>
            <div style={t.grid}>
              {BADGES.filter(b => b.group === g.id).map(b => {
                const state = badges?.get(b.id)
                return (
                  <button key={b.id} style={t.cell} onClick={() => setOpen(b.id)} aria-label={b.name}>
                    <BadgeMedallion badge={b} state={state} size={62} />
                    <span style={{ ...t.name, color: state?.earned ? '#fff' : ON_NAVY, opacity: state?.earned ? 1 : 0.75 }}>{b.name}</span>
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      {openBadge && createPortal(
        <div style={t.overlay} onClick={() => setOpen(null)}>
          <div style={t.sheet} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div style={{ background: 'var(--navy)', borderRadius: '50%', width: 92, height: 92, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BadgeMedallion badge={openBadge} state={badges?.get(openBadge.id)} size={80} />
            </div>
            <div style={{ fontFamily: SERIF, fontSize: 21, fontWeight: 700, color: '#0D1B2A', marginTop: 12 }}>{openBadge.name}</div>
            <div style={{ fontSize: 14, color: '#2C3E50', marginTop: 6, lineHeight: 1.45 }}>{openBadge.desc}</div>
            <div style={{ fontSize: 13, color: '#8A96A3', marginTop: 10, lineHeight: 1.45 }}>{statusLine(openBadge, badges?.get(openBadge.id))}</div>
            <button onClick={() => setOpen(null)} style={{ marginTop: 16, padding: '9px 24px', borderRadius: 999, border: '1px solid #DDE3EA', background: '#fff', color: '#1B3F6E', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Close</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
