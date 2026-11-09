// Toggle switch (role="switch"). Always pair with a visible label via `label` or
// aria-labelledby; the on state is green with the knob to the right.
export default function Switch({ checked, onChange, label, disabled, id, style }) {
  return (
    <label className={`ds-switch-wrap ${disabled ? 'is-disabled' : ''}`} style={style}>
      <button type="button" role="switch" id={id} aria-checked={!!checked} disabled={disabled}
        className={`ds-switch ${checked ? 'on' : ''}`} onClick={() => onChange?.(!checked)}>
        <span className="ds-switch-knob" />
      </button>
      {label && <span className="ds-switch-label">{label}</span>}
    </label>
  )
}
