// Small bottom pop-up for "Edit photo": Change photo / Remove photo / Cancel
// (iOS action-sheet style). Rendered in a portal so it sits above the drawer.
import { useEffect } from 'react'
import { createPortal } from 'react-dom'

const st = {
  overlay: { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(11, 22, 38, 0.45)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '0 10px', paddingBottom: 'max(calc(env(safe-area-inset-bottom) + 10px), 16px)', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
  group: { background: '#fff', borderRadius: 14, overflow: 'hidden', width: '100%', maxWidth: 420, margin: '0 auto' },
  title: { fontSize: 13, color: '#7A8FA6', textAlign: 'center', padding: '12px 16px', borderBottom: '1px solid #E5E7EB' },
  btn: { display: 'block', width: '100%', background: '#fff', border: 'none', padding: '16px', fontSize: 17, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'center' },
}

export default function PhotoActionSheet({ onChange, onRemove, onClose }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div style={st.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-label="Edit profile photo">
      <div style={st.group} onClick={e => e.stopPropagation()}>
        <div style={st.title}>Profile photo</div>
        <button style={{ ...st.btn, color: '#1B3F6E', borderBottom: '1px solid #E5E7EB' }} onClick={onChange}>Change photo</button>
        <button style={{ ...st.btn, color: '#C0392B' }} onClick={onRemove}>Remove photo</button>
      </div>
      <div style={{ ...st.group, marginTop: 8 }} onClick={e => e.stopPropagation()}>
        <button style={{ ...st.btn, color: '#1B3F6E', fontWeight: 700 }} onClick={onClose}>Cancel</button>
      </div>
    </div>,
    document.body,
  )
}
