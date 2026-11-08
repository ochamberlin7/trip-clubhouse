import Icon from './Icon'

// The one card shell: white paper, hairline border, 4px corners, no shadow.
// <Card><CardHeader title="Tee times" tail="Forest Dunes" icon="clock" /><Row .../></Card>
export default function Card({ children, style, className = '', as: Tag = 'div', ...rest }) {
  return <Tag className={`ds-card ${className}`.trim()} style={style} {...rest}>{children}</Tag>
}

// Small-caps label in green with a hairline underneath. `tail` is quiet detail on the right.
export function CardHeader({ title, tail, icon, children, style }) {
  return (
    <div className="ds-card-h" style={style}>
      <span className="ds-card-t">{icon && <Icon name={icon} size={14} />}{title}</span>
      {tail != null && tail !== '' && <span className="ds-card-tail">{tail}</span>}
      {children}
    </div>
  )
}

export function CardBody({ children, style }) {
  return <div className="ds-card-b" style={style}>{children}</div>
}

// A list row: label (serif, bold) with an optional sub-line, a value on the right,
// and an optional chevron when the row is tappable. Rows inside a Card separate
// with a hairline. Pass `onClick` to make it a button.
export function Row({ label, sub, value, chevron = false, onClick, children, style }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className="ds-row" onClick={onClick} style={style} type={onClick ? 'button' : undefined}>
      <span className="ds-row-k">
        {label != null && <b>{label}</b>}
        {sub != null && <span>{sub}</span>}
        {children}
      </span>
      {value != null && <span className="ds-row-v">{value}</span>}
      {chevron && <Icon name="right" size={16} className="ds-row-chev" />}
    </Tag>
  )
}
