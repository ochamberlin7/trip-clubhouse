// Section heading between two hairlines: small caps in green. Pass `onClick` to make
// the title a link (it then shows a chevron).
import Icon from './Icon'

export default function SectionLabel({ children, onClick, style }) {
  const inner = onClick
    ? <button type="button" className="ds-sec-link" onClick={onClick}>{children}<Icon name="right" size={12} /></button>
    : <span>{children}</span>
  return <h2 className="ds-sec" style={style}><span className="ds-sec-rule" />{inner}<span className="ds-sec-rule" /></h2>
}
