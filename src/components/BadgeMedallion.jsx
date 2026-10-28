// One badge medallion: a navy disc with a gold ring and the badge's mark when
// earned (bronze / silver / gold ring for milestone tiers), a faint dashed ring
// when still locked. Badges are earned once, so there's no repeat count.
const GOLD = '#B08A3E'
const TIER_RING = ['#A9703D', '#AEB8C2', GOLD] // bronze, silver, gold

export default function BadgeMedallion({ badge, state, size = 64 }) {
  const earned = !!state?.earned
  const ring = earned ? (badge.tiers ? TIER_RING[state.tier ?? 0] : GOLD) : 'rgba(199,214,234,0.45)'
  const markSize = badge.mark.length >= 3 ? size * 0.26 : badge.mark.length === 2 ? size * 0.32 : size * 0.4
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: size, height: size, flexShrink: 0 }}>
      <span style={{
        width: '100%', height: '100%', borderRadius: '50%', boxSizing: 'border-box',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: earned ? '#0D1B2A' : 'transparent',
        border: earned ? `3px solid ${ring}` : `1.5px dashed ${ring}`,
        boxShadow: earned ? `inset 0 0 0 2px #0D1B2A, inset 0 0 0 3px ${ring}55` : 'none',
        color: earned ? '#D8C08A' : 'rgba(199,214,234,0.55)',
        fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: markSize,
        fontVariantNumeric: 'lining-nums', letterSpacing: badge.mark.length >= 3 ? '-0.5px' : 0,
      }}>
        {badge.mark}
      </span>
    </span>
  )
}
