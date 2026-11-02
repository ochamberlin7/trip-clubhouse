// Brand logo (falls back to the name if the image fails) with a small accent
// rule and "Powered by Trip Clubhouse" beneath. Used by the trip header, the
// Home masthead and the sign-in / invite pages. `onDark` uses the white logo.
import { useState } from 'react'

const s = {
  wrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  logo: { display: 'block', maxWidth: 'min(78%, 260px)', objectFit: 'contain' },
  name: { fontFamily: "'Playfair Display SC', serif", fontWeight: 700, letterSpacing: '0.5px', lineHeight: 1.1 },
  powered: { fontSize: 9.5, fontWeight: 700, letterSpacing: '1.6px', textTransform: 'uppercase' },
  rule: { width: 28, height: 2, borderRadius: 1, background: 'var(--brand-accent, var(--gold))', margin: '3px 0 1px' },
}

export default function ResortMark({ resort, logoHeight = 34, nameSize = 18, showPowered = true, onDark = false }) {
  const [broken, setBroken] = useState(false)
  if (!resort) return null
  const name = resort.name || resort.resort_name || ''
  const src = onDark ? (resort.logo_white_url || resort.logo_url) : resort.logo_url
  return (
    <div style={s.wrap}>
      {src && !broken
        ? <img src={src} alt={name} style={{ ...s.logo, height: logoHeight }} onError={() => setBroken(true)} />
        : <div style={{ ...s.name, fontSize: nameSize, color: onDark ? '#fff' : 'var(--navy)' }}>{name}</div>}
      {showPowered && <>
        <div style={s.rule} />
        <div style={{ ...s.powered, color: onDark ? 'rgba(255,255,255,0.6)' : 'var(--mist)' }}>Powered by Trip Clubhouse</div>
      </>}
    </div>
  )
}
