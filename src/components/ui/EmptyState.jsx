import Icon from './Icon'

// Empty or error state. Says what is missing and what to do next; the action is
// optional. Pass tone="error" for a failed load.
export default function EmptyState({ icon, title, children, action, tone = 'empty', style }) {
  return (
    <div className={`ds-empty ${tone === 'error' ? 'ds-empty-error' : ''}`} style={style}>
      {icon && <div className="ds-empty-icon"><Icon name={icon} size={22} /></div>}
      {title && <b>{title}</b>}
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}
