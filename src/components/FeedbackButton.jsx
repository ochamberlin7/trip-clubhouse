import { useState } from 'react'
import { createPortal } from 'react-dom'
import SupportForm from './SupportForm'

// Persistent floating action button shown across all dashboard tabs. Opens the
// shared SupportForm pre-set to "feature_request" with lighter, suggestion-y
// copy. Positioned to sit above BOTH the bottom tab bar and the live-score
// banner: --live-banner-space (0 when hidden) already spans down through the tab
// bar when the banner shows, so max() clears whichever is taller. z-index 201 is
// above the banner (200) but below modals/drawer (>=300).
const styles = {
  // Small, low-profile "Feedback" pill (not a bold FAB) — subtle so it doesn't
  // compete with content, but still reachable in the bottom corner.
  fab: {
    position: 'fixed',
    right: '14px',
    bottom: 'calc(max(var(--tab-bar-space), var(--live-banner-space, 0px)) + 10px)',
    zIndex: 201,
    padding: '5px 11px',
    borderRadius: '16px',
    background: '#1B3F6E',
    color: '#FFFFFF',
    border: 'none',
    boxShadow: '0 1px 4px rgba(13,27,42,0.2)',
    fontSize: '12px',
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { position: 'relative', background: '#fff', borderRadius: '14px', width: '100%', maxWidth: 400, maxHeight: 'calc(100vh - 40px)', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.25)' },
  header: { position: 'relative', background: '#1B3F6E', color: '#fff', padding: '12px 44px 12px 16px', borderRadius: '14px 14px 0 0' },
  headerTitle: { fontFamily: "'Playfair Display', Georgia, serif", fontSize: '18px', fontWeight: 700 },
  close: { position: 'absolute', top: '50%', right: 10, transform: 'translateY(-50%)', width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 15, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
  body: { padding: '16px' },
}

export default function FeedbackButton({ tripId, userId }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button style={styles.fab} onClick={() => setOpen(true)} aria-label="Send feedback">
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
