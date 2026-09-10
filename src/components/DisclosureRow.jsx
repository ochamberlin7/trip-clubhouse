// Flat settings rows shared by Commissioner Tools and Profile: each row sits on
// the screen's plain background (no card), separated by a hairline divider. A
// Disclosure shows a label + current value + a chevron; tapping the row expands
// its editable fields in place. Rows toggle independently.
import { useState } from 'react'

export const rowUI = {
  divider: { borderBottom: '1px solid #E1E7EE' },
  rowBtn: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '15px 2px', cursor: 'pointer', fontFamily: 'inherit' },
  rowStatic: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '15px 2px' },
  label: { fontSize: 15, fontWeight: 700, color: '#0D1B2A', flexShrink: 0 },
  value: { marginLeft: 'auto', fontSize: 14, color: '#8A98A8', textAlign: 'right', fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 },
  chevronBox: { marginLeft: 10, color: '#B4BECB', display: 'flex', flexShrink: 0 },
  body: { padding: '0 2px 16px' },
  fieldLabel: { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: '#7A8FA6', margin: '10px 0 5px' },
  input: { width: '100%', boxSizing: 'border-box', background: '#EEF2F6', border: '1px solid #DDE3EA', borderRadius: 8, padding: '10px 12px', fontSize: 14, color: '#0D1B2A', fontFamily: 'inherit', outline: 'none' },
  saveRow: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 14 },
  linkBtn: { background: 'none', border: 'none', color: '#1B3F6E', fontSize: 14.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', padding: '2px 2px' },
  note: { fontSize: 12.5, color: '#8A98A8', lineHeight: 1.5, marginTop: 8 },
  ok: { fontSize: 12, color: '#2E7D32', fontWeight: 600 },
  err: { fontSize: 12, color: '#C0392B', marginTop: 8 },
  info: { fontSize: 12.5, color: '#2C3E50', lineHeight: 1.5, marginTop: 8, background: '#EAF1F8', borderRadius: 8, padding: '9px 11px' },
  dangerWrap: { borderTop: '3px solid #D3DBE4', marginTop: 12, paddingTop: 14 },
  dangerBtn: { background: 'none', border: 'none', color: '#C0392B', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', padding: '4px 2px' },
  toggleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 14 },
  toggleLabel: { fontSize: 13.5, color: '#2C3E50', fontWeight: 600 },
}

// Collapsed chevron points right (›); rotates 90° to point down (⌄) when open.
function Chevron({ open }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

export function Disclosure({ label, value, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={rowUI.divider}>
      <button style={rowUI.rowBtn} onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span style={rowUI.label}>{label}</span>
        <span style={rowUI.value}>{value}</span>
        <span style={rowUI.chevronBox}><Chevron open={open} /></span>
      </button>
      {open && <div style={rowUI.body}>{children}</div>}
    </div>
  )
}

// Inline "Save"-style link button, right-aligned, with an optional "Saved ✓".
export function SaveLink({ onClick, saving, saved, label = 'Save', error }) {
  return (
    <>
      {error && <div style={rowUI.err}>{error}</div>}
      <div style={rowUI.saveRow}>
        {saved && <span style={rowUI.ok}>Saved ✓</span>}
        <button style={rowUI.linkBtn} onClick={onClick} disabled={saving}>{saving ? 'Saving…' : label}</button>
      </div>
    </>
  )
}

export function Toggle({ on, onClick, label }) {
  return (
    <div style={rowUI.toggleRow}>
      <span style={rowUI.toggleLabel}>{label}</span>
      <button role="switch" aria-checked={on} onClick={onClick} aria-label={label}
        style={{ width: 44, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', flexShrink: 0, padding: 0, position: 'relative', background: on ? '#1B3F6E' : '#cccccc', transition: 'background 0.15s' }}>
        <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
      </button>
    </div>
  )
}
