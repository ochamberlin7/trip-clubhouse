import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './ui/Icon'

// Tee-time entry shared by the Tee times tab and Schedule and courses, so both
// places read and write the same rounds.tee_time_N columns with the same picker.
//
// Tee times are stored as trip-local display strings ("7:45 AM"), one per pairing
// slot (tee_time_1 … tee_time_5). The cell shows the value (or TBD) and, for a
// commissioner, opens a custom hour / minute / AM-PM picker on tap.

const TEE_HOURS = Array.from({ length: 12 }, (_, i) => i + 1)      // 1..12
const TEE_MINUTES = Array.from({ length: 60 }, (_, i) => i)        // 0,1,...,59 (every minute)

// Parse a stored display time ("7:45 AM") into picker parts; default 8:00 AM.
function parseDisplayTime(disp) {
  const m = (disp || '').match(/(\d+):(\d+)\s*(AM|PM)/i)
  if (!m) return { h: 8, m: 0, ap: 'AM' }
  return { h: Number(m[1]), m: Number(m[2]), ap: m[3].toUpperCase() }
}

// Picker popover styles. Rendered via a portal to document.body and fixed-centred
// so a parent card's overflow:hidden can't clip it.
const tp = {
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999, touchAction: 'none' },
  popover: { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 1000, background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-pop)', padding: 16, width: 240 },
  cols: { display: 'flex', gap: 8 },
  colWrap: { flex: 1, minWidth: 0 },
  colLabel: { fontSize: 9, fontWeight: 600, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--slate)', textAlign: 'center', marginBottom: 4 },
  // overscrollBehavior:contain + touchAction:pan-y keep touch scrolling inside the
  // list instead of chaining to the page behind the popover.
  list: { height: 150, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', touchAction: 'pan-y', display: 'flex', flexDirection: 'column', gap: 2, padding: 3, background: 'var(--paper-2)', borderRadius: 'var(--radius)' },
  item: { padding: '7px 0', fontSize: 14, fontWeight: 600, color: 'var(--ink-2)', background: 'none', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 },
  itemActive: { background: 'var(--primary)', color: 'var(--paper)', fontWeight: 700 },
  apCol: { display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' },
  ap: { padding: '8px 12px', fontSize: 13, fontWeight: 700, color: 'var(--slate)', background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'inherit' },
  apActive: { background: 'var(--primary)', color: 'var(--paper)', border: '1px solid var(--primary)' },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  cancel: { background: 'none', border: 'none', color: 'var(--slate)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: '6px 4px' },
  confirm: { width: 38, height: 38, borderRadius: '50%', background: 'var(--primary)', color: 'var(--paper)', border: 'none', fontSize: 18, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' },
}

// Two sizes: 'lg' for the Tee times tab (the time is the headline), 'sm' for the
// Schedule and courses round card (one detail row among several).
const SIZES = {
  lg: { time: 17, tbd: 13 },
  sm: { time: 13, tbd: 12 },
}

const timeStyle = size => ({ fontFamily: 'var(--font-serif)', fontVariantNumeric: 'tabular-nums lining-nums', fontSize: SIZES[size].time, fontWeight: 700, color: 'var(--primary)' })
const tbdStyle = size => ({ fontSize: SIZES[size].tbd, fontWeight: 600, color: 'var(--slate)' })

export default function TeeTimeCell({ round, slot, isCommissioner, onSave, size = 'lg' }) {
  const col = `tee_time_${slot}` // slot 1..5 → tee_time_1..tee_time_5
  const value = round[col]
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(() => parseDisplayTime(value))
  const hourListRef = useRef(null)
  const minListRef = useRef(null)

  // Lock the page (which scrolls the window/body — there's no inner scroll
  // container) while the picker is open, so dragging the hour/minute lists scrolls
  // THEM, not the page behind the fixed popover. iOS-safe: pin the body with
  // position:fixed and restore the scroll offset on close.
  useEffect(() => {
    if (!open) return
    const scrollY = window.scrollY
    const b = document.body
    const prev = { position: b.style.position, top: b.style.top, left: b.style.left, right: b.style.right, width: b.style.width, overflow: b.style.overflow }
    b.style.position = 'fixed'
    b.style.top = `-${scrollY}px`
    b.style.left = '0'
    b.style.right = '0'
    b.style.width = '100%'
    b.style.overflow = 'hidden'
    return () => {
      b.style.position = prev.position
      b.style.top = prev.top
      b.style.left = prev.left
      b.style.right = prev.right
      b.style.width = prev.width
      b.style.overflow = prev.overflow
      window.scrollTo(0, scrollY)
    }
  }, [open])

  // When the picker opens, scroll the currently-selected hour and minute into the
  // centre of their (fixed-height, scrollable) columns. Without this, editing an
  // already-set time opens the lists at the top — the saved value is highlighted
  // but off-screen, so it looks blank/reset (esp. with 60 minute rows).
  useLayoutEffect(() => {
    if (!open) return
    for (const listRef of [hourListRef, minListRef]) {
      const list = listRef.current
      if (!list) continue
      const active = list.querySelector('[data-active="true"]')
      if (active) list.scrollTop = active.offsetTop - list.clientHeight / 2 + active.offsetHeight / 2
    }
  }, [open])

  function openPicker() {
    setDraft(parseDisplayTime(value))
    setOpen(true)
  }
  function confirm() {
    onSave(round.id, col, `${draft.h}:${String(draft.m).padStart(2, '0')} ${draft.ap}`)
    setOpen(false)
  }

  if (!isCommissioner) {
    return value
      ? <span style={timeStyle(size)}>{value}</span>
      : <span style={tbdStyle(size)}>TBD</span>
  }

  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {value ? (
        <>
          <button onClick={openPicker} aria-label={`Change tee time for pairing ${slot}`} style={{ ...timeStyle(size), background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>{value}</button>
          <button onClick={() => onSave(round.id, col, null)} aria-label={`Clear tee time for pairing ${slot}`} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, color: 'var(--slate)' }}>Clear</button>
        </>
      ) : (
        <button onClick={openPicker} aria-label={`Set tee time for pairing ${slot}`} style={{ background: 'var(--paper)', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '4px 12px', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700 }}>TBD</button>
      )}

      {open && createPortal(
        <>
          {/* Tap outside to cancel. */}
          <div onClick={() => setOpen(false)} style={tp.backdrop} />
          <div style={tp.popover} role="dialog" aria-label="Pick tee time">
            <div style={tp.cols}>
              <div style={tp.colWrap}>
                <div style={tp.colLabel}>Hour</div>
                <div ref={hourListRef} style={tp.list}>
                  {TEE_HOURS.map(h => (
                    <button key={h} data-active={draft.h === h ? 'true' : undefined} onClick={() => setDraft(d => ({ ...d, h }))}
                      style={{ ...tp.item, ...(draft.h === h ? tp.itemActive : null) }}>{h}</button>
                  ))}
                </div>
              </div>
              <div style={tp.colWrap}>
                <div style={tp.colLabel}>Min</div>
                <div ref={minListRef} style={tp.list}>
                  {TEE_MINUTES.map(m => (
                    <button key={m} data-active={draft.m === m ? 'true' : undefined} onClick={() => setDraft(d => ({ ...d, m }))}
                      style={{ ...tp.item, ...(draft.m === m ? tp.itemActive : null) }}>{String(m).padStart(2, '0')}</button>
                  ))}
                </div>
              </div>
              <div style={tp.apCol}>
                {['AM', 'PM'].map(ap => (
                  <button key={ap} onClick={() => setDraft(d => ({ ...d, ap }))}
                    style={{ ...tp.ap, ...(draft.ap === ap ? tp.apActive : null) }}>{ap}</button>
                ))}
              </div>
            </div>
            <div style={tp.footer}>
              <button onClick={() => setOpen(false)} style={tp.cancel}>Cancel</button>
              <button onClick={confirm} style={tp.confirm} aria-label="Confirm time"><Icon name="check" size={16} /></button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </span>
  )
}
