import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import CourseSearchInput from './CourseSearchInput'
import { teamPillStyle, teamColor, colorIndexOf, getTeamDisplayName } from '../lib/teamColors'

// Slide-out menu drawer + full-screen secondary pages (CTI Clubhouse model).
// The drawer slides from the right; tapping a menu item hides the drawer and
// slides a secondary page over the screen. The page's back button returns to
// the drawer.

// ── date helpers ──────────────────────────────────────────────────
const WD = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function parseDate(iso) { if (!iso) return null; const d = new Date(iso + 'T00:00:00'); return isNaN(d) ? null : d }
function fmtShort(iso) { const d = parseDate(iso); return d ? `${WD[d.getDay()]}, ${MO[d.getMonth()]} ${d.getDate()}` : '' }
function fmtLong(iso) { const d = parseDate(iso); return d ? `${WD[d.getDay()]}, ${MO[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` : '—' }
function fmtRange(s, e) {
  const a = parseDate(s), b = parseDate(e)
  if (!a && !b) return '—'
  if (a && !b) return `${MO[a.getMonth()]} ${a.getDate()}, ${a.getFullYear()}`
  if (!a && b) return `${MO[b.getMonth()]} ${b.getDate()}, ${b.getFullYear()}`
  return `${MO[a.getMonth()]} ${a.getDate()} – ${MO[b.getMonth()]} ${b.getDate()}, ${b.getFullYear()}`
}

