import Icon from './Icon'

// Status chip. Tones: live (green dot), final, tournament (brass), practice, locked
// (lock icon), warn, bad. Every tone carries text; the color only reinforces it.
export default function StatusTag({ tone = 'final', children, icon, style }) {
  return (
    <span className={`ds-tag ds-tag-${tone}`} style={style}>
      {tone === 'live' && <span className="ds-tag-dot" aria-hidden="true" />}
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  )
}
