import Icon from './Icon'

// Buttons. Variants: primary (filled green), secondary (green outline), ghost (text),
// danger (red outline). Sizes: md (default), sm. `block` stretches to the container.
// Labels are concrete actions in sentence case ("Save changes", "Add round").
export default function Button({ variant = 'secondary', size = 'md', block = false, icon, loading = false, disabled, children, className = '', type = 'button', ...rest }) {
  const cls = ['btn', `btn-${variant}`, size === 'sm' ? 'btn-sm' : '', block ? '' : 'btn-auto', loading ? 'btn-loading' : '', className].filter(Boolean).join(' ')
  return (
    <button type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {icon && <Icon name={icon} size={16} />}
      <span>{children}</span>
    </button>
  )
}
