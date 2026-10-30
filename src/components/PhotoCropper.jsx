// Full-screen "Move and scale" window shown after picking a profile photo — the
// common iOS Contacts / WhatsApp / Instagram pattern: the photo sits behind a
// round cutout, drag to move, pinch (or the slider) to zoom, the photo always
// covers the circle. Built on react-easy-crop. Rendered in a portal so it covers
// the whole screen even when opened from inside the menu drawer.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Cropper from 'react-easy-crop'

const MAX_ZOOM = 4 // relative to the starting (zoomed-out) view
// Circle diameter: leave a margin on phones, cap it on big screens.
const circleSize = () => Math.max(200, Math.min(window.innerWidth - 56, window.innerHeight - 260, 380))

const st = {
  shell: { position: 'fixed', inset: 0, zIndex: 1000, background: '#0B1626', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
  bar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', paddingTop: 'max(env(safe-area-inset-top), 12px)', color: '#fff' },
  title: { fontFamily: "'Playfair Display', Georgia, serif", fontSize: 18, fontWeight: 700 },
  cancel: { background: 'none', border: 'none', color: '#C7D6EA', fontSize: 16, fontFamily: 'inherit', padding: '6px 2px', cursor: 'pointer' },
  save: { background: '#C49A2A', border: 'none', color: '#fff', fontSize: 15, fontWeight: 700, fontFamily: 'inherit', padding: '8px 18px', borderRadius: 999, cursor: 'pointer' },
  stage: { position: 'relative', flex: 1, minHeight: 0 },
  bottom: { padding: '14px 24px', paddingBottom: 'max(calc(env(safe-area-inset-bottom) + 14px), 22px)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 },
  hint: { fontSize: 13, color: '#AFC2DE' },
  sliderRow: { display: 'flex', alignItems: 'center', gap: 12, width: '100%', maxWidth: 360 },
  slider: { flex: 1, accentColor: '#C49A2A' },
  err: { fontSize: 13, color: '#F09595', textAlign: 'center' },
}

function ZoomIcon({ plus }) {
  return (
    <svg width={plus ? 22 : 16} height={plus ? 22 : 16} viewBox="0 0 24 24" fill="none" stroke="#C7D6EA" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 15l5-5 4 4 3-3 6 6" />
    </svg>
  )
}

// imageUrl: object URL of the picked file. onSave(croppedAreaPixels) uploads;
// onCancel closes. busy/error come from the caller while saving.
export default function PhotoCropper({ imageUrl, onSave, onCancel, busy = false, error = '' }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [area, setArea] = useState(null)
  const [size, setSize] = useState(circleSize)
  // Start zoomed out so the photo's short side just fills the circle (you can
  // zoom in from there, never out past a gap). react-easy-crop's zoom 1 = the
  // photo covering the whole screen area, so this is usually below 1.
  const [minZoom, setMinZoom] = useState(1)
  function onMediaLoaded(media) {
    const short = Math.min(media.width, media.height)
    if (!(short > 0)) return
    const mz = Math.min(1, size / short)
    setMinZoom(mz)
    setZoom(mz)
  }

  useEffect(() => {
    const onResize = () => setSize(circleSize())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !busy) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  return createPortal(
    <div style={st.shell} role="dialog" aria-modal="true" aria-label="Move and scale your photo">
      <div style={st.bar}>
        <button style={st.cancel} onClick={onCancel} disabled={busy}>Cancel</button>
        <div style={st.title}>Move and scale</div>
        <button style={{ ...st.save, opacity: busy || !area ? 0.6 : 1 }} onClick={() => area && onSave(area)} disabled={busy || !area}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div style={st.stage}>
        <Cropper
          image={imageUrl}
          crop={crop}
          zoom={zoom}
          minZoom={minZoom}
          maxZoom={minZoom * MAX_ZOOM}
          onMediaLoaded={onMediaLoaded}
          aspect={1}
          cropSize={{ width: size, height: size }}
          cropShape="round"
          showGrid={false}
          objectFit="cover"
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(_, pixels) => setArea(pixels)}
          style={{ cropAreaStyle: { border: '2px solid #C49A2A', color: 'rgba(11, 22, 38, 0.72)' } }}
        />
      </div>
      <div style={st.bottom}>
        {error ? <div style={st.err}>{error}</div> : <div style={st.hint}>Drag to move · pinch or slide to zoom</div>}
        <div style={st.sliderRow}>
          <ZoomIcon />
          <input type="range" min={minZoom} max={minZoom * MAX_ZOOM} step={0.005} value={zoom} aria-label="Zoom"
            onChange={e => setZoom(Number(e.target.value))} style={st.slider} />
          <ZoomIcon plus />
        </div>
      </div>
    </div>,
    document.body,
  )
}
