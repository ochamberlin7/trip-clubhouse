// The Trip Clubhouse icon family (Letterpress Green design system).
// One geometry per name, drawn on a 24-unit grid with a 1.5px stroke, square caps
// and mitre joins. Interface icons come from here, never from emoji or text glyphs.
// Usage: <Icon name="flag" />  <Icon name="check" size={16} />  <Icon name="menu" title="Menu" />
// Pair any icon that is not self-evident with a visible label.

import { PATHS } from './iconPaths'


export default function Icon({ name, size = 20, strokeWidth = 1.5, title, style, className }) {
  const d = PATHS[name]
  if (!d) return null
  return (
    <svg
      className={className}
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="square" strokeLinejoin="miter"
      role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : 'true'}
      style={{ display: 'block', flexShrink: 0, ...style }}
      dangerouslySetInnerHTML={{ __html: d }}
    />
  )
}
