// Stripe-style settings rows (Commissioner Tools redesign, mockup "1C",
// 2026-10-30): grey section stripes like the trip wizard, and rows with a
// small-caps label above a serif value. Fonts: Fraunces (values) + Inter
// (labels, stripes) via --font-fraunces / --font-inter in index.css.
// A row either expands in place (children = render fn receiving { close }) or
// navigates (onClick).
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { rowUI, SaveLink } from './DisclosureRow'
import { saveTripName, timeZoneOptions, TRIP_NAME_MAX } from '../lib/tripSettings'

const st = {
  page: { fontFamily: 'var(--font-inter)', display: 'flex', flexDirection: 'column', gap: 22, color: '#0D1B2A' },
  intro: { margin: 0, fontFamily: 'var(--font-fraunces)', fontStyle: 'italic', fontSize: 17, lineHeight: 1.4, color: '#2C3E50' },
  section: { display: 'flex', flexDirection: 'column' },
  stripe: { display: 'flex', alignItems: 'center', gap: 8, margin: 0, background: '#DFE5ED', color: '#1B3F6E', padding: '8px 10px', minHeight: 34, boxSizing: 'border-box', fontSize: 11.5, fontWeight: 700, letterSpacing: 1.6, textTransform: 'uppercase' },
  stripeDetail: { marginLeft: 'auto', fontSize: 12.5, fontWeight: 500, letterSpacing: 0, textTransform: 'none', color: '#4F6178', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 },
  row: { borderBottom: '1px solid #E3E1DA' },
  rowBtn: { display: 'flex', alignItems: 'center', gap: 12, width: '100%', background: 'none', border: 'none', padding: '14px 2px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit' },
  rowStatic: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 2px' },
  text: { flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 },
  label: { fontSize: 10.5, fontWeight: 600, letterSpacing: 1.6, textTransform: 'uppercase', color: '#5F6B7A' },
  value: { fontFamily: 'var(--font-fraunces)', fontSize: 18, color: '#0D1B2A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  sub: { fontSize: 13, fontWeight: 500, color: '#4F6178', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  detail: { fontSize: 12.5, fontWeight: 500, color: '#4F6178', flexShrink: 0, maxWidth: '45%', textAlign: 'right' },
  chevron: { color: '#9AA6B5', display: 'flex', flexShrink: 0 },
  body: { padding: '0 2px 16px' },
  outlineBtn: { flexShrink: 0, background: 'transparent', color: '#1B3F6E', border: '1px solid #1B3F6E', borderRadius: 4, padding: '10px 14px', fontSize: 11, fontWeight: 700, letterSpacing: 1.6, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit' },
  danger: { borderTop: '3px solid #D3DBE4', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 4 },
  dangerNote: { margin: 0, fontSize: 12, fontWeight: 500, color: '#5F6B7A', lineHeight: 1.45 },
  dangerBtn: { alignSelf: 'flex-start', background: 'none', border: 'none', padding: '10px 0', color: '#C0392B', fontSize: 11.5, fontWeight: 800, letterSpacing: 1.6, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit' },
}

function Chevron({ open = false }) {
  return (
    <span style={st.chevron}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
        style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s ease' }}>
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </span>
  )
}

export function StripePage({ intro, children }) {
  return (
    <div style={st.page}>
      {intro && <p style={st.intro}>{intro}</p>}
      {children}
    </div>
  )
}

export function StripeSection({ title, detail, children }) {
  return (
    <section style={st.section}>
      <p style={st.stripe}>{title}{detail && <span style={st.stripeDetail}>{detail}</span>}</p>
      {children}
    </section>
  )
}

// A settings row. With `children` (a render fn) it expands in place; with
// `onClick` it navigates. `detail` is a short note on the right.
export function StripeRow({ label, value, detail, onClick, children }) {
  const [open, setOpen] = useState(false)
  const expands = typeof children === 'function'
  return (
    <div style={st.row}>
      <button style={st.rowBtn} onClick={expands ? () => setOpen(o => !o) : onClick} aria-expanded={expands ? open : undefined}>
        <span style={st.text}>
          <span style={st.label}>{label}</span>
          <span style={st.value}>{value}</span>
        </span>
        {detail && <span style={st.detail}>{detail}</span>}
        <Chevron open={expands && open} />
      </button>
      {expands && open && <div style={st.body}>{children({ close: () => setOpen(false) })}</div>}
    </div>
  )
}

// Invite link row: the link itself plus a Copy link button.
export function StripeInviteRow({ url }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(url) } catch { /* ignore */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div style={{ ...st.row, ...st.rowStatic }}>
      <span style={st.text}>
        <span style={st.label}>Invite link</span>
        <span style={st.sub}>{url.replace(/^https?:\/\//, '')}</span>
      </span>
      <button style={st.outlineBtn} onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
    </div>
  )
}

export function StripeDanger({ note, label, busyLabel, onClick, busy }) {
  return (
    <div style={st.danger}>
      <p style={st.dangerNote}>{note}</p>
      <button style={st.dangerBtn} onClick={onClick} disabled={busy}>{busy ? busyLabel : label}</button>
    </div>
  )
}

// ── Editors for the two settings that are new here ──────────────────

export function TripNameBody({ tripId, name, onSaved, onClose }) {
  const [value, setValue] = useState(name || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')
  async function save() {
    setErr(''); setSaving(true)
    const r = await saveTripName(supabase, tripId, value, name)
    setSaving(false)
    if (r.error) { setErr(r.error); return }
    if (!r.unchanged) { setSaved(true); setTimeout(() => setSaved(false), 2000); onSaved?.(r.name) }
    onClose?.()
  }
  return (
    <>
      <label htmlFor="ct-trip-name" style={rowUI.fieldLabel}>Trip name</label>
      <input id="ct-trip-name" style={rowUI.input} value={value} maxLength={TRIP_NAME_MAX} onChange={e => setValue(e.target.value)} />
      <SaveLink onClick={save} saving={saving} saved={saved} error={err} />
    </>
  )
}

export function TimeZoneBody({ tripId, timeZone, onSaved, onClose }) {
  const [value, setValue] = useState(timeZone || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')
  async function save() {
    setErr('')
    const next = value || null
    if (next === (timeZone || null)) { onClose?.(); return }
    setSaving(true)
    const { error } = await supabase.from('trips').update({ time_zone: next }).eq('id', tripId)
    setSaving(false)
    if (error) { setErr(`Save failed: ${error.message || 'unknown error'}`); return }
    setSaved(true); setTimeout(() => setSaved(false), 2000)
    onSaved?.(next)
    onClose?.()
  }
  return (
    <>
      <label htmlFor="ct-time-zone" style={rowUI.fieldLabel}>Time zone</label>
      <select id="ct-time-zone" style={rowUI.input} value={value} onChange={e => setValue(e.target.value)}>
        <option value="">Not set (each phone uses its own)</option>
        {timeZoneOptions(timeZone).map(z => <option key={z.value} value={z.value}>{z.label}</option>)}
      </select>
      <div style={rowUI.note}>Where the trip is. Decides when each trip day starts, so everyone sees the same “today” wherever they are.</div>
      <SaveLink onClick={save} saving={saving} saved={saved} error={err} />
    </>
  )
}