// ── styles ────────────────────────────────────────────────────────
const s = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, transition: 'opacity 0.25s ease' },
  drawer: { position: 'fixed', right: 0, top: 0, bottom: 0, width: '280px', maxWidth: '85vw', background: '#FFFFFF', borderLeft: '1px solid #DDE3EA', zIndex: 301, display: 'flex', flexDirection: 'column', transition: 'transform 0.25s ease', boxShadow: '-4px 0 20px rgba(0,0,0,0.1)' },
  drawerHeader: { padding: '20px 16px 12px', borderBottom: '1px solid #DDE3EA', position: 'relative' },
  groupLine: { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1.5px', color: '#1B3F6E', fontWeight: 600 },
  tripLine: { fontSize: '18px', fontWeight: 700, color: '#0D1B2A', marginTop: '2px' },
  closeBtn: { position: 'absolute', top: '16px', right: '16px', width: '32px', height: '32px', borderRadius: '50%', background: '#E8EDF3', border: 'none', color: '#7A8FA6', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  nav: { flex: 1, overflowY: 'auto', padding: '12px 0' },
  item: { display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', cursor: 'pointer', borderBottom: '1px solid #E8EDF3', background: '#fff', width: '100%', border: 'none', textAlign: 'left', fontFamily: 'inherit' },
  iconBox: { width: '36px', height: '36px', borderRadius: '6px', background: '#E8EDF3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  itemLabel: { fontSize: '15px', fontWeight: 600, color: '#0D1B2A' },
  itemSub: { fontSize: '11px', color: '#7A8FA6', marginTop: '1px' },

  page: { position: 'fixed', inset: 0, zIndex: 200, background: '#F0F4F8', overflowY: 'auto', display: 'flex', flexDirection: 'column' },
  pageHeader: { position: 'sticky', top: 0, zIndex: 10, background: '#fff', padding: '16px 16px 12px', borderBottom: '1px solid #DDE3EA', display: 'flex', alignItems: 'center', gap: '12px' },
  backBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#1B3F6E', padding: 0, display: 'flex', alignItems: 'center', flexShrink: 0 },
  pageContext: { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1.5px', color: '#1B3F6E', fontWeight: 500 },
  pageTitle: { fontSize: '20px', fontWeight: 700, color: '#0D1B2A', marginTop: '1px' },
  pageBody: { padding: '16px' },

  card: { background: '#fff', border: '1px solid #DDE3EA', borderRadius: '10px', overflow: 'hidden', marginBottom: '12px' },
  cardHeader: { background: '#1B3F6E', padding: '10px 14px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: '#fff' },
  cardBody: { padding: '14px' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #E8EDF3' },
  rowLabel: { fontSize: '13px', color: '#7A8FA6' },
  rowValue: { fontSize: '13px', fontWeight: 600, color: '#0D1B2A' },
  muted: { fontSize: '13px', color: '#7A8FA6', fontStyle: 'italic' },
  note: { fontSize: '12px', color: '#7A8FA6', fontStyle: 'italic', textAlign: 'center', padding: '4px 0 8px' },

  badge: { fontSize: '10px', padding: '2px 7px', borderRadius: '10px', fontWeight: 700, display: 'inline-block' },
  badgeTour: { background: 'rgba(27,63,110,0.1)', color: '#1B3F6E', border: '1px solid #1B3F6E' },
  badgePrac: { background: '#E8EDF3', color: '#7A8FA6', border: '1px solid #DDE3EA' },

  dot: { width: '6px', height: '6px', borderRadius: '50%', background: '#1B3F6E', flexShrink: 0, marginTop: '7px' },
  ruleRow: { display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid #E8EDF3', fontSize: '13px', lineHeight: 1.5, color: '#0D1B2A' },

  toggleRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid #E8EDF3', background: '#fff', width: '100%', border: 'none', fontFamily: 'inherit', textAlign: 'left' },
  stepRow: { display: 'flex', gap: '12px', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid #E8EDF3' },
  stepNum: { width: '22px', height: '22px', borderRadius: '50%', background: '#1B3F6E', color: '#fff', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepText: { fontSize: '13px', color: '#0D1B2A', lineHeight: 1.4 },
  introText: { fontSize: '13px', color: '#2C3E50', lineHeight: 1.5, paddingBottom: '10px' },
  editCourseBtn: { marginTop: '8px', background: '#fff', border: '1px solid #DDE3EA', color: '#1B3F6E', fontSize: '12px', fontWeight: 700, borderRadius: '6px', padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' },

  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modalSheet: { background: '#fff', borderRadius: '12px', padding: '24px', width: 'calc(100% - 40px)', maxWidth: '480px', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' },
  modalTitle: { fontSize: '18px', fontWeight: 700, color: '#0D1B2A', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  modalClose: { width: '28px', height: '28px', borderRadius: '50%', background: '#E8EDF3', border: 'none', color: '#7A8FA6', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
}

const svgProps = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: '#1B3F6E', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }

const MENU_ITEMS = [
  { id: 'players', label: 'Players', sub: 'Roster & teams', icon: <g><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></g> },
  { id: 'courses', label: 'Courses', sub: 'Schedule & course info', icon: <g><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></g> },
  { id: 'flights', label: 'Flights', sub: 'Arrival & departure info', icon: <g><path d="M22 2L11 13"/><path d="M22 2L15 22l-4-9-9-4 20-7z"/></g> },
  { id: 'rules', label: 'Rules', sub: 'Local rules & format', icon: <g><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></g> },
  { id: 'archives', label: 'Archives', sub: 'Past trips & records', icon: <g><path d="M21 8v13H3V8"/><rect x="1" y="3" width="22" height="5" rx="1"/><line x1="10" y1="12" x2="14" y2="12"/></g> },
  { id: 'app-info', label: 'App Info', sub: 'Install guide & about', icon: <g><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></g> },
]

// Commissioner-only item, rendered at the top of the drawer when isCommissioner.
const COMMISSIONER_ITEM = { id: 'commissioner', label: 'Commissioner Tools', sub: 'Teams, allowance & invites', icon: <g><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></g> }

// ── small building blocks ─────────────────────────────────────────
function Chevron({ open }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7A8FA6" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'none' }}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function Card({ title, children }) {
  return (
    <div style={s.card}>
      <div style={s.cardHeader}>{title}</div>
      <div style={s.cardBody}>{children}</div>
    </div>
  )
}

function InfoRow({ label, value, last }) {
  return (
    <div style={{ ...s.row, ...(last ? { borderBottom: 'none' } : null) }}>
      <span style={s.rowLabel}>{label}</span>
      <span style={s.rowValue}>{value}</span>
    </div>
  )
}

function RuleList({ rules }) {
  return rules.map((r, i) => (
    <div key={i} style={{ ...s.ruleRow, ...(i === rules.length - 1 ? { borderBottom: 'none' } : null) }}>
      <span style={s.dot} /><span>{r}</span>
    </div>
  ))
}

function Expandable({ title, sub, steps }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button style={s.toggleRow} onClick={() => setOpen(o => !o)}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#0D1B2A' }}>{title}</div>
          <div style={{ fontSize: '11px', color: '#7A8FA6', marginTop: '1px' }}>{sub}</div>
        </div>
        <Chevron open={open} />
      </button>
      {open && (
        <div>
          {steps.map((step, i) => (
            <div key={i} style={{ ...s.stepRow, ...(i === steps.length - 1 ? { borderBottom: 'none' } : null) }}>
              <span style={s.stepNum}>{i + 1}</span>
              <span style={s.stepText}>{step}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── secondary pages ───────────────────────────────────────────────
function SecondaryPage({ context, title, onBack, children }) {
  return (
    <div style={s.page}>
      <div style={s.pageHeader}>
        <button style={s.backBtn} onClick={onBack} aria-label="Back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div>
          <div style={s.pageContext}>{context}</div>
          <div style={s.pageTitle}>{title}</div>
        </div>
      </div>
      <div style={s.pageBody}>{children}</div>
    </div>
  )
}

function initials(name) {
  return (name || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
}

function playerInitials(p) {
  const fl = `${(p.first_name || '')[0] || ''}${(p.last_name || '')[0] || ''}`.toUpperCase()
  return fl || initials(p.name)
}

// Normalize any phone input to (XXX) XXX-XXXX. Falls back to the trimmed input
// if it isn't a recognizable 10-digit (or 1+10) US number.
function formatPhone(raw) {
  const trimmed = (raw || '').trim()
  let d = trimmed.replace(/\D/g, '')
  if (d.length === 11 && d[0] === '1') d = d.slice(1)
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  return trimmed
}

const pc = {
  card: { background: '#FFFFFF', border: '1px solid #DDE3EA', borderRadius: 10, padding: 14, marginBottom: 10 },
  header: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatar: { width: 40, height: 40, borderRadius: '50%', background: '#1B3F6E', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 },
  name: { fontSize: 16, fontWeight: 700, color: '#0D1B2A', flex: 1, minWidth: 0 },
  joined: { color: '#2E7D32', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 8, fontWeight: 600 },
  joinedDot: { width: 8, height: 8, borderRadius: '50%', background: '#2E7D32', display: 'inline-block' },
  badge: { background: 'rgba(192,57,43,0.08)', color: '#C0392B', border: '1px solid rgba(192,57,43,0.25)', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, letterSpacing: '0.5px', flexShrink: 0, whiteSpace: 'nowrap' },
  teamPill: { fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, flexShrink: 0, whiteSpace: 'nowrap', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis' },
  pencil: { background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#7A8FA6', flexShrink: 0, display: 'flex', alignItems: 'center' },
  detailRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #E8EDF3', fontSize: 13, color: '#2C3E50' },
  detailLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#7A8FA6', minWidth: 72 },
  muted: { color: '#7A8FA6' },
  editInput: { background: '#F5F8FA', border: '1px solid #DDE3EA', borderRadius: 8, padding: '8px 10px', fontSize: 14, width: '100%', fontFamily: 'inherit', color: '#0D1B2A' },
  saveBtn: { background: '#1B3F6E', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function PlayerCard({ player, teams, isCommissioner, commissioner, editing, onStartEdit, onCloseEdit, onSaved }) {
  const [form, setForm] = useState({
    first_name: player.first_name || '', last_name: player.last_name || '',
    email: player.email || '',
    handicap_index: player.handicap_index ?? '', team_id: player.team_id || '', phone: player.phone || '',
  })
  const [saving, setSaving] = useState(false)

  // Reset the form to the player's values each time edit mode opens.
  useEffect(() => {
    if (editing) {
      setForm({
        first_name: player.first_name || '', last_name: player.last_name || '',
        email: player.email || '',
        handicap_index: player.handicap_index ?? '', team_id: player.team_id || '', phone: player.phone || '',
      })
    }
  }, [editing, player])

  // Colour the team pill by the team's stable index (1 navy, 2 teal, …), never by name.
  const team = teams.find(t => t.id === player.team_id) || null
  const teamPillColor = teamPillStyle(colorIndexOf(team))

  async function save() {
    setSaving(true)
    const { error } = await supabase.from('trip_players').update({
      first_name: form.first_name.trim() || null,
      last_name: form.last_name.trim() || null,
      email: form.email.trim() || null,
      handicap_index: form.handicap_index === '' ? null : Number(form.handicap_index),
      team_id: form.team_id || null,
      phone: form.phone.trim() ? formatPhone(form.phone) : null,
    }).eq('id', player.id)
    setSaving(false)
    if (!error) onSaved()
  }

  return (
    <div style={pc.card}>
      {/* Header */}
      <div style={pc.header}>
        <div style={pc.avatar}>{playerInitials(player)}</div>
        <div style={pc.name}>
          {player.name}
          {player.is_claimed && (
            <span style={pc.joined}><span style={pc.joinedDot} />Joined</span>
          )}
        </div>
        {commissioner && <span style={pc.badge}>Commissioner</span>}
        {team && <span style={{ ...pc.teamPill, ...teamPillColor }}>{getTeamDisplayName(team)}</span>}
        {isCommissioner && !editing && (
          <button style={pc.pencil} onClick={onStartEdit} aria-label="Edit player"><PencilIcon /></button>
        )}
      </div>

      {/* View-mode details */}
      {!editing && (
        <div>
          <div style={pc.detailRow}>
            <span style={pc.detailLabel}>Email</span>
            {player.email
              ? <a href={`mailto:${player.email}`} style={{ color: '#1B3F6E', textDecoration: 'none', fontSize: 12 }}>{player.email}</a>
              : <span style={pc.muted}>—</span>}
          </div>
          <div style={pc.detailRow}>
            <span style={pc.detailLabel}>Phone</span>
            {player.phone
              ? <a href={`tel:${player.phone}`} style={{ color: '#2C3E50', textDecoration: 'none' }}>{player.phone}</a>
              : <span style={pc.muted}>—</span>}
          </div>
          <div style={{ ...pc.detailRow, ...(isCommissioner ? null : { borderBottom: 'none' }) }}>
            <span style={pc.detailLabel}>Handicap</span>
            {player.handicap_index != null
              ? <span style={{ color: '#0D1B2A', fontWeight: 600 }}>{player.handicap_index}</span>
              : <span style={{ color: '#1B3F6E', fontWeight: 700 }}>TBD</span>}
          </div>
          {isCommissioner && (
            <div style={{ ...pc.detailRow, borderBottom: 'none', cursor: 'pointer' }} onClick={onStartEdit}>
              <span style={pc.detailLabel}>Team</span>
              <span>{team ? getTeamDisplayName(team) : 'Unassigned'}</span>
            </div>
          )}
        </div>
      )}

      {/* Edit panel */}
      {editing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={pc.editInput} placeholder="First name" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} />
            <input style={pc.editInput} placeholder="Last name" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={pc.editInput} type="number" step="0.1" min="0" max="54" placeholder="e.g. 14.2" value={form.handicap_index} onChange={e => setForm({ ...form, handicap_index: e.target.value })} />
            <select style={pc.editInput} value={form.team_id} onChange={e => setForm({ ...form, team_id: e.target.value })}>
              <option value="">Unassigned</option>
              {teams.map(t => <option key={t.id} value={t.id}>{getTeamDisplayName(t)}</option>)}
            </select>
          </div>
          <input style={pc.editInput} placeholder="(555) 000-0000" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          <input style={pc.editInput} type="email" placeholder="Email (optional)" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
            <button onClick={save} disabled={saving} style={{ background: '#1B3F6E', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{saving ? 'Saving…' : 'Save'}</button>
            <button onClick={onCloseEdit} style={{ background: 'transparent', border: 'none', color: '#7A8FA6', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

function InviteSection({ inviteToken }) {
  const [copied, setCopied] = useState(false)
  const url = `https://thetripclubhouse.com/join/${inviteToken || ''}`
  async function copy() {
    try { await navigator.clipboard.writeText(url) } catch { /* ignore */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <Card title="Invite Players">
      <div style={{ fontSize: 13, color: '#2C3E50', lineHeight: 1.5 }}>
        Share this link with your group. Anyone who joins via this link will be added to the trip.
      </div>
      <div style={{ background: '#E8EDF3', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#7A8FA6', wordBreak: 'break-all', marginTop: 8 }}>{url}</div>
      <button onClick={copy} className="btn btn-outline" style={{ marginTop: 8 }}>{copied ? 'Copied!' : 'Copy Link'}</button>
      <div style={{ fontSize: 11, color: '#7A8FA6', fontStyle: 'italic', marginTop: 8 }}>
        Players who join via this link will appear here once they sign in and accept the invite.
      </div>
    </Card>
  )
}

function PlayersPage({ data, isCommissioner, onReload }) {
  const [editingId, setEditingId] = useState(null)
  if (!data) return <div style={s.muted}>Loading…</div>
  const { players, teams } = data

  // One commissioner pinned to the top; everyone else sorted alphabetically by first name.
  const byFirstName = (a, b) => (a.first_name || a.name || '').localeCompare(b.first_name || b.name || '')
  const commissioner = players.find(p => p.is_commissioner)
  const rest = players.filter(p => p !== commissioner).sort(byFirstName)

  const renderCard = p => (
    <PlayerCard
      key={p.id}
      player={p}
      teams={teams}
      isCommissioner={isCommissioner}
      commissioner={p.is_commissioner}
      editing={editingId === p.id}
      onStartEdit={() => setEditingId(p.id)}        // only one open at a time
      onCloseEdit={() => setEditingId(null)}
      onSaved={() => { setEditingId(null); onReload() }}
    />
  )

  return (
    <>
      {commissioner && renderCard(commissioner)}
      {rest.map(renderCard)}
    </>
  )
}

function HandicapCalculator({ round, players, allowance }) {
  const [open, setOpen] = useState(false)
  const slope = round.slope_rating
  const alw = allowance ?? 100

  const grid = { display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px' }
  const headCell = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#7A8FA6' }
  const muted = { color: '#7A8FA6', fontStyle: 'italic', textAlign: 'center', padding: 14, fontSize: 13 }

  // Build rows: course HCP = round(index*slope/113); playing = round((ch-min)*allowance/100).
  const rows = players.map(p => {
    const idx = p.handicap_index
    const courseHCP = (idx != null && slope != null) ? Math.round(idx * slope / 113) : null
    return { id: p.id, name: p.name, idx, courseHCP }
  })
  const minCH = rows.length ? Math.min(...rows.map(r => r.courseHCP ?? 0)) : 0
  rows.forEach(r => { r.playing = r.courseHCP != null ? Math.round((r.courseHCP - minCH) * (alw / 100)) : null })
  rows.sort((a, b) => (a.playing ?? 999) - (b.playing ?? 999))

  function playingColor(v) {
    if (v == null) return '#7A8FA6'
    if (v === 0) return '#7A8FA6'
    if (v <= 9) return '#0D1B2A'
    if (v <= 18) return '#1B3F6E'
    return '#C0392B'
  }

  const allNull = rows.every(r => r.idx == null)

  return (
    <div style={{ marginTop: 4 }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 4px', cursor: 'pointer', borderBottom: '1px solid #E8EDF3' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#1B3F6E' }}>Handicap Calculator</span>
        <Chevron open={open} />
      </div>
      {open && (
        <div style={{ borderRadius: '0 0 10px 10px', overflow: 'hidden', marginBottom: 12 }}>
          {slope == null ? (
            <div style={muted}>Set a course to calculate handicaps</div>
          ) : allNull ? (
            <div style={muted}>Add player handicaps in the Players tab</div>
          ) : (
            <>
              <div style={{ ...grid, padding: '8px 14px', background: '#F5F8FA', borderBottom: '1px solid #DDE3EA' }}>
                <span style={headCell}>Player</span>
                <span style={headCell}>Index</span>
                <span style={headCell}>Course</span>
                <span style={headCell}>Playing</span>
              </div>
              {rows.map((r, i) => (
                <div key={r.id} style={{ ...grid, padding: '10px 14px', borderBottom: i === rows.length - 1 ? 'none' : '1px solid #E8EDF3' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0D1B2A' }}>{r.name}</span>
                  <span style={{ fontSize: 13, color: r.idx == null ? '#7A8FA6' : '#2C3E50' }}>{r.idx ?? 'TBD'}</span>
                  <span style={{ fontSize: 13, color: '#2C3E50' }}>{r.courseHCP ?? '—'}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: playingColor(r.playing) }}>{r.playing ?? '—'}</span>
                </div>
              ))}
              <div style={{ background: '#F5F8FA', padding: '8px 14px', fontSize: 11, color: '#7A8FA6', fontStyle: 'italic' }}>
                {allowance == null ? 'Allowance: 100% (default)' : `Allowance: ${alw}%`} · Slope: {slope} · Low ball: lowest playing HCP = 0
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const editRowStyle = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }
const lockToastStyle = { flexBasis: '100%', fontSize: 12, color: '#C0392B', padding: '6px 10px', background: 'rgba(192,57,43,0.08)', borderRadius: 6, border: '1px solid rgba(192,57,43,0.2)' }

function EditCourseButton({ round, locked, onEditCourse }) {
  const [toast, setToast] = useState(false) // tap-to-show message (mobile-safe)
  const timer = useRef(null)

  function showToast() {
    setToast(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(false), 3000)
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  if (locked) {
    return (
      <div style={editRowStyle}>
        <button
          style={{ ...s.editCourseBtn, marginTop: 0, opacity: 0.4, cursor: 'not-allowed', background: '#E8EDF3', color: '#7A8FA6', border: '1px solid #DDE3EA' }}
          onClick={showToast}
        >Edit Course</button>
        {toast && <div style={lockToastStyle}>Scoring has started — course cannot be changed</div>}
      </div>
    )
  }
  return (
    <div style={editRowStyle}>
      <button style={{ ...s.editCourseBtn, marginTop: 0 }} onClick={() => onEditCourse(round)}>Edit Course</button>
    </div>
  )
}

const typeBadgeBase = { fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'inherit', whiteSpace: 'nowrap' }
const typeBadgeTour = { ...typeBadgeBase, background: 'rgba(27,63,110,0.1)', color: '#1B3F6E', border: '1px solid #1B3F6E' }
const typeBadgePrac = { ...typeBadgeBase, background: '#E8EDF3', color: '#7A8FA6', border: '1px solid #DDE3EA' }

function RoundTypeBadge({ round, isCommissioner, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const isTournament = round.round_type !== 'practice'
  const style = isTournament ? typeBadgeTour : typeBadgePrac
  const label = isTournament ? 'Tournament' : 'Practice'

  useEffect(() => {
    if (!open) return
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  if (!isCommissioner) return <span style={style}>{label}</span>

  return (
    <span ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button style={{ ...style, cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>{label} ▾</button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 50, background: '#fff', border: '1px solid #DDE3EA', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', overflow: 'hidden', minWidth: 130 }}>
          {[['tournament', 'Tournament'], ['practice', 'Practice']].map(([val, txt]) => {
            const active = (val === 'tournament') === isTournament
            return (
              <div key={val} onClick={() => { setOpen(false); if (!active) onChange(round.id, val) }}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '10px 14px', cursor: 'pointer', color: '#0D1B2A' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#F5F8FA' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}>
                <span>{txt}</span>
                {active && <span style={{ color: '#1B3F6E' }}>✓</span>}
              </div>
            )
          })}
        </div>
      )}
    </span>
  )
}

const cdRow = (last) => ({ display: 'grid', gridTemplateColumns: '72px 1fr', alignItems: 'baseline', padding: '4px 0', borderBottom: last ? 'none' : '1px solid #E8EDF3' })
const cdLabel = { fontSize: 9, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#7A8FA6' }
const cdValue = { fontSize: 12, fontWeight: 600, color: '#0D1B2A' }

function locationText(r) {
  if (r.location_city && r.location_state) return `${r.location_city}, ${r.location_state}`
  return r.location_city || r.location_state || '—'
}
function parText(r) {
  let par = r.par_total
  let holes = r.number_of_holes
  if (par == null && Array.isArray(r.holes) && r.holes.length) {
    par = r.holes.reduce((sum, h) => sum + (h?.par || 0), 0)
    holes = r.holes.length
  }
  return par != null ? `Par ${par} · ${holes || 18} holes` : '—'
}

function CoursesPage({ data, isCommissioner, onEditCourse, allowance, scoredRounds, onRoundTypeChange }) {
  if (!data) return <div style={s.muted}>Loading…</div>
  const { groups, players, playersByRound } = data
  if (!groups || groups.length === 0) {
    return <Card title="Schedule"><div style={s.muted}>Course schedule will appear once rounds are set up.</div></Card>
  }
  const todayIso = new Date().toISOString().slice(0, 10)
  return groups.map(([date, rounds]) => (
    <Card key={date} title={fmtShort(date)}>
      {rounds.map((r, i, arr) => {
        const assigned = playersByRound[r.id]
        const calcPlayers = (assigned && assigned.size) ? players.filter(p => assigned.has(p.id)) : players
        const locked = scoredRounds?.has(r.id) || (r.date != null && r.date < todayIso)
        return (
          <div key={r.id} style={{ padding: '10px 0', borderBottom: i === arr.length - 1 ? 'none' : '1px solid #E8EDF3' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#0D1B2A' }}>{r.club_name || r.course_name}</div>
                {r.club_name && r.course_name && r.course_name !== r.club_name && (
                  <div style={{ fontSize: '12px', color: '#7A8FA6', marginTop: '1px' }}>{r.course_name}</div>
                )}
                {(r.course_rating != null || r.slope_rating != null) && (
                  <div style={{ fontSize: '11px', color: '#7A8FA6', marginTop: '3px' }}>
                    Rating: {r.course_rating ?? '—'} · Slope: {r.slope_rating ?? '—'}
                  </div>
                )}
              </div>
              <RoundTypeBadge round={r} isCommissioner={isCommissioner} onChange={onRoundTypeChange} />
            </div>

            {/* Detail rows */}
            <div style={{ paddingTop: 8 }}>
              <div style={cdRow(false)}>
                <span style={cdLabel}>Location</span>
                <span style={cdValue}>{locationText(r)}</span>
              </div>
              <div style={cdRow(true)}>
                <span style={cdLabel}>Par</span>
                <span style={cdValue}>{parText(r)}</span>
              </div>
            </div>

            {isCommissioner && (
              <EditCourseButton round={r} locked={locked} onEditCourse={onEditCourse} />
            )}
            <HandicapCalculator round={r} players={calcPlayers} allowance={allowance} />
          </div>
        )
      })}
    </Card>
  ))
}

const ARRIVE_FIELDS = [
  { key: 'arrive_date', label: 'Date', type: 'date' },
  { key: 'arrive_time', label: 'Time', type: 'time' },
  { key: 'arrive_airport', label: 'Airport', type: 'text', placeholder: 'e.g. DTW' },
  { key: 'flight_number_in', label: 'Flight #', type: 'text', placeholder: 'e.g. AA 1234' },
]
const DEPART_FIELDS = [
  { key: 'depart_date', label: 'Date', type: 'date' },
  { key: 'depart_time', label: 'Time', type: 'time' },
  { key: 'depart_airport', label: 'Airport', type: 'text', placeholder: 'e.g. DTW' },
  { key: 'flight_number_out', label: 'Flight #', type: 'text', placeholder: 'e.g. AA 1234' },
]

const fl = {
  card: { border: '1px solid #DDE3EA', borderRadius: 6, overflow: 'hidden', marginBottom: 14, background: '#fff' },
  header: { background: '#1B3F6E', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '-0.2px' },
  // Prominent bold label shown in the header when a person is driving.
  driving: { fontSize: 13, fontWeight: 800, color: '#fff', letterSpacing: '0.5px' },
  drivingBtn: { fontSize: 13, fontWeight: 800, color: '#fff', letterSpacing: '0.5px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 },
  // Visible toggle button on the navy header (off state).
  toggleBtn: { fontSize: 11, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.45)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  cols: { display: 'grid', gridTemplateColumns: '1fr 1px 1fr', background: '#fff' },
  col: { padding: '10px 12px' },
  divider: { background: '#DDE3EA' },
  colHeader: { fontSize: 8, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#1B3F6E', marginBottom: 8 },
  colRow: { display: 'flex', flexDirection: 'column', marginBottom: 7 },
  label: { fontSize: 8, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#7A8FA6', marginBottom: 2 },
  cellValue: { fontSize: 13, fontWeight: 600, color: '#0D1B2A' },
  placeholder: { fontSize: 12, fontWeight: 400, color: '#7A8FA6' },
  // All four field types share this box — same height, padding, border; no focus underline.
  // appearance:none stops mobile from giving date/time inputs an intrinsic (thin) width,
  // so they fill 100% and match the text inputs even when empty.
  input: { width: '100%', display: 'block', appearance: 'none', WebkitAppearance: 'none', border: '1px solid #DDE3EA', borderRadius: 5, background: '#F5F8FA', color: '#0D1B2A', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', outline: 'none', padding: '5px 7px', minHeight: 30, boxSizing: 'border-box', minWidth: 0 },
}

function FlightField({ label, type = 'text', placeholder, value, canEdit, onSave, isLast }) {
  const rowStyle = { ...fl.colRow, ...(isLast ? { marginBottom: 0 } : null) }
  return (
    <div style={rowStyle}>
      <span style={fl.label}>{label}</span>
      {canEdit
        ? <input
            type={type}
            defaultValue={value || ''} placeholder={placeholder}
            autoComplete="off" autoCorrect="off" autoCapitalize="characters" spellCheck={false}
            style={fl.input}
            onBlur={e => { const v = e.target.value.trim(); if (v !== (value || '')) onSave(v) }}
            onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
          />
        : (value ? <span style={fl.cellValue}>{value}</span> : <span style={fl.placeholder}>—</span>)}
    </div>
  )
}

function FlightCard({ player, flight, canEdit, onPatch }) {
  const driving = !!flight?.is_driving
  const first = firstNameOf(player.name)

  // Driving: collapse the flight fields, show a bold "Driving" label. Editors can tap
  // it to switch back to entering flights.
  if (driving) {
    return (
      <div style={fl.card}>
        <div style={fl.header}>
          <span style={fl.name}>{first}</span>
          {canEdit
            ? <button style={fl.drivingBtn} title="Tap to add flights instead" onClick={() => onPatch({ is_driving: false })}>Driving</button>
            : <span style={fl.driving}>Driving</span>}
        </div>
      </div>
    )
  }

  return (
    <div style={fl.card}>
      <div style={fl.header}>
        <span style={fl.name}>{first}</span>
        {canEdit && <button style={fl.toggleBtn} onClick={() => onPatch({ is_driving: true })}>Driving?</button>}
      </div>
      <div style={fl.cols}>
        <div style={fl.col}>
          <div style={fl.colHeader}>Arrival</div>
          {ARRIVE_FIELDS.map((f, i) => (
            <FlightField key={f.key} label={f.label} type={f.type} placeholder={f.placeholder} value={flight?.[f.key]} canEdit={canEdit}
              isLast={i === ARRIVE_FIELDS.length - 1} onSave={v => onPatch({ [f.key]: v || null })} />
          ))}
        </div>
        <div style={fl.divider} />
        <div style={fl.col}>
          <div style={fl.colHeader}>Departure</div>
          {DEPART_FIELDS.map((f, i) => (
            <FlightField key={f.key} label={f.label} type={f.type} placeholder={f.placeholder} value={flight?.[f.key]} canEdit={canEdit}
              isLast={i === DEPART_FIELDS.length - 1} onSave={v => onPatch({ [f.key]: v || null })} />
          ))}
        </div>
      </div>
    </div>
  )
}

function firstNameOf(name) { return (name || '').trim().split(/\s+/)[0] || 'Player' }

function FlightsPage({ data, tripId, isCommissioner, currentUserId, onUpdate }) {
  if (!data) return <div style={s.muted}>Loading…</div>
  const { players, byPlayer } = data
  if (players.length === 0) return <div style={{ ...s.muted, textAlign: 'center', padding: '24px 12px' }}>No players on this trip yet.</div>

  async function patch(player, fields) {
    const existing = byPlayer[player.id] || {}
    const merged = {
      trip_id: tripId, trip_player_id: player.id,
      is_driving: existing.is_driving ?? false,
      arrive_date: existing.arrive_date ?? null, arrive_time: existing.arrive_time ?? null,
      arrive_airport: existing.arrive_airport ?? null, flight_number_in: existing.flight_number_in ?? null,
      depart_date: existing.depart_date ?? null, depart_time: existing.depart_time ?? null,
      depart_airport: existing.depart_airport ?? null, flight_number_out: existing.flight_number_out ?? null,
      ...fields,
    }
    onUpdate(player.id, fields) // optimistic
    await supabase.from('flights').upsert(merged, { onConflict: 'trip_id,trip_player_id' })
  }

  return (
    <>
      {players.map(p => {
        const canEdit = isCommissioner || p.claimed_user_id === currentUserId
        return <FlightCard key={p.id} player={p} flight={byPlayer[p.id]} canEdit={canEdit} onPatch={fields => patch(p, fields)} />
      })}
    </>
  )
}

const DEFAULT_LOCAL_RULES = [
  'Lift, clean & place throughout',
  'Everything is a lateral hazard',
  'Divots are ground under repair',
  'Breakfast ball on the 1st tee — use it or lose it',
]

// Local rules, stored per trip in trips.local_rules (JSONB array). Commissioners get
// editable rows + Add Rule + per-row delete + Save; everyone else sees them read-only
// with the same styling. Falls back to the defaults when nothing is saved yet.
function LocalRulesCard({ tripId, isCommissioner }) {
  const [rules, setRules] = useState(null)   // null = loading; the saved list
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState([])     // working copy while editing
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('trips').select('local_rules').eq('id', tripId).maybeSingle()
      if (cancelled) return
      const stored = data?.local_rules
      setRules(Array.isArray(stored) ? stored : DEFAULT_LOCAL_RULES)
    })()
    return () => { cancelled = true }
  }, [tripId])

  function startEdit() { setDraft(rules); setEditing(true) }

  async function save() {
    setSaving(true)
    const cleaned = draft.map(r => r.trim()).filter(Boolean)
    const { error } = await supabase.from('trips').update({ local_rules: cleaned }).eq('id', tripId)
    setSaving(false)
    if (!error) {
      setRules(cleaned)
      setEditing(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  if (rules == null) return <Card title="Local Rules"><div style={s.muted}>Loading…</div></Card>

  // Read-only — non-commissioners, or commissioners who haven't tapped Edit.
  if (!isCommissioner || !editing) {
    return (
      <Card title="Local Rules">
        <RuleList rules={rules} />
        {isCommissioner && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <button onClick={startEdit} style={s.editCourseBtn}>Edit</button>
            {saved && <span style={{ fontSize: 12, color: '#2E7D32' }}>Saved ✓</span>}
          </div>
        )}
      </Card>
    )
  }

  return (
    <Card title="Local Rules">
      {draft.map((rule, i) => (
        <div key={i} style={{ ...s.ruleRow, ...(i === draft.length - 1 ? { borderBottom: 'none' } : null) }}>
          <span style={s.dot} />
          <input
            value={rule} placeholder="Rule…"
            onChange={e => setDraft(rs => rs.map((v, j) => (j === i ? e.target.value : v)))}
            style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, lineHeight: 1.5, color: '#0D1B2A', fontFamily: 'inherit', padding: 0 }}
          />
          <button onClick={() => setDraft(rs => rs.filter((_, j) => j !== i))} aria-label="Remove rule"
            style={{ background: 'none', border: 'none', color: '#7A8FA6', fontSize: 14, cursor: 'pointer', padding: '0 0 0 6px', flexShrink: 0, lineHeight: 1 }}>✕</button>
        </div>
      ))}
      <button onClick={() => setDraft(rs => [...rs, ''])}
        style={{ background: 'none', border: 'none', color: '#1B3F6E', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: '10px 0 0' }}>+ Add Rule</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
        <button onClick={save} disabled={saving} style={pc.saveBtn}>{saving ? 'Saving…' : 'Save'}</button>
        <button onClick={() => setEditing(false)} style={{ background: 'transparent', border: 'none', color: '#7A8FA6', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
      </div>
    </Card>
  )
}

function RulesPage({ tripId, isCommissioner }) {
  return (
    <>
      <LocalRulesCard tripId={tripId} isCommissioner={isCommissioner} />
      <Card title="Match Play Format">
        <RuleList rules={[
          '2 teams — partners rotate each round',
          'Better ball match play: best net score per pair per hole',
          'Each hole worth 1 point — tied holes = 0 pts to both',
          'Handicap strokes applied to hole by stroke index',
          'Most total points after all rounds wins',
        ]} />
      </Card>
    </>
  )
}

// ── Commissioner Tools ────────────────────────────────────────────
// The team rows always exist (created with the trip), so this just edits their names.
// Read-only display (one row per team, coloured by index) with an Edit toggle; Save
// does a direct UPDATE by team id (blank clears the name back to null → "Team N") and
// returns to read-only.
function teamsAllNamed(teams) {
  return teams.length > 0 && teams.every(t => !!t.name)
}

function TeamNamesCard({ teams, onSaved }) {
  // First load: read-only if every team already has a name, else start editable.
  const [editing, setEditing] = useState(() => !teamsAllNamed(teams))
  const [names, setNames] = useState(() => teams.map(t => t.name || ''))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Re-sync the inputs if the underlying teams change (e.g. after a reload).
  useEffect(() => { setNames(teams.map(t => t.name || '')) }, [teams])

  async function save() {
    setSaving(true)
    // Direct UPDATE by row id — rows always exist. Blank input clears to null.
    const next = teams.map((t, i) => ({ ...t, name: (names[i] || '').trim() || null }))
    const results = await Promise.all(
      next.map(t => supabase.from('teams').update({ name: t.name }).eq('id', t.id)),
    )
    setSaving(false)
    if (results.some(r => r.error)) return
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    setEditing(false)
    onSaved(next)
  }

  if (teams.length === 0) {
    return <Card title="Team Names"><div style={s.muted}>No teams for this trip.</div></Card>
  }

  return (
    <Card title="Team Names">
      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {teams.map((t, i) => (
            <div key={t.id}>
              <div style={pc.detailLabel}>Team {t.team_index ?? i + 1} Name</div>
              <input
                style={{ ...pc.editInput, marginTop: 4 }}
                value={names[i] ?? ''}
                placeholder={`Team ${t.team_index ?? i + 1}`}
                onChange={e => setNames(n => n.map((v, j) => (j === i ? e.target.value : v)))}
              />
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
            <button onClick={save} disabled={saving} style={pc.saveBtn}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {teams.map((t, i) => (
            <div key={t.id}>
              <div style={pc.detailLabel}>Team {t.team_index ?? i + 1}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: teamColor(colorIndexOf(t)).solid, flexShrink: 0 }} />
                <span style={{ fontSize: 16, fontWeight: 700, color: '#0D1B2A' }}>{getTeamDisplayName(t)}</span>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
            <button onClick={() => setEditing(true)} style={s.editCourseBtn}>Edit</button>
            {saved && <span style={{ fontSize: 12, color: '#2E7D32' }}>Saved ✓</span>}
          </div>
        </div>
      )}
    </Card>
  )
}

const ALLOWANCE_OPTIONS = [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50] // descending

function AllowanceInputCard({ tripId, allowance, onUpdate }) {
  const [value, setValue] = useState(allowance ?? 100)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { setValue(allowance ?? 100) }, [allowance])

  async function save() {
    const v = Number(value)
    setSaving(true)
    const { error } = await supabase.from('trips').update({ handicap_allowance: v }).eq('id', tripId)
    setSaving(false)
    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      if (onUpdate) onUpdate()
    }
  }

  return (
    <Card title="Handicap Allowance">
      <div style={{ fontSize: 13, color: '#2C3E50', lineHeight: 1.5, marginBottom: 10 }}>
        The percentage of the handicap difference players receive. 100% is full allowance.
        Strokes are calculated on the fly from this setting.
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <select
          style={{ ...pc.editInput, width: 110, flex: 'none' }}
          value={String(value)}
          onChange={e => setValue(Number(e.target.value))}
        >
          {ALLOWANCE_OPTIONS.map(v => <option key={v} value={v}>{v}%</option>)}
        </select>
        <button onClick={save} disabled={saving} style={{ ...pc.saveBtn, marginLeft: 'auto' }}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
      {saved && <div style={{ fontSize: 12, color: '#2E7D32', marginTop: 8 }}>Saved ✓</div>}
    </Card>
  )
}

function CommissionerPage({ data, tripId, handicapAllowance, inviteToken, onTeamsSaved, onTripUpdate }) {
  if (!data) return <div style={s.muted}>Loading…</div>
  return (
    <>
      <TeamNamesCard teams={data.teams} onSaved={onTeamsSaved} />
      <AllowanceInputCard tripId={tripId} allowance={handicapAllowance} onUpdate={onTripUpdate} />
      <InviteSection inviteToken={inviteToken} />
    </>
  )
}

function ArchivesPage({ data }) {
  if (!data) return <div style={s.muted}>Loading…</div>
  if (data.length === 0) {
    return <div style={{ ...s.muted, textAlign: 'center', padding: '24px 12px' }}>No past trips yet. Check back after your first trip wraps up.</div>
  }
  return data.map(t => (
    <Card key={t.id} title={t.name}>
      <InfoRow label="Dates" value={fmtRange(t.start_date, t.end_date)} />
      <InfoRow label="Location" value={t.location || '—'} />
      <InfoRow label="Winner" value={t.winner_name || '—'} last />
    </Card>
  ))
}

function AppInfoPage() {
  return (
    <>
      <Card title="Add to Home Screen">
        <div style={s.introText}>Install Trip Clubhouse on your home screen for the best experience.</div>
        <Expandable title="iPhone Instructions" sub="Safari · 4 steps" steps={[
          'Open this page in Safari',
          'Tap the Share button (box with arrow) at the bottom of the screen',
          'Scroll down and tap "Add to Home Screen"',
          'Tap "Add" — the app icon will appear on your home screen',
        ]} />
        <Expandable title="Android Instructions" sub="Chrome · 3 steps" steps={[
          'Open this page in Chrome',
          'Tap the three-dot menu (⋮) at the top right',
          'Tap "Add to Home Screen" and confirm',
        ]} />
      </Card>

      <Card title="Troubleshooting">
        <div style={s.introText}>If something looks wrong, clearing your cache usually fixes it.</div>
        <Expandable title="Clear Safari Cache" sub="iPhone · 4 steps" steps={[
          'Open the Settings app',
          'Scroll down and tap "Safari"',
          'Tap "Clear History and Website Data"',
          'Confirm, then reopen Trip Clubhouse',
        ]} />
        <Expandable title="Clear Chrome Cache" sub="Android · 3 steps" steps={[
          'In Chrome, tap the three-dot menu (⋮)',
          'Go to Settings → Privacy → Clear browsing data',
          'Select "Cached images and files" and tap Clear',
        ]} />
      </Card>

      <Card title="About">
        <InfoRow label="App" value="Trip Clubhouse" />
        <InfoRow label="Built by" value="Owen Chamberlin" />
        <InfoRow label="Version" value="v2026.1" last />
      </Card>
    </>
  )
}

// ── main component ────────────────────────────────────────────────
export default function MenuDrawer({
  open, onClose,
  tripId, groupId, groupName, tripName, tripStartDate, tripEndDate,
  inviteToken, isCommissioner, currentUserId, handicapAllowance, onTripUpdate, onRoundsChanged, onSignOut,
}) {
  const [page, setPage] = useState(null)
  const [playersData, setPlayersData] = useState(null)
  const [commissionerData, setCommissionerData] = useState(null)
  const [coursesData, setCoursesData] = useState(null)
  const [scoredRounds, setScoredRounds] = useState(() => new Set()) // round_ids that have any score
  const [archivesData, setArchivesData] = useState(null)
  const [flightsData, setFlightsData] = useState(null)
  const [editRound, setEditRound] = useState(null)
  const [savingCourse, setSavingCourse] = useState(false)

  // Reset to the drawer root whenever it is closed externally.
  useEffect(() => { if (!open) setPage(null) }, [open])

  // Mobile swipe-back / browser back should close the drawer instead of leaving the
  // site. While open, push a history entry; a back gesture pops it and we close the
  // drawer. When the drawer is closed by button/overlay instead, pop our entry to keep
  // the history stack clean. onClose is read via a ref so this only runs on open changes.
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => {
    if (!open) return
    window.history.pushState({ drawerOpen: true }, '')

    function onPopState() {
      // Our entry was already popped by the back gesture — just close the drawer.
      onCloseRef.current()
    }
    window.addEventListener('popstate', onPopState)

    return () => {
      window.removeEventListener('popstate', onPopState)
      // Closed via button/overlay (not back): our pushed entry is still on the stack.
      if (window.history.state && window.history.state.drawerOpen) window.history.back()
    }
  }, [open])

  // Lock body scroll while the drawer or a page is showing.
  useEffect(() => {
    const active = open || page
    if (active) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prev }
    }
  }, [open, page])

  // While the Courses page is open, recompute scored rounds in real time as
  // scores are added/removed.
  useEffect(() => {
    if (page !== 'courses' || !coursesData) return
    const roundIds = coursesData.roundIds || []
    if (roundIds.length === 0) return

    async function refreshScoredRounds() {
      const { data } = await supabase.from('scores').select('round_id').in('round_id', roundIds)
      setScoredRounds(new Set((data || []).map(s => s.round_id)))
    }

    const ch = supabase
      .channel(`courses-lock-${tripId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores', filter: `round_id=in.(${roundIds.join(',')})` }, () => { refreshScoredRounds() })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [page, coursesData, tripId])

  // Lazy-load data per page.
  useEffect(() => {
    let cancelled = false
    if (page === 'players' && !playersData) {
      (async () => {
        const [tpRes, teamsRes, adminRes] = await Promise.all([
          supabase.from('trip_players')
            .select('id, user_id, claimed_user_id, guest_name, first_name, last_name, email, phone, handicap_index, team_id, is_claimed')
            .eq('trip_id', tripId).order('last_name'),
          // Ordered by team_index; includes color_index for the team-pill colours.
          supabase.from('teams').select('id, name, team_index, color_index').eq('trip_id', tripId).order('team_index'),
          supabase.from('group_members').select('user_id').eq('group_id', groupId).eq('role', 'admin'),
        ])
        // The commissioner is the group admin; flag whichever player record they own/claimed.
        const adminIds = new Set((adminRes.data || []).map(m => m.user_id))
        const tps = (tpRes.data || []).map(tp => ({
          ...tp,
          name: [tp.first_name, tp.last_name].filter(Boolean).join(' ') || tp.guest_name || 'Unnamed Player',
          is_commissioner: adminIds.has(tp.user_id) || adminIds.has(tp.claimed_user_id),
        }))
        if (!cancelled) setPlayersData({ players: tps, teams: teamsRes.data || [] })
      })()
    }
    if (page === 'commissioner' && !commissionerData) {
      (async () => {
        // Ordered by team_index; includes color_index for display/colour helpers.
        const { data: teams } = await supabase.from('teams').select('id, name, team_index, color_index').eq('trip_id', tripId).order('team_index')
        if (!cancelled) setCommissionerData({ teams: teams || [] })
      })()
    }
    if (page === 'courses' && !coursesData) {
      (async () => {
        const { data: roundData } = await supabase.from('rounds').select('*').eq('trip_id', tripId).order('date').order('round_number')
        const roundList = roundData || []
        const roundIds = roundList.map(r => r.id)
        const [tpRes, pairRes] = await Promise.all([
          supabase.from('trip_players').select('id, first_name, last_name, guest_name, handicap_index').eq('trip_id', tripId),
          roundIds.length ? supabase.from('pairings').select('id, round_id').in('round_id', roundIds) : Promise.resolve({ data: [] }),
        ])
        const pairings = pairRes.data || []
        const pairIds = pairings.map(p => p.id)
        let pp = []
        if (pairIds.length) {
          const r = await supabase.from('pairing_players').select('pairing_id, trip_player_id').in('pairing_id', pairIds)
          pp = r.data || []
        }
        const roundOfPairing = {}; pairings.forEach(p => { roundOfPairing[p.id] = p.round_id })
        const playersByRound = {} // roundId -> Set(trip_player_id)
        pp.forEach(x => { const rid = roundOfPairing[x.pairing_id]; if (rid) (playersByRound[rid] ??= new Set()).add(x.trip_player_id) })
        const players = (tpRes.data || []).map(tp => ({ ...tp, name: [tp.first_name, tp.last_name].filter(Boolean).join(' ') || tp.guest_name || 'Player' }))
        const groups = {}
        roundList.forEach(r => { (groups[r.date] ??= []).push(r) })
        const sorted = Object.entries(groups).sort(([a], [b]) => String(a).localeCompare(String(b)))

        // A round is locked if it has any score (else it locks once its date passes).
        let scored = new Set()
        if (roundIds.length) {
          const { data: sc } = await supabase.from('scores').select('round_id').in('round_id', roundIds)
          ;(sc || []).forEach(s => scored.add(s.round_id))
        }
        if (!cancelled) {
          setScoredRounds(scored)
          setCoursesData({ groups: sorted, players, playersByRound, roundIds })
        }
      })()
    }
    if (page === 'archives' && !archivesData) {
      (async () => {
        const todayIso = new Date().toISOString().slice(0, 10)
        const { data } = await supabase.from('trips').select('*').eq('group_id', groupId).lt('end_date', todayIso).order('start_date', { ascending: false })
        if (!cancelled) setArchivesData(data || [])
      })()
    }
    if (page === 'flights' && !flightsData) {
      (async () => {
        const [tpRes, flRes] = await Promise.all([
          supabase.from('trip_players').select('id, claimed_user_id, first_name, last_name, guest_name').eq('trip_id', tripId).order('last_name'),
          supabase.from('flights').select('*').eq('trip_id', tripId),
        ])
        const players = (tpRes.data || []).map(tp => ({ ...tp, name: [tp.first_name, tp.last_name].filter(Boolean).join(' ') || tp.guest_name || 'Player' }))
        const byPlayer = {}; (flRes.data || []).forEach(f => { byPlayer[f.trip_player_id] = f })
        if (!cancelled) setFlightsData({ players, byPlayer })
      })()
    }
    return () => { cancelled = true }
  }, [page, tripId, groupId, playersData, commissionerData, coursesData, archivesData, flightsData])

  const drawerVisible = open && !page
  const backToDrawer = () => setPage(null)

  async function saveCourseEdit(courseData) {
    if (!editRound) return
    setSavingCourse(true)
    const { error } = await supabase.from('rounds').update({
      golfcourse_id: courseData.golfcourse_id ?? null,
      club_name: courseData.club_name ?? null,
      course_name: courseData.course_name || courseData.club_name || editRound.course_name,
      tee_name: courseData.tee_name ?? null,
      course_rating: courseData.course_rating ?? null,
      slope_rating: courseData.slope_rating ?? null,
      holes: courseData.holes ?? null,
      location_city: courseData.location_city ?? null,
      location_state: courseData.location_state ?? null,
      location_lat: courseData.location_lat ?? null,
      location_lon: courseData.location_lon ?? null,
      par_total: courseData.par_total ?? null,
      number_of_holes: courseData.number_of_holes ?? null,
    }).eq('id', editRound.id)
    setSavingCourse(false)
    if (!error) {
      setEditRound(null)
      setCoursesData(null)       // reload the courses page
      if (onRoundsChanged) onRoundsChanged() // update every other widget instantly
    }
  }

  async function changeRoundType(roundId, type) {
    const { error } = await supabase.from('rounds').update({ round_type: type }).eq('id', roundId)
    if (error) return
    // Update the badge locally and refresh the home tee-times widget.
    setCoursesData(prev => prev ? {
      ...prev,
      groups: prev.groups.map(([d, rs]) => [d, rs.map(r => r.id === roundId ? { ...r, round_type: type } : r)]),
    } : prev)
    if (onRoundsChanged) onRoundsChanged()
  }

  return (
    <>
      {/* Overlay */}
      <div
        style={{ ...s.overlay, opacity: drawerVisible ? 1 : 0, pointerEvents: drawerVisible ? 'auto' : 'none' }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div style={{ ...s.drawer, transform: drawerVisible ? 'translateX(0)' : 'translateX(100%)' }}>
        <div style={s.drawerHeader}>
          <div style={s.groupLine}>{groupName}</div>
          <div style={s.tripLine}>{tripName}</div>
          <button style={s.closeBtn} onClick={onClose} aria-label="Close menu">✕</button>
        </div>
        <div style={s.nav}>
          {[...(isCommissioner ? [COMMISSIONER_ITEM] : []), ...MENU_ITEMS].map(item => (
            <button key={item.id} style={s.item} onClick={() => setPage(item.id)}>
              <span style={s.iconBox}>
                <svg {...svgProps}>{item.icon}</svg>
              </span>
              <span>
                <span style={{ ...s.itemLabel, display: 'block' }}>{item.label}</span>
                <span style={{ ...s.itemSub, display: 'block' }}>{item.sub}</span>
              </span>
            </button>
          ))}
          {onSignOut && (
            <button style={s.item} onClick={onSignOut}>
              <span style={s.iconBox}>
                <svg {...svgProps}>
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </span>
              <span>
                <span style={{ ...s.itemLabel, display: 'block', color: '#C0392B' }}>Sign Out</span>
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Secondary pages */}
      {page === 'commissioner' && isCommissioner && (
        <SecondaryPage context={tripName} title="Commissioner Tools" onBack={backToDrawer}>
          <CommissionerPage
            data={commissionerData}
            tripId={tripId}
            handicapAllowance={handicapAllowance}
            inviteToken={inviteToken}
            onTripUpdate={onTripUpdate}
            onTeamsSaved={next => {
              setCommissionerData(prev => (prev ? { ...prev, teams: next } : prev))
              setPlayersData(null)   // refresh team names on the Players tab
            }}
          />
        </SecondaryPage>
      )}
      {page === 'players' && (
        <SecondaryPage context={groupName} title="Players" onBack={backToDrawer}>
          <PlayersPage data={playersData} isCommissioner={isCommissioner} onReload={() => setPlayersData(null)} />
        </SecondaryPage>
      )}
      {page === 'courses' && (
        <SecondaryPage context={tripName} title="Courses" onBack={backToDrawer}>
          <CoursesPage data={coursesData} isCommissioner={isCommissioner} onEditCourse={setEditRound} allowance={handicapAllowance} scoredRounds={scoredRounds} onRoundTypeChange={changeRoundType} />
        </SecondaryPage>
      )}
      {page === 'flights' && (
        <SecondaryPage context={tripName} title="Flights" onBack={backToDrawer}>
          <FlightsPage
            data={flightsData} tripId={tripId}
            isCommissioner={isCommissioner} currentUserId={currentUserId}
            onUpdate={(tpId, fields) => setFlightsData(prev => ({
              ...prev,
              byPlayer: { ...prev.byPlayer, [tpId]: { ...(prev.byPlayer[tpId] || {}), trip_player_id: tpId, ...fields } },
            }))}
          />
        </SecondaryPage>
      )}
      {page === 'rules' && (
        <SecondaryPage context={tripName} title="Rules" onBack={backToDrawer}>
          <RulesPage tripId={tripId} isCommissioner={isCommissioner} />
        </SecondaryPage>
      )}
      {page === 'archives' && (
        <SecondaryPage context={groupName} title="Archives" onBack={backToDrawer}>
          <ArchivesPage data={archivesData} />
        </SecondaryPage>
      )}
      {page === 'app-info' && (
        <SecondaryPage context="Trip Clubhouse" title="App Info" onBack={backToDrawer}>
          <AppInfoPage />
        </SecondaryPage>
      )}

      {/* Commissioner course-edit modal */}
      {editRound && (
        <div style={s.modalOverlay} onClick={() => !savingCourse && setEditRound(null)}>
          <div style={s.modalSheet} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>
              <span>Edit Course</span>
              <button style={s.modalClose} onClick={() => setEditRound(null)} aria-label="Close">✕</button>
            </div>
            <CourseSearchInput
              initialValue={editRound.club_name || editRound.course_name || ''}
              onCourseSelected={saveCourseEdit}
            />
            {savingCourse && <div style={{ ...s.muted, textAlign: 'center', marginTop: '10px' }}>Saving…</div>}
          </div>
        </div>
      )}
    </>
  )
}
