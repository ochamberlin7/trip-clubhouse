import { useId } from 'react'

// Labelled form field. Wraps any input/select/textarea (passed as children or via
// `input` props) with a small-caps label, optional help text and an error line.
// Errors say what went wrong and what to enter instead.
export default function Field({ label, help, error, children, id, style }) {
  const auto = useId()
  const fieldId = id || auto
  return (
    <div className={`ds-field ${error ? 'has-error' : ''}`} style={style}>
      {label && <label className="ds-label" htmlFor={fieldId}>{label}</label>}
      {typeof children === 'function' ? children(fieldId) : children}
      {error ? <div className="ds-help ds-help-err" role="alert">{error}</div> : help ? <div className="ds-help">{help}</div> : null}
    </div>
  )
}
