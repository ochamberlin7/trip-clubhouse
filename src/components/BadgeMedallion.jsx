// One badge medallion: a green disc with a brass ring and the badge's mark when
// earned (bronze / silver / brass ring for milestone tiers), a faint dashed ring
// when still locked. Badges are earned once, so there's no repeat count.
const BRASS = 'var(--accent)'
const TIER_RING = ['#A9703D', '#AEB8C2', BRASS] // bronze, silver, brass (tier metals, not UI tokens)

export default function BadgeMedallion({ badge, state, size = 64 }) {
  const earned = !!state?.earned
  const ring = earned ? (badge.tiers ? TIER_RING[state.tier ?? 0] : BRASS) : 'var(--line)'
  const markSize = badge.mark.length >= 3 ? size * 0.26 : badge.mark.length === 2 ? size * 0.32 : size * 0.4
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: size, height: size, flexShrink: 0 }}>
      <span style={{
        width: '100%', height: '100%', borderRadius: '50%', boxSizing: 'border-box',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: earned ? 'var(--primary)' : 'transparent',
        border: earned ? `2px solid ${ring}` : `1.5px dashed ${ring}`,
        boxShadow: earned ? 'inset 0 0 0 2px var(--primary), inset 0 0 0 3px rgba(255,255,255,.25)' : 'none',
        color: earned ? 'var(--accent-soft)' : 'var(--mist)',
        fontFamily: 'var(--font-serif)', fontWeight: 700, fontSize: markSize,
        fontVariantNumeric: 'lining-nums', letterSpacing: badge.mark.length >= 3 ? '-0.5px' : 0,
      }}>
        {badge.mark}
      </span>
    </span>
  )
}
