import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useMyCareer } from '../../lib/useMyCareer'
import { BADGES, BADGE_GROUPS, TIER_NAMES } from '../../lib/badges'
import BadgeMedallion from '../../components/BadgeMedallion'
import Icon from '../../components/ui/Icon'

// Trophy room: every badge, earned ones on a green disc with a brass ring, locked
// ones as faint dashed placeholders. Tap a badge for what it takes and when you earned it.
const SERIF = 'var(--font-serif)'

const t = {
  page: { minHeight: '100vh', background: 'var(--stone)', padding: '18px 16px 40px', paddingTop: 'calc(env(safe-area-inset-top) + 18px)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 40px)', boxSizing: 'border-box' },
  inner: { maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 },
  back: { display: 'inline-flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', padding: 0, color: 'var(--primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start' },
  title: { fontFamily: SERIF, fontSize: 26, fontWeight: 700, color: 'var(--primary)', margin: 0, lineHeight: 1.1 },
  sub: { fontSize: 13, color: 'var(--slate)', marginTop: 4 },
  rule: { width: 34, height: 2, background: 'var(--accent)', marginTop: 9 },
  sec: { fontFamily: SERIF, fontSize: 17, fontWeight: 700, color: 'var(--primary)', margin: '0 0 8px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '14px 6px', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 'var(--card-radius)', padding: '14px 8px' },
  cell: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' },
  name: { fontSize: 11, fontWeight: 600, textAlign: 'center', lineHeight: 1.25 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: { background: 'var(--paper)', borderRadius: 'var(--radius)', padding: 22, width: '100%', maxWidth: 360, boxSizing: 'border-box', textAlign: 'center' },
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
        <button style={t.back} onClick={() => navigate('/home')}><Icon name="left" size={14} />Home</button>
        <div>
          <h1 style={t.title}>Trophy room</h1>
          <div style={t.sub}>{badges ? `${earnedCount} of ${BADGES.length} badges earned` : 'Loading your badges'}</div>
          <div style={t.rule} />
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
                    <span style={{ ...t.name, color: state?.earned ? 'var(--ink)' : 'var(--mist)' }}>{b.name}</span>
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
            <div style={{ width: 92, height: 92, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BadgeMedallion badge={openBadge} state={badges?.get(openBadge.id)} size={80} />
            </div>
            <div style={{ fontFamily: SERIF, fontSize: 21, fontWeight: 700, color: 'var(--ink)', marginTop: 12 }}>{openBadge.name}</div>
            <div style={{ fontSize: 14, color: 'var(--ink-2)', marginTop: 6, lineHeight: 1.45 }}>{openBadge.desc}</div>
            <div style={{ fontSize: 13, color: 'var(--slate)', marginTop: 10, lineHeight: 1.45 }}>{statusLine(openBadge, badges?.get(openBadge.id))}</div>
            <button onClick={() => setOpen(null)} className="btn btn-auto" style={{ marginTop: 16, display: 'inline-flex' }}>Close</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
