import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import SupportForm from './SupportForm'

// Persistent floating "Feedback" pill shown across all dashboard tabs. Opens the
// shared SupportForm pre-set to "feature_request" with lighter, suggestion-y
// copy. Positioning + responsive centering live in index.css (.feedback-fab); it
// floats 10px above max(tab bar, live-score banner) at z-index 201 (above the
// banner at 200, below modals/drawer at >=300).
const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { position: 'relative', background: '#fff', borderRadius: '14px', width: '100%', maxWidth: 400, maxHeight: 'calc(100vh - 40px)', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.25)' },
  header: { position: 'relative', background: '#1B3F6E', color: '#fff', padding: '12px 44px 12px 16px', borderRadius: '14px 14px 0 0' },
  headerTitle: { fontFamily: "'Playfair Display', Georgia, serif", fontSize: '18px', fontWeight: 700 },
  close: { position: 'absolute', top: '50%', right: 10, transform: 'translateY(-50%)', width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 15, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
  body: { padding: '16px' },
}

export default function FeedbackButton({ tripId, userId }) {
  const [open, setOpen] = useState(false)
  const fabRef = useRef(null)

  // Publish the button's measured height so scrollable views (.dashboard-content)
  // can pad their bottom enough for content to clear the pill — the same
  // ResizeObserver approach the live-score banner uses. Its bottom offset is
  // derived from --tab-bar-space / --live-banner-space in CSS, so only the height
  // is measured here (and it stays correct when the banner shows/hides).
  useLayoutEffect(() => {
    const root = document.documentElement
    const el = fabRef.current
    if (!el) return
    const measure = () => root.style.setProperty('--feedback-btn-height', `${Math.ceil(el.getBoundingClientRect().height)}px`)
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', measure)
      root.style.setProperty('--feedback-btn-height', '0px')
    }
  }, [])

  return (
    <>
      <button ref={fabRef} className="feedback-fab" onClick={() => setOpen(true)} aria-label="Send feedback">
        Feedback
      </button>

      {open && createPortal(
        <div style={styles.overlay} role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <div style={styles.card} onClick={e => e.stopPropagation()}>
            <div style={styles.header}>
              <span style={styles.headerTitle}>Share an idea</span>
              <button style={styles.close} aria-label="Close" onClick={() => setOpen(false)}>✕</button>
            </div>
            <div style={styles.body}>
              <SupportForm
                tripId={tripId}
                userId={userId}
                defaultCategory="feature_request"
                intro="Got an idea to make this better? We'd love to hear it — big or small."
                onDone={() => setOpen(false)}
              />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
