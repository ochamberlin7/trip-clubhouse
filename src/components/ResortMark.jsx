// Resort logo (falls back to the resort name if the image fails) with a small
// "Powered by Trip Clubhouse" line beneath. Used by the trip header and the
// sign-in / invite pages when a trip is linked to a resort.
import { useState } from 'react'

const s = {
  wrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  logo: { display: 'block', maxWidth: 'min(70%, 220px)', objectFit: 'contain' },
  name: { fontFamily: "'Playfair Display SC', serif", fontWeight: 700, color: 'var(--navy)', letterSpacing: '0.5px', lineHeight: 1.1 },
  powered: { fontSize: 9.5, fontWeight: 700, letterSpacing: '1.6px', textTransform: 'uppercase', color: 'var(--mist)' },
  rule: { width: 28, height: 2, borderRadius: 1, background: 'var(--brand-accent, var(--gold))', margin: '2px 0 1px' },
}

export default function ResortMark({ resort, logoHeight = 34, nameSize = 18, showPowered = true }) {
  const [broken, setBroken] = useState(false)
  if (!resort) return null
  const name = resort.name || resort.resort_name || ''
  return (
    <div style={s.wrap}>
      {resort.logo_url && !broken
        ? <img src={resort.logo_url} alt={name} style={{ ...s.logo, height: logoHeight }} onError={() => setBroken(true)} />
        : <div style={{ ...s.name, fontSize: nameSize }}>{name}</div>}
      {showPowered && <>
        <div style={s.rule} />
        <div style={s.powered}>Powered by Trip Clubhouse</div>
      </>}
    </div>
  )
}
