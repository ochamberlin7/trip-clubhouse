import Icon from './Icon'

// Page masthead: eyebrow (small caps, slate), serif title in green, optional sub-line,
// a short brass rule, and optional back button / right-side action.
// Carries the status-bar inset when it is the top-most element.
export default function PageHeader({ eyebrow, title, sub, onBack, action, children, flush = false }) {
  return (
    <div className={`ds-mast ${flush ? 'ds-mast-flush' : ''}`}>
      <div className="ds-mast-row">
        {onBack && (
          <button type="button" className="ds-iconbtn" onClick={onBack} aria-label="Back"><Icon name="left" /></button>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          {eyebrow && <div className="ds-eyebrow">{eyebrow}</div>}
          {title && <h1 className="ds-title">{title}</h1>}
          {sub && <div className="ds-mast-sub">{sub}</div>}
          <div className="ds-rule" />
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}
