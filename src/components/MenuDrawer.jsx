import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useGroup } from '../context/GroupContext'
import { uniqueChannelName } from '../lib/supabase'
import CourseSearchInput from './CourseSearchInput'
import { getCourseDetails } from '../lib/courseApi'
import { teamPillStyle, teamColor, colorIndexOf, getTeamDisplayName } from '../lib/teamColors'
import { rawCourseHandicapForTee, resolvePlayerTee, tournamentFormatLabel, parseTeeTimeToMinutes } from '../lib/scoring'
import { stripTeeGender, labelTees } from '../lib/tees'
import { FEATURES } from '../lib/features'
import { loadPurseStandings, computePurse, formatMoney } from '../lib/purse'
import { MEAL_TYPES, mealTypeLabel, displayToTimeInput, timeInputToDisplay } from '../lib/meals'
import { ProfileBadge } from './ProfileAvatar'
import SupportForm from './SupportForm'

// Slide-out menu drawer + full-screen secondary pages (CTI Clubhouse model).
// The drawer slides from the right; tapping a menu item hides the drawer and
// slides a secondary page over the screen. The page's back button returns to
// the drawer.

// ── date helpers ──────────────────────────────────────────────────
const WD = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const WD_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function parseDate(iso) { if (!iso) return null; const d = new Date(iso + 'T00:00:00'); return isNaN(d) ? null : d }
function fmtShort(iso) { const d = parseDate(iso); return d ? `${WD[d.getDay()]}, ${MO[d.getMonth()]} ${d.getDate()}` : '' }
// Full weekday for the navy day bars ("Thursday, Sep 24"); uppercased via CSS.
function fmtDayLong(iso) { const d = parseDate(iso); return d ? `${WD_FULL[d.getDay()]}, ${MO[d.getMonth()]} ${d.getDate()}` : '' }
// Every ISO date from start..end inclusive (local), for the full trip schedule.
function daysInRange(start, end) {
  const a = parseDate(start), b = parseDate(end)
  if (!a || !b || a > b) return []
  const out = []
  for (const cur = new Date(a); cur <= b; cur.setDate(cur.getDate() + 1)) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`)
  }
  return out
}
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
  drawerHeader: { padding: '20px 16px 12px', paddingTop: 'max(env(safe-area-inset-top), 20px)', borderBottom: '1px solid #DDE3EA', position: 'relative' },
  groupLine: { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1.5px', color: '#1B3F6E', fontWeight: 600 },
  tripLine: { fontSize: '18px', fontWeight: 700, color: '#0D1B2A', marginTop: '2px' },
  closeBtn: { position: 'absolute', top: 'max(env(safe-area-inset-top), 16px)', right: '16px', width: '32px', height: '32px', borderRadius: '50%', background: '#E8EDF3', border: 'none', color: '#7A8FA6', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  nav: { flex: 1, overflowY: 'auto', padding: '12px 0' },
  item: { display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', cursor: 'pointer', borderBottom: '1px solid #E8EDF3', background: '#fff', width: '100%', border: 'none', textAlign: 'left', fontFamily: 'inherit' },
  iconBox: { width: '36px', height: '36px', borderRadius: '6px', background: '#E8EDF3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  itemLabel: { fontSize: '15px', fontWeight: 600, color: '#0D1B2A' },
  itemSub: { fontSize: '11px', color: '#7A8FA6', marginTop: '1px' },

  // z above the persistent bottom chrome (tab-bar 100, live banner 200, feedback
  // FAB 201) so a secondary page fully covers the scorecard — no leftover shows.
  page: { position: 'fixed', inset: 0, zIndex: 250, background: '#F0F4F8', overflowY: 'auto', display: 'flex', flexDirection: 'column' },
  pageHeader: { position: 'sticky', top: 0, zIndex: 10, background: '#fff', padding: '16px 16px 12px', paddingTop: 'max(env(safe-area-inset-top), 16px)', borderBottom: '1px solid #DDE3EA', display: 'flex', alignItems: 'center', gap: '12px' },
  backBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#1B3F6E', padding: 0, display: 'flex', alignItems: 'center', flexShrink: 0 },
  pageContext: { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1.5px', color: '#1B3F6E', fontWeight: 500 },
  pageTitle: { fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: 700, color: '#0D1B2A', marginTop: '1px' },
  // paddingBottom clears the floating feedback pill (z-index 201) which renders
  // above these secondary pages — same shared clearance as .dashboard-content.
  pageBody: { padding: '16px', paddingBottom: 'var(--content-bottom-clearance)' },

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
  { id: 'players', label: 'Players & Teams', sub: 'Roster & teams', icon: <g><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></g> },
  { id: 'courses', label: 'Schedule & Courses', sub: 'Schedule & course info', icon: <g><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></g> },
  { id: 'flights', label: 'Flights', sub: 'Arrival & departure info', icon: <g><path d="M22 2L11 13"/><path d="M22 2L15 22l-4-9-9-4 20-7z"/></g> },
  { id: 'rules', label: 'Rules', sub: 'Local rules & format', icon: <g><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></g> },
  { id: 'archives', label: 'Archives', sub: 'Past trips & records', icon: <g><path d="M21 8v13H3V8"/><rect x="1" y="3" width="22" height="5" rx="1"/><line x1="10" y1="12" x2="14" y2="12"/></g> },
  { id: 'app-info', label: 'App Info', sub: 'Install guide & about', icon: <g><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></g> },
  { id: 'support', label: 'Support', sub: 'Report a bug or share an idea', icon: <g><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></g> },
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
  editLabel: { display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#7A8FA6', marginBottom: 4 },
  editField: { display: 'block', flex: 1, minWidth: 0 },
  saveBtn: { background: '#1B3F6E', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function PlayerCard({ player, teams, isCommissioner, currentUserId, commissioner, editing, onStartEdit, onCloseEdit, onSaved }) {
  // Who can edit what:
  //   • Commissioner → first name, last name, email, phone, handicap, team.
  //   • The player, on their OWN card only → email + phone.
  //   • Everyone else → view only.
  const isOwnCard = !!currentUserId && (player.user_id === currentUserId || player.claimed_user_id === currentUserId)
  const canEdit = isCommissioner || isOwnCard
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
    // Commissioners may write all fields; a player editing their own card may only
    // change email + phone (name / handicap / team stay commissioner-controlled).
    const payload = isCommissioner
      ? {
          first_name: form.first_name.trim() || null,
          last_name: form.last_name.trim() || null,
          email: form.email.trim() || null,
          handicap_index: form.handicap_index === '' ? null : Number(form.handicap_index),
          team_id: form.team_id || null,
          phone: form.phone.trim() ? formatPhone(form.phone) : null,
        }
      : {
          email: form.email.trim() || null,
          phone: form.phone.trim() ? formatPhone(form.phone) : null,
        }
    const { error } = await supabase.from('trip_players').update(payload).eq('id', player.id)
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
        {canEdit && !editing && (
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
              ? <a href={`tel:${player.phone}`} style={{ color: '#2C3E50', textDecoration: 'none' }}>{formatPhone(player.phone)}</a>
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
          {/* Name / handicap / team are commissioner-only. */}
          {isCommissioner && (
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={pc.editField}>
                <span style={pc.editLabel}>First Name</span>
                <input style={pc.editInput} placeholder="First name" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} />
              </label>
              <label style={pc.editField}>
                <span style={pc.editLabel}>Last Name</span>
                <input style={pc.editInput} placeholder="Last name" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} />
              </label>
            </div>
          )}
          {isCommissioner && (
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={pc.editField}>
                <span style={pc.editLabel}>Handicap Index</span>
                <input style={pc.editInput} type="number" step="0.1" min="0" max="54" placeholder="e.g. 14.2" value={form.handicap_index} onChange={e => setForm({ ...form, handicap_index: e.target.value })} />
              </label>
              <label style={pc.editField}>
                <span style={pc.editLabel}>Team</span>
                <select style={pc.editInput} value={form.team_id} onChange={e => setForm({ ...form, team_id: e.target.value })}>
                  <option value="">Unassigned</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{getTeamDisplayName(t)}</option>)}
                </select>
              </label>
            </div>
          )}
          <label style={{ display: 'block' }}>
            <span style={pc.editLabel}>Phone</span>
            <input style={pc.editInput} placeholder="(555) 000-0000" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          </label>
          <label style={{ display: 'block' }}>
            <span style={pc.editLabel}>Email</span>
            <input style={pc.editInput} type="email" placeholder="Email (optional)" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          </label>
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

function PlayersPage({ data, isCommissioner, currentUserId, onReload }) {
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
      currentUserId={currentUserId}
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

// Normalise GolfCourseAPI course detail → [{name,slope,rating,par,gender}]
// (men's + women's). Gender is retained so labelTees can add a minimal (W)
// qualifier only when a colour collides across genders; see src/lib/tees.js.
function teesFromCourseDetail(detail) {
  const male = (detail?.tees?.male || []).map(t => ({ ...t, gender: 'male' }))
  const female = (detail?.tees?.female || []).map(t => ({ ...t, gender: 'female' }))
  return [...male, ...female]
    .filter(t => t && t.tee_name)
    .map(t => ({ name: t.tee_name, slope: t.slope_rating, rating: t.course_rating, par: t.par_total, gender: t.gender }))
}

// The round's own tee, synthesised from its round-level course fields. Used as a
// guaranteed dropdown option so the TEE column is always a real <select>, even
// when rounds.tees isn't cached and the course API is unreachable (e.g. local
// `npm run dev` with no VITE_GOLF_API_KEY).
function roundPrimaryTee(round) {
  const par = round.par_total
    ?? (Array.isArray(round.holes) ? (round.holes.reduce((a, h) => a + (h?.par || 0), 0) || null) : null)
  if (round.slope_rating == null && round.course_rating == null && par == null) return null
  return { name: round.tee_name || 'Course', slope: round.slope_rating ?? null, rating: round.course_rating ?? null, par }
}

// "Handicaps" card: per-player tee dropdown + WHS course/playing handicaps.
// The TEE column is the first after the player name; selecting a tee auto-fills
// slope/rating/par, recomputes Course + Playing, and saves to player_rounds (any
// trip member may change any tee). Works on completed rounds too.
function HandicapCalculator({ round, players, allowance, playerRoundsMap, onChangeTee, readOnly = false, open = false }) {
  const [apiTees, setApiTees] = useState(null) // tees fetched from the API when rounds.tees is empty
  const alw = allowance ?? 100
  const cachedTees = Array.isArray(round.tees) ? round.tees.filter(t => t && t.name) : []
  // Tee options, best source first: cached rounds.tees → API-fetched tees → none.
  // Always include the round's own (synthesised) tee so the column is a real
  // <select> even with no multi-tee data available.
  const sourceTees = cachedTees.length ? cachedTees : (apiTees || [])
  const primaryTee = roundPrimaryTee(round)
  const combinedTees = (primaryTee && !sourceTees.some(t => t.name === primaryTee.name))
    ? [primaryTee, ...sourceTees]
    : sourceTees
  // Label tees by colour, adding a minimal (W) qualifier to the women's box only
  // where a colour collides across genders (see src/lib/tees.js).
  const tees = labelTees(combinedTees)
  const hasCourse = round.slope_rating != null || tees.length > 0
  // Round's primary tee — the default when a player has no saved tee. Match the
  // stored tee_name against the label first, then the gender-stripped colour so
  // legacy names (saved before qualifiers existed) still resolve.
  const defaultTeeName = (
    tees.find(t => t.label === round.tee_name)
    ?? tees.find(t => t.color === stripTeeGender(round.tee_name))
  )?.label ?? tees[0]?.label ?? null

  // If the round has no cached tees, pull the full tee list from the golf course
  // API the first time the section is expanded (the synthesised primary tee
  // already keeps the dropdown working meanwhile). Best-effort caches back to
  // rounds.tees (RLS permitting).
  useEffect(() => {
    if (!open) return
    const cached = Array.isArray(round.tees) ? round.tees.filter(t => t && t.name) : []
    if (import.meta.env.DEV) {
      console.debug('[Handicaps] expand round', round.id, { 'round.tees': round.tees, golfcourse_id: round.golfcourse_id })
    }
    if (cached.length || apiTees != null || !round.golfcourse_id) return
    let cancelled = false
    ;(async () => {
      try {
        const detail = await getCourseDetails(round.golfcourse_id)
        const t = teesFromCourseDetail(detail)
        if (import.meta.env.DEV) {
          console.debug('[Handicaps] API tees for round', round.id, t)
        }
        if (cancelled) return
        setApiTees(t)
        if (t.length) supabase.from('rounds').update({ tees: t }).eq('id', round.id)
      } catch (e) {
        if (import.meta.env.DEV) console.debug('[Handicaps] API tee fetch failed:', e?.message)
        if (!cancelled) setApiTees([])
      }
    })()
    return () => { cancelled = true }
  }, [open, round.id, round.golfcourse_id, round.tees, apiTees])

  // FIXED column widths (not `auto`) so every row — header and data — shares the
  // same tracks and each column is a straight vertical line, regardless of the
  // Tee dropdown's or a number's rendered width. Player takes the slack; the four
  // numeric columns are compact + right-aligned.
  const grid = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 56px 38px 32px 32px 30px', alignItems: 'center', gap: 6 }
  const numCell = { fontSize: 13, textAlign: 'right' }
  const headCell = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#7A8FA6' }
  const muted = { color: '#7A8FA6', fontStyle: 'italic', textAlign: 'center', padding: 14, fontSize: 13 }
  const teeSelect = { width: '100%', fontSize: 12, fontWeight: 600, color: '#0D1B2A', fontFamily: 'inherit', border: '1px solid #DDE3EA', borderRadius: 6, padding: '4px 4px', background: '#fff', boxSizing: 'border-box' }

  // Course HCP uses each player's individual tee (WHS). Playing handicap is the
  // absolute round(courseHCP * allowance/100) per player (the PLAYING column).
  const rows = players.map(p => {
    const saved = playerRoundsMap?.[`${round.id}:${p.id}`]
    const tee = resolvePlayerTee(round, saved)
    // Displayed Course Handicap is the rounded value; Playing Handicap is rounded
    // ONCE from the RAW unrounded course handicap (official WHS order of ops).
    const rawCH = rawCourseHandicapForTee(p.handicap_index, tee.slope, tee.rating, tee.par)
    const courseHCP = rawCH == null ? null : Math.round(rawCH)
    const playing = rawCH == null ? null : Math.round(rawCH * (alw / 100))
    return { id: p.id, name: p.name, idx: p.handicap_index, courseHCP, playing, teeName: saved?.tee_name ?? defaultTeeName, player: p }
  })
  // SHOTS OFF = shots given = playing HCP minus the LOWEST playing HCP among this
  // round's players (the scratch player shows 0). This is the stroke-dot count the
  // scorecard assigns per player, made transparent here.
  const validPlaying = rows.filter(r => r.playing != null).map(r => r.playing)
  const minPlaying = validPlaying.length ? Math.min(...validPlaying) : 0
  rows.forEach(r => { r.shotsOff = r.playing == null ? null : Math.max(0, r.playing - minPlaying) })

  // Target sort order (by playing HCP, then name for stable ties) and a lookup
  // for fresh per-row values regardless of displayed order.
  const targetOrder = rows.slice()
    .sort((a, b) => (a.playing ?? 999) - (b.playing ?? 999) || a.name.localeCompare(b.name))
    .map(r => r.id)
  const targetKey = targetOrder.join(',')
  const rowById = new Map(rows.map(r => [r.id, r]))

  // The row ORDER actually rendered. Values update instantly (from rowById), but
  // the order freezes for 1.5s after a tee change so the user can read the new
  // number before the row jumps. The timer resets on each further change.
  const [displayOrder, setDisplayOrder] = useState(() => targetOrder)
  const rowElemsRef = useRef(new Map()) // id -> row DOM node (for FLIP)
  const prevTopsRef = useRef(new Map()) // id -> offsetTop captured at the last commit
  useEffect(() => {
    const t = setTimeout(() => {
      setDisplayOrder(prev => (prev.join(',') === targetKey ? prev : targetOrder))
    }, 1500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey])

  // FLIP: after the rows reorder, glide each moved row from its old slot to its
  // new one instead of snapping. offsetTop is independent of scroll and of any
  // in-flight transform, so interrupted animations re-target cleanly.
  useLayoutEffect(() => {
    const nodes = rowElemsRef.current
    const prev = prevTopsRef.current
    const next = new Map()
    nodes.forEach((node, id) => { if (node) next.set(id, node.offsetTop) })
    nodes.forEach((node, id) => {
      if (!node) return
      const oldTop = prev.get(id)
      const newTop = next.get(id)
      if (oldTop != null && oldTop !== newTop) {
        node.style.transition = 'none'
        node.style.transform = `translateY(${oldTop - newTop}px)` // invert
        requestAnimationFrame(() => {                              // play
          node.style.transition = 'transform 0.35s ease'
          node.style.transform = ''
        })
      }
    })
    prevTopsRef.current = next
  })

  // Render in the frozen order; append any players not yet placed (e.g. newly
  // added) so nothing is dropped before the next re-sort.
  const orderedRows = []
  const placed = new Set()
  for (const id of displayOrder) { const r = rowById.get(id); if (r) { orderedRows.push(r); placed.add(id) } }
  for (const id of targetOrder) if (!placed.has(id)) orderedRows.push(rowById.get(id))

  function playingColor(v) {
    if (v == null) return '#7A8FA6'
    if (v === 0) return '#7A8FA6'
    if (v <= 9) return '#0D1B2A'
    if (v <= 18) return '#1B3F6E'
    return '#C0392B'
  }

  const allNull = rows.every(r => r.idx == null)

  if (!open) return null
  return (
    <div style={{ marginTop: 8 }}>
      {(
        <div style={{ border: '1px solid #DDE3EA', borderRadius: 8, overflow: 'hidden' }}>
          {!hasCourse ? (
            <div style={muted}>Set a course to calculate handicaps</div>
          ) : allNull ? (
            <div style={muted}>Add player handicaps in the Players tab</div>
          ) : (
            <>
              <div style={{ ...grid, padding: '8px 10px', background: '#F5F8FA', borderBottom: '1px solid #DDE3EA' }}>
                <span style={headCell}>Player</span>
                <span style={headCell}>Tee</span>
                <span style={{ ...headCell, textAlign: 'right' }}>Idx</span>
                <span style={{ ...headCell, textAlign: 'right' }}>CH</span>
                <span style={{ ...headCell, textAlign: 'right' }}>PH</span>
                <span style={{ ...headCell, textAlign: 'right' }}>SO</span>
              </div>
              {orderedRows.map((r, i) => (
                <div key={r.id}
                  ref={node => { const m = rowElemsRef.current; if (node) m.set(r.id, node); else m.delete(r.id) }}
                  style={{ ...grid, padding: '8px 10px', borderBottom: i === orderedRows.length - 1 ? 'none' : '1px solid #E8EDF3' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0D1B2A', lineHeight: 1.2, overflowWrap: 'break-word', wordBreak: 'normal' }}>{r.name}</span>
                  {tees.length > 0 ? (
                    <select
                      style={teeSelect}
                      value={r.teeName ?? ''}
                      disabled={readOnly}
                      onChange={e => onChangeTee(round, r.player, tees.find(t => t.label === e.target.value))}
                    >
                      {tees.map((t, ti) => <option key={`${t.label}-${ti}`} value={t.label}>{t.label}</option>)}
                    </select>
                  ) : (
                    <span style={{ fontSize: 12, color: '#7A8FA6' }}>{r.teeName ?? round.tee_name ?? '—'}</span>
                  )}
                  <span style={{ ...numCell, color: r.idx == null ? '#7A8FA6' : '#2C3E50' }}>{r.idx ?? 'TBD'}</span>
                  <span style={{ ...numCell, color: '#2C3E50' }}>{r.courseHCP ?? '—'}</span>
                  <span style={{ ...numCell, fontWeight: 700, color: '#1B3F6E' }}>{r.playing ?? '—'}</span>
                  <span style={{ ...numCell, fontWeight: 700, color: '#1B3F6E' }}>{r.shotsOff ?? '—'}</span>
                </div>
              ))}
              <div style={{ background: '#F5F8FA', padding: '8px 10px', fontSize: 11, color: '#7A8FA6', fontStyle: 'italic' }}>
                {allowance == null ? 'Allowance: 100% (default)' : `Allowance: ${alw}%`}
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

// Course-card action toolbar: a row of equal-weight navy-outline pills (icon +
// label), centered at the bottom of the card. Handicaps · Tournament · Edit.
const toolbarRowStyle = { display: 'flex', gap: 8, marginTop: 12 }
const toolbarPillStyle = { flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: '#fff', border: '1px solid #1B3F6E', color: '#1B3F6E', fontSize: 12, fontWeight: 700, borderRadius: 20, padding: '7px 8px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', width: '100%' }
const toolbarPillDisabledStyle = { ...toolbarPillStyle, opacity: 0.4, cursor: 'not-allowed', borderColor: '#DDE3EA', color: '#7A8FA6' }
const ICON = { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
const IconHandicaps = () => <svg {...ICON}><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
const IconTournament = () => <svg {...ICON}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
const IconEdit = () => <svg {...ICON}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z"/></svg>
const IconChevronDown = () => <svg {...ICON} width="11" height="11"><polyline points="6 9 12 15 18 9"/></svg>

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
      <>
        <button style={toolbarPillDisabledStyle} onClick={showToast}><IconEdit />Edit</button>
        {toast && createPortal(<div style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 1000, ...lockToastStyle, flexBasis: 'auto', maxWidth: '90%' }}>Scoring has started — course cannot be changed</div>, document.body)}
      </>
    )
  }
  return (
    <button style={toolbarPillStyle} onClick={() => onEditCourse(round)}><IconEdit />Edit</button>
  )
}

const typeBadgeBase = { fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'inherit', whiteSpace: 'nowrap' }
const typeBadgeTour = { ...typeBadgeBase, background: 'rgba(27,63,110,0.1)', color: '#1B3F6E', border: '1px solid #1B3F6E' }
const typeBadgePrac = { ...typeBadgeBase, background: '#E8EDF3', color: '#7A8FA6', border: '1px solid #DDE3EA' }
const typeBadgeNone = { ...typeBadgeBase, background: '#F5F8FA', color: '#9AA8B8', border: '1px dashed #C4CEDA' }

// round_type meta. 'none' = "not decided yet" (hidden elsewhere in the app); the
// commissioner picks Tournament or Practice here.
const ROUND_TYPE_META = {
  tournament: { label: 'Tournament', style: typeBadgeTour },
  practice: { label: 'Practice', style: typeBadgePrac },
  none: { label: 'Not Set', style: typeBadgeNone },
}

function RoundTypeBadge({ round, isCommissioner, onChange }) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState(null) // trigger position, for the portaled menu
  const ref = useRef(null)     // trigger
  const menuRef = useRef(null) // portaled menu
  const type = round.round_type || 'tournament'
  const { label, style } = ROUND_TYPE_META[type] || ROUND_TYPE_META.tournament

  // Close on outside click / reposition on scroll/resize while open. The menu is
  // portaled to document.body, so "outside" must also exclude the menu itself.
  useEffect(() => {
    if (!open) return
    function onDoc(e) {
      const inTrigger = ref.current && ref.current.contains(e.target)
      const inMenu = menuRef.current && menuRef.current.contains(e.target)
      if (!inTrigger && !inMenu) setOpen(false)
    }
    function reposition() { if (ref.current) setRect(ref.current.getBoundingClientRect()) }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open])

  function toggle() {
    if (!open && ref.current) setRect(ref.current.getBoundingClientRect())
    setOpen(o => !o)
  }

  function pick(val) { setOpen(false); onChange(round, val) }

  if (!isCommissioner) return <span style={style}>{label}</span>

  // Portaled menu — escapes any overflow:hidden/auto ancestor. Positioned fixed
  // from the trigger rect; flips upward when there's no room below.
  let menu = null
  if (open && rect) {
    const spaceBelow = window.innerHeight - rect.bottom
    const dropUp = spaceBelow < 230 && rect.top > spaceBelow
    const menuStyle = {
      position: 'fixed',
      right: Math.max(8, window.innerWidth - rect.right),
      ...(dropUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      zIndex: 1000, background: '#fff', border: '1px solid #DDE3EA', borderRadius: 8,
      boxShadow: '0 4px 16px rgba(0,0,0,0.15)', overflow: 'hidden', minWidth: 150,
    }
    menu = createPortal(
      <div ref={menuRef} style={menuStyle}>
        {[['tournament', 'Tournament'], ['practice', 'Practice'], ['none', 'Not Set']].map(([val, txt]) => {
          const active = val === type
          return (
            <div key={val} onClick={() => { if (!active) pick(val); else setOpen(false) }}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '10px 14px', cursor: 'pointer', color: '#0D1B2A' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#F5F8FA' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}>
              <span>{txt}</span>
              {active && <span style={{ color: '#1B3F6E' }}>✓</span>}
            </div>
          )
        })}
      </div>,
      document.body,
    )
  }

  return (
    <span ref={ref} style={{ position: 'relative', flex: 1, display: 'flex' }}>
      <button style={toolbarPillStyle} onClick={toggle}><IconTournament />{label}<IconChevronDown /></button>
      {menu}
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

// Labels for empty (non-golf) days, by stored schedule type.
const DAY_PLACEHOLDER_META = {
  travel:   { label: 'Travel Day',        accent: '#1B3F6E' },
  non_golf: { label: 'Non-Golf Day',      accent: '#1B3F6E' },
  unknown:  { label: 'Not Scheduled Yet', accent: '#9AA8B8' },
}
const roundNumLabel = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#7A8FA6', marginBottom: 6 }

// Day-card chrome (navy bar Today badge, bottom text-link actions, non-golf type label).
const todayBadgeStyle = { fontSize: 10, fontWeight: 800, letterSpacing: '0.5px', color: '#1B3F6E', background: '#fff', borderRadius: 10, padding: '1px 8px' }
const dayActionsRowStyle = { display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 14, borderTop: '1px solid #E8EDF3', paddingTop: 10 }
const dayActionLinkStyle = { background: 'none', border: 'none', color: '#1B3F6E', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }
const dayTypeLabelStyle = { fontSize: 13, fontWeight: 600, color: '#7A8FA6' }

// One golf round: unchanged content (name, rating/slope, location, par) plus the
// new bottom toolbar (Handicaps · Tournament · Edit). Own hcOpen state so the
// Handicaps pill toggles the handicaps table below.
function GolfRoundEntry({ round: r, roundIndex, roundCount, isCommissioner, readOnly, allowance, calcPlayers, playerRounds, locked, onEditCourse, onRoundTypeChange, onChangePlayerTee }) {
  const [hcOpen, setHcOpen] = useState(false)
  const entryStyle = { background: 'var(--bg0)', border: '1px solid var(--bg3)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: roundIndex === roundCount - 1 ? 0 : 10 }
  return (
    <div style={entryStyle}>
      {roundCount > 1 && <div style={roundNumLabel}>Round {roundIndex + 1}</div>}
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
      <div style={{ paddingTop: 8 }}>
        <div style={cdRow(false)}><span style={cdLabel}>Location</span><span style={cdValue}>{locationText(r)}</span></div>
        <div style={cdRow(true)}><span style={cdLabel}>Par</span><span style={cdValue}>{parText(r)}</span></div>
      </div>
      <div style={toolbarRowStyle}>
        <button style={{ ...toolbarPillStyle, ...(hcOpen ? { background: '#1B3F6E', color: '#fff' } : null) }} onClick={() => setHcOpen(o => !o)}><IconHandicaps />Handicaps</button>
        {isCommissioner && <RoundTypeBadge round={r} isCommissioner onChange={onRoundTypeChange} />}
        {isCommissioner && <EditCourseButton round={r} locked={locked} onEditCourse={onEditCourse} />}
      </div>
      <HandicapCalculator round={r} players={calcPlayers} allowance={allowance} playerRoundsMap={playerRounds} onChangeTee={onChangePlayerTee} readOnly={readOnly} open={hcOpen} />
    </div>
  )
}

function CoursesPage({ data, isCommissioner, readOnly = false, onEditCourse, allowance, scoredRounds, onRoundTypeChange, onChangePlayerTee, onAddRound, onEditStay, onAddStay, onEditMeal, onAddMeal }) {
  if (!data) return <div style={s.muted}>Loading…</div>
  const { days, roundsByDate, scheduleByDate, players, playersByRound, playerRounds, stays = [], mealsByDate = {} } = data
  if (!days || days.length === 0) {
    return <Card title="Schedule"><div style={s.muted}>Course schedule will appear once the trip dates are set.</div></Card>
  }
  // Local "today" — recomputed every render so past/today flips naturally at midnight.
  const now = new Date()
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return (
    <>
      {days.map(date => {
        const dayRounds = roundsByDate[date] || []
        const dayMeals = mealsByDate[date] || []
        const stay = stays.find(st => st.check_in === date) || null // lodging shows only on its check-in day
        const dayType = scheduleByDate[date]
        const isPast = date < todayIso
        const isToday = date === todayIso
        const typeLabel = dayRounds.length === 0 && dayType && dayType !== 'unknown' ? DAY_PLACEHOLDER_META[dayType]?.label : null
        return (
          // Past days render as one dimmed, non-interactive unit (recomputed each render).
          <div key={date} style={{ ...s.card, ...(isPast ? { opacity: 0.5, pointerEvents: 'none' } : null) }}>
            <div style={{ ...s.cardHeader, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{fmtDayLong(date)}</span>
              {isToday && <span style={todayBadgeStyle}>Today</span>}
            </div>
            <div style={s.cardBody}>
              {dayRounds.map((r, i, arr) => {
                const assigned = playersByRound[r.id]
                const calcPlayers = (assigned && assigned.size) ? players.filter(p => assigned.has(p.id)) : players
                const locked = scoredRounds?.has(r.id) || (r.date != null && r.date < todayIso)
                return (
                  <GolfRoundEntry
                    key={r.id} round={r} roundIndex={i} roundCount={arr.length}
                    isCommissioner={isCommissioner} readOnly={readOnly} allowance={allowance}
                    calcPlayers={calcPlayers} playerRounds={playerRounds} locked={locked}
                    onEditCourse={onEditCourse} onRoundTypeChange={onRoundTypeChange} onChangePlayerTee={onChangePlayerTee}
                  />
                )
              })}
              {typeLabel && <div style={dayTypeLabelStyle}>{typeLabel}</div>}
              <MealsSection meals={dayMeals} isCommissioner={isCommissioner} onEditMeal={onEditMeal} />
              {stay && <LodgingRow stay={stay} isCommissioner={isCommissioner} onEditStay={onEditStay} />}
              {isCommissioner && !isPast && (
                <div style={dayActionsRowStyle}>
                  <button style={dayActionLinkStyle} onClick={() => onAddRound(date)}>+ Add Round</button>
                  <button style={dayActionLinkStyle} onClick={() => onAddMeal(date)}>+ Add Meal</button>
                  {!stay && <button style={dayActionLinkStyle} onClick={() => onAddStay(date)}>+ Add Lodging</button>}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </>
  )
}

// ── Stays (lodging) + Meals ───────────────────────────────────────
// Shared visual tokens, matching the app's card/pill/field-row language.
const stayBannerStyle = { background: '#EAEFF4', border: '1px solid #CFD9E4', borderLeft: '5px solid #1B3F6E', borderRadius: 10, padding: '14px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }
const stayLabelStyle = { fontSize: 11, fontWeight: 700, color: '#7A8FA6', textTransform: 'uppercase', letterSpacing: '0.5px' }
const stayTitleStyle = { fontSize: 15, fontWeight: 700, color: '#2C3E50', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const staySubStyle = { fontSize: 12, color: '#7A8FA6', marginTop: 2 }
const mealsLabelStyle = { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: '#7A8FA6', margin: '14px 0 8px' }
const mealSubCardStyle = { background: 'var(--bg0)', border: '1px solid var(--bg3)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: 8 }
const addActionStyle = { display: 'block', width: '100%', background: '#fff', border: '1px dashed #C4CEDA', color: '#1B3F6E', fontSize: 12, fontWeight: 700, borderRadius: 6, padding: '9px 12px', cursor: 'pointer', fontFamily: 'inherit' }
const mealCustomInputStyle = { width: '100%', marginTop: 8, padding: '7px 10px', borderRadius: 6, border: '1px solid #DDE3EA', fontSize: 13, fontFamily: 'inherit', color: '#0D1B2A', boxSizing: 'border-box' }
const mealBadgeStyle = { ...typeBadgeBase, background: 'rgba(15,110,86,0.1)', color: '#0F6E56', border: '1px solid #0F6E56' }
const modalFieldLabel = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#7A8FA6', margin: '12px 0 5px' }
// Fixed height so text / date / time inputs render identically (native date/time
// inputs otherwise pick their own intrinsic height). Textareas override height:auto.
const modalInput = { width: '100%', height: 40, padding: '9px 11px', borderRadius: 8, border: '1px solid #DDE3EA', fontSize: 14, lineHeight: '20px', fontFamily: 'inherit', color: '#0D1B2A', boxSizing: 'border-box', background: '#fff', WebkitAppearance: 'none', appearance: 'none' }
const convertDayBtnStyle = { flex: 1, padding: '9px', background: '#fff', border: '1px solid #DDE3EA', borderRadius: 8, color: '#7A8FA6', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }

// "AUG 13 – 16" (same month collapses to one label; cross-month shows both).
function fmtStayRange(ci, co) {
  const a = parseDate(ci), b = parseDate(co)
  if (!a && !b) return ''
  if (a && !b) return `${MO[a.getMonth()].toUpperCase()} ${a.getDate()}`
  if (!a && b) return `${MO[b.getMonth()].toUpperCase()} ${b.getDate()}`
  const am = MO[a.getMonth()].toUpperCase(), bm = MO[b.getMonth()].toUpperCase()
  return am === bm ? `${am} ${a.getDate()} – ${b.getDate()}` : `${am} ${a.getDate()} – ${bm} ${b.getDate()}`
}

// Two-line row styling shared by meals + lodging.
const mealLabelLineStyle = { fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: '#1f6f5c' }
const lodgingLabelLineStyle = { fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: '#3346ab' }
const scheduleRowStyle = { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', fontFamily: 'inherit', padding: '8px 0' }

// Compact meal row: teal uppercase "Meal · <type>" label, then
// "<bold restaurant> — <muted type, time>". Tap (commissioner) → edit modal.
function MealRow({ meal, isCommissioner, onEditMeal }) {
  const typeLabel = mealTypeLabel(meal)
  const name = (meal.location || '').trim() || 'Meal'
  const detail = [typeLabel, meal.meal_time].filter(Boolean).join(', ')
  const clickable = !!isCommissioner
  return (
    <button type="button" disabled={!clickable}
      onClick={clickable ? () => onEditMeal(meal) : undefined}
      style={{ ...scheduleRowStyle, cursor: clickable ? 'pointer' : 'default' }}>
      <div style={mealLabelLineStyle}>{typeLabel || 'Meal'}</div>
      <div style={{ fontSize: 13, marginTop: 2 }}>
        <span style={{ fontWeight: 700, color: '#0D1B2A' }}>{name}</span>
        {detail && <span style={{ color: '#7A8FA6' }}> — {detail}</span>}
      </div>
    </button>
  )
}

// "Meals" section: small label + compact rows (hairline between rows). Renders
// only when the day has meals — adding is the day card's "+ Add Meal" action.
function MealsSection({ meals = [], isCommissioner, onEditMeal }) {
  if (!meals.length) return null
  return (
    <div style={{ marginTop: 12 }}>
      <div style={mealsLabelStyle}>Meals</div>
      {meals.map((m, i) => (
        <div key={m.id} style={i > 0 ? { borderTop: '1px solid #E8EDF3' } : undefined}>
          <MealRow meal={m} isCommissioner={isCommissioner} onEditMeal={onEditMeal} />
        </div>
      ))}
    </div>
  )
}

// Lodging row (check-in day only): indigo uppercase "Lodging" label, then two
// balanced columns — hotel name + address on the left, a "CHECK-IN" label above
// the date range on the right. Tap (commissioner) → edit modal.
function LodgingRow({ stay, isCommissioner, onEditStay }) {
  const name = (stay.hotel_name || '').trim() || 'Hotel'
  const range = fmtStayRange(stay.check_in, stay.check_out)
  const confFallback = !range && stay.confirmation ? `Conf. ${stay.confirmation}` : ''
  const address = (stay.address || '').trim()
  const clickable = !!isCommissioner
  return (
    <button type="button" disabled={!clickable}
      onClick={clickable ? () => onEditStay(stay) : undefined}
      style={{ ...scheduleRowStyle, marginTop: 12, cursor: clickable ? 'pointer' : 'default' }}>
      <div style={lodgingLabelLineStyle}>Lodging</div>
      {/* Left: hotel name + address. Right: CHECK-IN label above the date range. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginTop: 2 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0D1B2A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
          {address && <div style={{ fontSize: 12, color: '#7A8FA6', marginTop: 2 }}>{address}</div>}
        </div>
        {range
          ? (
            <div style={{ flexShrink: 0, textAlign: 'right' }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', color: '#8a96a3' }}>Check-in</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1B3F6E', marginTop: 2 }}>{range}</div>
            </div>
          )
          : confFallback && <span style={{ fontSize: 12, color: '#7A8FA6', flexShrink: 0 }}>{confFallback}</span>}
      </div>
    </button>
  )
}

// Meal add/edit modal. `meal` may be a real row (edit) or { day, __new } (add).
function MealModal({ meal, saving, onSave, onDelete, onClose }) {
  const isNew = !!meal.__new
  const [type, setType] = useState(meal.meal_type || 'dinner')
  const [custom, setCustom] = useState(meal.custom_label || '')
  const [location, setLocation] = useState(meal.location || '')
  const [time, setTime] = useState(displayToTimeInput(meal.meal_time))
  const [notes, setNotes] = useState(meal.notes || '')

  function submit() {
    onSave({
      id: isNew ? undefined : meal.id,
      day: meal.day,
      meal_type: type,
      custom_label: type === 'other' ? (custom.trim() || null) : null,
      location: location.trim() || null,
      meal_time: timeInputToDisplay(time) || null,
      notes: notes.trim() || null,
    })
  }
  return (
    <div style={s.modalOverlay} onClick={() => !saving && onClose()}>
      <div style={s.modalSheet} onClick={e => e.stopPropagation()}>
        <div style={s.modalTitle}>
          <span>{isNew ? 'Add Meal' : 'Edit Meal'}</span>
          <button style={s.modalClose} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div style={modalFieldLabel}>Type</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {MEAL_TYPES.map(({ value, label }) => {
            const active = value === type
            return (
              <button key={value} onClick={() => setType(value)}
                style={{ ...mealBadgeStyle, cursor: 'pointer', padding: '5px 10px', ...(active ? { background: '#0F6E56', color: '#fff' } : null) }}>
                {label}
              </button>
            )
          })}
        </div>
        {type === 'other' && (
          <>
            <div style={modalFieldLabel}>Custom label</div>
            <input style={modalInput} value={custom} onChange={e => setCustom(e.target.value)} placeholder="e.g. Team Cookout" />
          </>
        )}
        <div style={modalFieldLabel}>Restaurant / Location</div>
        <input style={modalInput} value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. The Steakhouse" />
        <div style={modalFieldLabel}>Time</div>
        {/* display:block + appearance:none forces iOS <input type=time> to honour
            width:100% (it otherwise shrinks to intrinsic content width). */}
        <input style={{ ...modalInput, display: 'block', WebkitAppearance: 'none', appearance: 'none' }} type="time" value={time} onChange={e => setTime(e.target.value)} />
        <div style={modalFieldLabel}>Notes (optional)</div>
        <textarea style={{ ...modalInput, height: 'auto', minHeight: 60, resize: 'vertical' }} value={notes} onChange={e => setNotes(e.target.value)} />
        <button style={{ ...s.editCourseBtn, width: '100%', marginTop: 16, padding: '11px', background: '#1B3F6E', color: '#fff', border: 'none', fontSize: 14, opacity: saving ? 0.6 : 1 }}
          onClick={submit} disabled={saving}>{saving ? 'Saving…' : (isNew ? 'Add Meal' : 'Save Meal')}</button>
        {!isNew && (
          <button style={{ width: '100%', marginTop: 8, padding: '9px', background: 'none', border: 'none', color: '#C0392B', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            onClick={() => onDelete(meal)} disabled={saving}>Delete Meal</button>
        )}
      </div>
    </div>
  )
}

// Stay add/edit modal. `stay` may be a real row (edit) or { __new } (add).
function StayModal({ stay, saving, tripStartDate, tripEndDate, onSave, onDelete, onClose }) {
  const isNew = !!stay.__new
  const [hotel, setHotel] = useState(stay.hotel_name || '')
  const [address, setAddress] = useState(stay.address || '')
  const [checkIn, setCheckIn] = useState(stay.check_in || (isNew ? (tripStartDate || '') : ''))
  const [checkOut, setCheckOut] = useState(stay.check_out || (isNew ? (tripEndDate || '') : ''))
  const [confirmation, setConfirmation] = useState(stay.confirmation || '')
  const [notes, setNotes] = useState(stay.notes || '')

  function submit() {
    onSave({
      id: isNew ? undefined : stay.id,
      hotel_name: hotel.trim() || null,
      address: address.trim() || null,
      check_in: checkIn || null,
      check_out: checkOut || null,
      confirmation: confirmation.trim() || null,
      notes: notes.trim() || null,
    })
  }
  return (
    <div style={s.modalOverlay} onClick={() => !saving && onClose()}>
      <div style={s.modalSheet} onClick={e => e.stopPropagation()}>
        <div style={s.modalTitle}>
          <span>{isNew ? 'Add Stay' : 'Edit Stay'}</span>
          <button style={s.modalClose} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div style={modalFieldLabel}>Hotel name</div>
        <input style={modalInput} value={hotel} onChange={e => setHotel(e.target.value)} placeholder="e.g. Marriott Downtown" />
        <div style={modalFieldLabel}>Address (optional)</div>
        <input style={modalInput} value={address} onChange={e => setAddress(e.target.value)} placeholder="e.g. 123 Main St, Scottsdale, AZ" />
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={modalFieldLabel}>Check-in</div>
            <input style={modalInput} type="date" value={checkIn} onChange={e => setCheckIn(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={modalFieldLabel}>Check-out</div>
            <input style={modalInput} type="date" value={checkOut} onChange={e => setCheckOut(e.target.value)} />
          </div>
        </div>
        <div style={modalFieldLabel}>Confirmation # (optional)</div>
        <input style={modalInput} value={confirmation} onChange={e => setConfirmation(e.target.value)} />
        <div style={modalFieldLabel}>Notes (optional)</div>
        <textarea style={{ ...modalInput, height: 'auto', minHeight: 60, resize: 'vertical' }} value={notes} onChange={e => setNotes(e.target.value)} />
        <button style={{ ...s.editCourseBtn, width: '100%', marginTop: 16, padding: '11px', background: '#1B3F6E', color: '#fff', border: 'none', fontSize: 14, opacity: saving ? 0.6 : 1 }}
          onClick={submit} disabled={saving}>{saving ? 'Saving…' : (isNew ? 'Add Stay' : 'Save Stay')}</button>
        {!isNew && (
          <button style={{ width: '100%', marginTop: 8, padding: '9px', background: 'none', border: 'none', color: '#C0392B', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            onClick={() => onDelete(stay)} disabled={saving}>Delete Stay</button>
        )}
      </div>
    </div>
  )
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
  // Read-only (non-editable) version of the toggle — clearly disabled: muted,
  // dashed border, not-allowed cursor, so it reads as "not editable" rather than
  // a clickable button that does nothing.
  toggleBtnDisabled: { fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', background: 'transparent', border: '1px dashed rgba(255,255,255,0.35)', borderRadius: 6, padding: '4px 10px', cursor: 'not-allowed', fontFamily: 'inherit', whiteSpace: 'nowrap' },
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
        {/* Driving toggle shows on every card. Editable (commissioner or own card)
            → a tappable button to mark driving; otherwise a real disabled button so
            it's clearly non-interactive (not a fake clickable badge). */}
        {canEdit
          ? <button style={fl.toggleBtn} onClick={() => onPatch({ is_driving: true })}>Driving</button>
          : <button style={fl.toggleBtnDisabled} disabled aria-disabled="true">Driving</button>}
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
        // Same permission pattern as PlayerCard (Players & Teams): commissioner
        // edits anyone; a member edits only their own card (matched by user_id OR
        // claimed_user_id). Previously this checked claimed_user_id only, which is
        // why the driving toggle worked on nobody's card except the current user's.
        const isOwnCard = !!currentUserId && (p.user_id === currentUserId || p.claimed_user_id === currentUserId)
        const canEdit = isCommissioner || isOwnCard
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
  const [rules, setRules] = useState(null)   // null = loading; the live/saved list
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Load once on mount (per trip) — not on every render.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase.from('trips').select('local_rules').eq('id', tripId).maybeSingle()
      if (cancelled) return
      if (error) { console.error('[LocalRules] load failed:', error); setRules(DEFAULT_LOCAL_RULES); return }
      const stored = data?.local_rules
      setRules(Array.isArray(stored) ? stored : DEFAULT_LOCAL_RULES)
    })()
    return () => { cancelled = true }
  }, [tripId])

  // Write the full rules array to trips.local_rules. Returns true only if it persisted.
  async function persist(next) {
    const { error } = await supabase.from('trips').update({ local_rules: next }).eq('id', tripId)
    if (error) { console.error('[LocalRules] save failed:', error); return false }
    return true
  }

  // Add/delete write immediately and only update local state once the write succeeds.
  async function addRule() {
    const next = [...rules, '']
    if (await persist(next)) setRules(next)
  }
  async function deleteRule(i) {
    const next = rules.filter((_, j) => j !== i)
    if (await persist(next)) setRules(next)
  }
  // Text edits stay local while typing, then persist on blur.
  function editRule(i, text) {
    setRules(rs => rs.map((v, j) => (j === i ? text : v)))
  }
  async function blurSave() {
    if (rules) await persist(rules)
  }
  // Explicit Save: drop blank rows, persist, then leave edit mode.
  async function save() {
    setSaving(true)
    const cleaned = rules.map(r => r.trim()).filter(Boolean)
    const ok = await persist(cleaned)
    setSaving(false)
    if (!ok) return
    setRules(cleaned)
    setEditing(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (rules == null) return <Card title="Local Rules"><div style={s.muted}>Loading…</div></Card>

  // Read-only — non-commissioners, or commissioners who haven't tapped Edit.
  if (!isCommissioner || !editing) {
    return (
      <Card title="Local Rules">
        <RuleList rules={rules} />
        {isCommissioner && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <button onClick={() => setEditing(true)} style={s.editCourseBtn}>Edit</button>
            {saved && <span style={{ fontSize: 12, color: '#2E7D32' }}>Saved ✓</span>}
          </div>
        )}
      </Card>
    )
  }

  return (
    <Card title="Local Rules">
      {rules.map((rule, i) => (
        <div key={i} style={{ ...s.ruleRow, ...(i === rules.length - 1 ? { borderBottom: 'none' } : null) }}>
          <span style={s.dot} />
          <input
            value={rule} placeholder="Rule…"
            onChange={e => editRule(i, e.target.value)}
            onBlur={blurSave}
            style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, lineHeight: 1.5, color: '#0D1B2A', fontFamily: 'inherit', padding: 0 }}
          />
          <button onClick={() => deleteRule(i)} aria-label="Remove rule"
            style={{ background: 'none', border: 'none', color: '#7A8FA6', fontSize: 14, cursor: 'pointer', padding: '0 0 0 6px', flexShrink: 0, lineHeight: 1 }}>✕</button>
        </div>
      ))}
      <button onClick={addRule}
        style={{ background: 'none', border: 'none', color: '#1B3F6E', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: '10px 0 0' }}>+ Add Rule</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
        <button onClick={save} disabled={saving} style={pc.saveBtn}>{saving ? 'Saving…' : 'Save'}</button>
        <button onClick={() => setEditing(false)} style={{ background: 'transparent', border: 'none', color: '#7A8FA6', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
      </div>
    </Card>
  )
}

const STANDARD_MATCH_RULES = [
  'Better ball match play: best net score per pair per hole',
  'Win a hole to go 1 up; a tied hole leaves the match score unchanged',
  'Handicap strokes applied to hole by stroke index',
  'A match is won once a team leads by more holes than remain — each round scores as W, L, or H',
]

// DRAFT — derived from liveMatchTally() in src/lib/scoring.js. Review wording
// before treating as official.
const POINTS_MATCH_RULES = [
  'Better ball: on each hole, each team’s best (lowest) net score counts',
  'Win a hole (lower best-ball net) to earn 1 point; a tied hole is halved — 0 points to either team',
  'Handicap strokes applied hole-by-hole by stroke index (net = gross minus strokes received)',
  'Points accumulate across every tournament round — most total points at the end of the trip wins',
]

function RulesPage({ tripId, isCommissioner, tournamentFormat }) {
  // Show ONLY the rules for the trip's actual format — hide the other entirely.
  // Legacy 'match_play' and 'stroke_play' fall through to Points Match Play.
  const isStandard = tournamentFormat === 'standard_match_play'
  const label = tournamentFormatLabel(isStandard ? 'standard_match_play' : 'points_match_play')
  const rules = isStandard ? STANDARD_MATCH_RULES : POINTS_MATCH_RULES
  return (
    <>
      <LocalRulesCard tripId={tripId} isCommissioner={isCommissioner} />
      <Card title={`${label} Format`}>
        <RuleList rules={rules} />
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

// Commissioner "Tournament Purse" section: set the purse amount (with a live
// per-player preview from current standings) and toggle the Home widget.
const purseLabel = { fontSize: 12, fontWeight: 600, color: '#1B3F6E', display: 'block', marginBottom: 6 }
function PurseSettingsCard({ tripId, purseAmount, showPurseOnHome, allowance, onUpdate }) {
  const [amount, setAmount] = useState(Number(purseAmount) > 0 ? String(purseAmount) : '')
  const [standings, setStandings] = useState(null)
  const [showHome, setShowHome] = useState(!!showPurseOnHome)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { setShowHome(!!showPurseOnHome) }, [showPurseOnHome])
  useEffect(() => {
    let cancelled = false
    loadPurseStandings(supabase, tripId, allowance).then(sd => { if (!cancelled) setStandings(sd) })
    return () => { cancelled = true }
  }, [tripId, allowance])

  const num = amount === '' ? 0 : parseFloat(amount)
  const invalid = amount !== '' && (!Number.isFinite(num) || num < 0)
  const purse = standings ? computePurse({ ...standings, amount: num > 0 ? num : 0 }) : null

  let preview = ''
  if (invalid) preview = ''
  else if (num > 0 && purse?.valid && purse.splitCount > 0) {
    preview = purse.tied
      ? `Tied — $${formatMoney(purse.perShare)} each`
      : `Each ${purse.losingTeamName} player owes $${formatMoney(purse.perShare)}`
  }

  async function save() {
    setErr('')
    if (invalid) { setErr('Purse amount must be a positive number'); return }
    setSaving(true)
    const { error } = await supabase.from('trips').update({ purse_amount: num }).eq('id', tripId)
    setSaving(false)
    if (error) { setErr('Failed to save purse amount'); return }
    setSaved(true); setTimeout(() => setSaved(false), 2000)
    onUpdate?.()
  }

  async function toggle() {
    const next = !showHome
    setShowHome(next) // optimistic
    setErr('')
    const { error } = await supabase.from('trips').update({ show_purse_on_home: next }).eq('id', tripId)
    if (error) { setShowHome(!next); setErr('Failed to update visibility'); return }
    onUpdate?.()
  }

  return (
    <Card title="Tournament Purse">
      <div style={{ fontSize: 13, color: '#2C3E50', lineHeight: 1.5, marginBottom: 12 }}>
        The losing team pays the purse.
      </div>
      <label style={purseLabel}>Purse Amount</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#7A8FA6', fontSize: 14 }}>$</span>
          <input type="number" min="0" inputMode="decimal" placeholder="e.g., 640" value={amount}
            onChange={e => setAmount(e.target.value)} style={{ ...pc.editInput, paddingLeft: 22 }} />
        </div>
        <button onClick={save} disabled={saving} style={pc.saveBtn}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
      {preview && <div style={{ fontSize: 12, color: '#8a96a3', marginTop: 8 }}>{preview}</div>}
      {err && <div style={{ fontSize: 12, color: '#C0392B', marginTop: 8 }}>{err}</div>}
      {saved && <div style={{ fontSize: 12, color: '#2E7D32', marginTop: 8 }}>Saved ✓</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 18 }}>
        <div style={{ minWidth: 0 }}>
          <div style={purseLabel}>Show Purse on Home Screen</div>
          <div style={{ fontSize: 12, color: '#8a96a3', marginTop: -2 }}>Display the purse widget on the Home tab.</div>
        </div>
        <button role="switch" aria-checked={showHome} onClick={toggle} aria-label="Show purse on Home screen"
          style={{ width: 44, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', flexShrink: 0, padding: 0, position: 'relative', background: showHome ? '#1B3F6E' : '#cccccc', transition: 'background 0.15s' }}>
          <span style={{ position: 'absolute', top: 3, left: showHome ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
        </button>
      </div>
    </Card>
  )
}

function CommissionerPage({ data, tripId, handicapAllowance, purseAmount, showPurseOnHome, inviteToken, onTeamsSaved, onTripUpdate }) {
  if (!data) return <div style={s.muted}>Loading…</div>
  return (
    <>
      <TeamNamesCard teams={data.teams} onSaved={onTeamsSaved} />
      <PurseSettingsCard tripId={tripId} purseAmount={purseAmount} showPurseOnHome={showPurseOnHome} allowance={handicapAllowance} onUpdate={onTripUpdate} />
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
        <div style={{ fontSize: '12px', color: '#7A8FA6', textAlign: 'center', marginTop: '12px' }}>
          © 2026 The Trip Clubhouse. All rights reserved.
        </div>
      </Card>
    </>
  )
}

// ── Trip switcher ─────────────────────────────────────────────────
const MD_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function mdTodayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function mdParseIso(iso) {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00')
  return isNaN(d) ? null : d
}
// "Sep 29 – Oct 4, 2026"
function fmtTripRange(startIso, endIso) {
  const s = mdParseIso(startIso), e = mdParseIso(endIso)
  if (s && e) return `${MD_MONTHS[s.getMonth()]} ${s.getDate()} – ${MD_MONTHS[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`
  if (s) return `${MD_MONTHS[s.getMonth()]} ${s.getDate()}, ${s.getFullYear()}`
  if (e) return `${MD_MONTHS[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`
  return 'Dates TBD'
}

const sw = {
  sectionHeader: { fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#7A8FA6', padding: '16px 16px 6px' },
  row: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '12px 16px', background: 'none', border: 'none', borderBottom: '1px solid #E8EDF3', cursor: 'pointer', fontFamily: 'inherit' },
  rowActive: { background: '#EEF3F9' },
  name: { display: 'block', fontSize: 15, fontWeight: 700, color: '#0D1B2A' },
  meta: { display: 'block', fontSize: 12, color: '#7A8FA6', marginTop: 1 },
  dates: { display: 'block', fontSize: 12, color: '#7A8FA6', marginTop: 1 },
  check: { marginLeft: 'auto', color: '#1B3F6E', fontWeight: 900, fontSize: 16, flexShrink: 0 },
  empty: { padding: '8px 16px 12px', fontSize: 13, color: '#7A8FA6', fontStyle: 'italic' },
  loading: { padding: '16px', fontSize: 13, color: '#7A8FA6', fontStyle: 'italic' },
  createBtn: { display: 'block', width: 'calc(100% - 32px)', margin: '20px 16px', padding: '13px', borderRadius: 8, border: 'none', background: '#1B3F6E', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
}

// Flat list of EVERY trip the user belongs to (via trip_players) across ALL of
// their groups, each tagged with its group name + the user's role in that group.
function TripSwitcherPage({ userId, currentTripId, onPick, onCreate }) {
  const [rows, setRows] = useState(null) // null = loading

  useEffect(() => {
    if (!userId) { setRows([]); return }
    let cancelled = false
    ;(async () => {
      // 1. Every group the user belongs to, with their role in it.
      const { data: gm } = await supabase
        .from('group_members')
        .select('role, group_id, groups(id, name)')
        .eq('user_id', userId)
      const groupInfo = new Map() // group_id -> { name, role }
      ;(gm || []).forEach(m => {
        const gid = m.group_id ?? m.groups?.id
        if (gid) groupInfo.set(gid, { name: m.groups?.name ?? 'Group', role: m.role })
      })
      const groupIds = [...groupInfo.keys()]
      if (!groupIds.length) { if (!cancelled) setRows([]); return }

      // 2. Trips in those groups + the trips the user actually belongs to (trip_players).
      const [tripsRes, tpRes] = await Promise.all([
        supabase.from('trips').select('id, group_id, name, start_date, end_date').in('group_id', groupIds),
        supabase.from('trip_players').select('trip_id').or(`user_id.eq.${userId},claimed_user_id.eq.${userId}`),
      ])
      const myTripIds = new Set((tpRes.data || []).map(r => r.trip_id))
      if (cancelled) return

      const list = (tripsRes.data || [])
        // Trips the user belongs to (always keep the currently-active one too).
        .filter(t => myTripIds.has(t.id) || t.id === currentTripId)
        .map(t => {
          const g = groupInfo.get(t.group_id) || {}
          return {
            id: t.id, name: t.name, start_date: t.start_date, end_date: t.end_date,
            groupName: g.name || 'Group',
            role: g.role === 'admin' ? 'Commissioner' : 'Member',
          }
        })
      setRows(list)
    })()
    return () => { cancelled = true }
  }, [userId, currentTripId])

  const today = mdTodayIso()
  const all = rows || []
  const upcoming = all
    .filter(t => !t.end_date || t.end_date >= today)
    .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''))
  const past = all
    .filter(t => t.end_date && t.end_date < today)
    .sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''))

  const Row = t => (
    <button key={t.id} style={{ ...sw.row, ...(t.id === currentTripId ? sw.rowActive : null) }} onClick={() => onPick(t.id)}>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={sw.name}>{t.name || 'Untitled Trip'}</span>
        <span style={sw.meta}>{t.groupName} · {t.role}</span>
        <span style={sw.dates}>{fmtTripRange(t.start_date, t.end_date)}</span>
      </span>
      {t.id === currentTripId && <span style={sw.check}>✓</span>}
    </button>
  )

  return (
    <div style={{ paddingBottom: 8 }}>
      {rows == null ? (
        <div style={sw.loading}>Loading trips…</div>
      ) : (
        <>
          <div style={sw.sectionHeader}>Active &amp; Upcoming</div>
          {upcoming.length ? upcoming.map(Row) : <div style={sw.empty}>No active or upcoming trips</div>}
          <div style={sw.sectionHeader}>Past Trips</div>
          {past.length ? past.map(Row) : <div style={sw.empty}>No past trips</div>}
        </>
      )}
      <button style={sw.createBtn} onClick={onCreate}>+ Create New Trip</button>
    </div>
  )
}

// ── main component ────────────────────────────────────────────────
export default function MenuDrawer({
  open, onClose,
  tripId, groupId, groupName, tripName, tripStartDate, tripEndDate,
  inviteToken, isCommissioner, readOnly = false, currentUserId, handicapAllowance, tournamentFormat, purseAmount, showPurseOnHome, onTripUpdate, onRoundsChanged, initialPage = null,
}) {
  const navigate = useNavigate()
  const { activeTripId, switchTrip } = useGroup()
  const [page, setPage] = useState(null)
  const [playersData, setPlayersData] = useState(null)
  const [commissionerData, setCommissionerData] = useState(null)
  const [coursesData, setCoursesData] = useState(null)
  const [scoredRounds, setScoredRounds] = useState(() => new Set()) // round_ids that have any score
  const [archivesData, setArchivesData] = useState(null)
  const [flightsData, setFlightsData] = useState(null)
  const [editRound, setEditRound] = useState(null)
  const [savingCourse, setSavingCourse] = useState(false)
  const [editMeal, setEditMeal] = useState(null) // meal row (edit) or { day, __new } (add)
  const [savingMeal, setSavingMeal] = useState(false)
  const [editStay, setEditStay] = useState(null) // stay row (edit) or { __new } (add)
  const [savingStay, setSavingStay] = useState(false)

  // On open, jump to the requested deep-link page (e.g. 'app-info' from the
  // Getting Started tip) or the drawer root; reset to root whenever it closes.
  useEffect(() => { setPage(open ? (initialPage ?? null) : null) }, [open, initialPage])

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
      .channel(uniqueChannelName(`courses-lock-${tripId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores', filter: `round_id=in.(${roundIds.join(',')})` }, () => { refreshScoredRounds() })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [page, coursesData, tripId])

  // Live HI propagation: when a player's handicap_index changes, update it in
  // place so every course card's course handicaps recalculate (HI is never
  // stored as a derived value). This subscription is ALWAYS active (not gated on
  // the open page) because HI is edited on the Players page while the Courses
  // data is cached — gating it on page === 'courses' missed those edits.
  useEffect(() => {
    if (!tripId) return
    const ch = supabase
      .channel(uniqueChannelName(`trip-players-hi-${tripId}`))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'trip_players', filter: `trip_id=eq.${tripId}` }, payload => {
        const id = payload.new?.id
        const hi = payload.new?.handicap_index
        console.log('[MenuDrawer] trip_players HI realtime update', id, '→', hi)
        if (!id) return
        const patch = list => list.map(p => (p.id === id ? { ...p, handicap_index: hi } : p))
        setCoursesData(prev => prev ? { ...prev, players: patch(prev.players) } : prev)
        setPlayersData(prev => prev ? { ...prev, players: patch(prev.players) } : prev)
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [tripId])

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
        const [tpRes, pairRes, tripRes, staysRes, mealsRes] = await Promise.all([
          supabase.from('trip_players').select('id, first_name, last_name, guest_name, handicap_index').eq('trip_id', tripId),
          roundIds.length ? supabase.from('pairings').select('id, round_id').in('round_id', roundIds) : Promise.resolve({ data: [] }),
          supabase.from('trips').select('schedule').eq('id', tripId).maybeSingle(),
          supabase.from('stays').select('*').eq('trip_id', tripId).order('check_in'),
          supabase.from('meals').select('*').eq('trip_id', tripId).order('day'),
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
        // Per-player tee selections: `${roundId}:${tpId}` -> player_rounds row.
        const playerRounds = {}
        if (roundIds.length) {
          const { data: prRows } = await supabase.from('player_rounds')
            .select('trip_player_id, round_id, tee_name, slope, rating, par').in('round_id', roundIds)
          ;(prRows || []).forEach(pr => { playerRounds[`${pr.round_id}:${pr.trip_player_id}`] = pr })
        }
        const players = (tpRes.data || []).map(tp => ({ ...tp, name: [tp.first_name, tp.last_name].filter(Boolean).join(' ') || tp.guest_name || 'Player' }))

        // Rounds grouped by date, and the day-type for every empty day.
        const roundsByDate = {}
        roundList.forEach(r => { (roundsByDate[r.date] ??= []).push(r) })
        const scheduleByDate = {}
        ;(tripRes.data?.schedule || []).forEach(d => { if (d && d.date) scheduleByDate[d.date] = d.type })

        // Meals grouped by day, each day's list sorted chronologically by time.
        const stays = staysRes.data || []
        const mealsByDate = {}
        ;(mealsRes.data || []).forEach(m => { if (m.day) (mealsByDate[m.day] ??= []).push(m) })
        Object.values(mealsByDate).forEach(list => list.sort((a, b) => parseTeeTimeToMinutes(a.meal_time) - parseTeeTimeToMinutes(b.meal_time)))

        // Every day in the trip range, plus any round or meal date outside it.
        let days = daysInRange(tripStartDate, tripEndDate)
        const dateSet = new Set(days)
        Object.keys(roundsByDate).forEach(d => { if (d) dateSet.add(d) })
        Object.keys(mealsByDate).forEach(d => { if (d) dateSet.add(d) })
        days = [...dateSet].sort()

        // A round is locked if it has any score (else it locks once its date passes).
        let scored = new Set()
        if (roundIds.length) {
          const { data: sc } = await supabase.from('scores').select('round_id').in('round_id', roundIds)
          ;(sc || []).forEach(s => scored.add(s.round_id))
        }
        if (!cancelled) {
          setScoredRounds(scored)
          setCoursesData({ days, roundsByDate, scheduleByDate, players, playersByRound, playerRounds, roundIds, stays, mealsByDate })
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
          supabase.from('trip_players').select('id, user_id, claimed_user_id, first_name, last_name, guest_name').eq('trip_id', tripId).order('last_name'),
          supabase.from('flights').select('*').eq('trip_id', tripId),
        ])
        const players = (tpRes.data || []).map(tp => ({ ...tp, name: [tp.first_name, tp.last_name].filter(Boolean).join(' ') || tp.guest_name || 'Player' }))
        const byPlayer = {}; (flRes.data || []).forEach(f => { byPlayer[f.trip_player_id] = f })
        if (!cancelled) setFlightsData({ players, byPlayer })
      })()
    }
    return () => { cancelled = true }
  }, [page, tripId, groupId, tripStartDate, tripEndDate, playersData, commissionerData, coursesData, archivesData, flightsData])

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
      tees: courseData.tees ?? null,
    }).eq('id', editRound.id)
    if (!error) {
      // Seed a player_rounds row for every current trip player with the round's
      // default tee, so all players start on the same tee chosen during course
      // setup. ignoreDuplicates → never overwrite a player who already has a
      // customised tee (forward-only; existing selections are preserved). New
      // players added later have no row and fall back to this round-level default
      // via resolvePlayerTee.
      const defaultTee = {
        tee_name: courseData.tee_name ?? null,
        slope: courseData.slope_rating ?? null,
        rating: courseData.course_rating ?? null,
        par: courseData.par_total ?? null,
      }
      if (defaultTee.tee_name || defaultTee.slope != null) {
        const { data: tps } = await supabase.from('trip_players').select('id').eq('trip_id', tripId)
        const rows = (tps || []).map(tp => ({ trip_player_id: tp.id, round_id: editRound.id, ...defaultTee }))
        if (rows.length) {
          await supabase.from('player_rounds')
            .upsert(rows, { onConflict: 'trip_player_id,round_id', ignoreDuplicates: true })
        }
      }
    }
    setSavingCourse(false)
    if (!error) {
      setEditRound(null)
      setCoursesData(null)       // reload the courses page
      if (onRoundsChanged) onRoundsChanged() // update every other widget instantly
    }
  }

  // Add a golf round on a previously non-golf day (replaces the placeholder). The
  // round starts as a TBD with a VISIBLE type — 'none' rounds are filtered out of
  // the Scorecard, Leaderboard, Tee Times and live banner, so a 'none' round would
  // only show on this page and never propagate to those tabs. Default to
  // 'tournament' on a tournament trip (matching the wizard) else 'practice'; the
  // commissioner can still change it via the type pill. Then reload/broadcast.
  async function addRound(date) {
    const { data: existing } = await supabase.from('rounds').select('round_number').eq('trip_id', tripId)
    const nextNum = (existing || []).reduce((m, r) => Math.max(m, r.round_number || 0), 0) + 1
    const defaultType = tournamentFormat && tournamentFormat !== 'stroke_play' ? 'tournament' : 'practice'
    const { error } = await supabase.from('rounds').insert({
      trip_id: tripId, round_number: nextNum, date, course_name: 'TBD', round_type: defaultType, status: 'upcoming',
    })
    if (error) {
      console.error('[MenuDrawer] addRound failed:', error)
      return
    }
    setCoursesData(null)       // reload the courses page (the day now has a round)
    if (onRoundsChanged) onRoundsChanged()
  }

  // Persist a per-player tee selection for a round, then update local courses
  // state so the Handicaps table recomputes immediately. Any trip member may do
  // this. player_rounds is in the realtime publication, so the live scorecard /
  // banner recalc on their own — including on completed rounds.
  async function changePlayerTee(round, player, tee) {
    const row = {
      trip_player_id: player.id,
      round_id: round.id,
      // Store the display label (e.g. "White" or, on a gender collision, "White
      // (W)") so it round-trips with the tee <select> value.
      tee_name: tee?.label ?? tee?.name ?? null,
      slope: tee?.slope ?? null,
      rating: tee?.rating ?? null,
      par: tee?.par ?? null,
    }
    setCoursesData(prev => prev
      ? { ...prev, playerRounds: { ...prev.playerRounds, [`${round.id}:${player.id}`]: row } }
      : prev)
    const { error } = await supabase.from('player_rounds')
      .upsert(row, { onConflict: 'trip_player_id,round_id' })
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[MenuDrawer] player tee save failed:', error)
    }
  }

  async function changeRoundType(roundId, type) {
    const { error } = await supabase.from('rounds').update({ round_type: type }).eq('id', roundId)
    if (error) return
    // Update the badge locally (in roundsByDate) and refresh the home widgets.
    setCoursesData(prev => {
      if (!prev) return prev
      const roundsByDate = {}
      for (const [d, rs] of Object.entries(prev.roundsByDate)) {
        roundsByDate[d] = rs.map(r => r.id === roundId ? { ...r, round_type: type } : r)
      }
      return { ...prev, roundsByDate }
    })
    if (onRoundsChanged) onRoundsChanged()
  }

  // Persist a day-type change on the trip's schedule (trips.schedule JSONB).
  async function setDayType(date, dayType) {
    const { data: tripRow } = await supabase.from('trips').select('schedule').eq('id', tripId).maybeSingle()
    const sched = Array.isArray(tripRow?.schedule) ? [...tripRow.schedule] : []
    const i = sched.findIndex(d => d && d.date === date)
    if (i >= 0) sched[i] = { ...sched[i], type: dayType }
    else sched.push({ date, type: dayType })
    await supabase.from('trips').update({ schedule: sched }).eq('id', tripId)
  }

  // Revert a golf round back to a non-golf day: delete the round (and its
  // dependent rows) and mark the day Travel/Non-Golf, so the Courses page shows
  // the slim placeholder again. Invoked from the Edit Course modal.
  async function revertRoundToDay(round, dayType) {
    const label = dayType === 'travel' ? 'Travel Day' : 'Non-Golf Day'
    if (!window.confirm(`Remove this round and set ${fmtShort(round.date)} to ${label}? This deletes the round and any scores entered for it.`)) return

    // Remove dependent rows first (FKs may not cascade), then the round.
    await supabase.from('scores').delete().eq('round_id', round.id)
    const { data: prs } = await supabase.from('pairings').select('id').eq('round_id', round.id)
    const pairIds = (prs || []).map(p => p.id)
    if (pairIds.length) await supabase.from('pairing_players').delete().in('pairing_id', pairIds)
    await supabase.from('pairings').delete().eq('round_id', round.id)
    await supabase.from('player_rounds').delete().eq('round_id', round.id)
    await supabase.from('course_holes').delete().eq('round_id', round.id)
    const { error } = await supabase.from('rounds').delete().eq('id', round.id)
    if (error) { console.error('[MenuDrawer] revertRoundToDay failed:', error); return }

    await setDayType(round.date, dayType)
    setEditRound(null)         // close the Edit modal
    setCoursesData(null)       // reload — the day now shows the placeholder
    if (onRoundsChanged) onRoundsChanged()
  }

  // Round-type selector now only sets the round type (Tournament/Practice/Not
  // Set). Converting a day to Travel/Non-Golf lives in the Edit Course modal.
  function handleRoundTypeSelect(round, val) {
    changeRoundType(round.id, val)
  }

  // ── Meals ──
  // Quick field updates from the sub-card (meal-type pill, custom label): patch
  // the row, then reload the page + refresh other views.
  async function patchMeal(meal, patch) {
    const { error } = await supabase.from('meals').update(patch).eq('id', meal.id)
    if (error) { console.error('[MenuDrawer] patchMeal failed:', error); return }
    setCoursesData(null)
    if (onRoundsChanged) onRoundsChanged()
  }
  const changeMealType = (meal, type) => patchMeal(meal, { meal_type: type, ...(type !== 'other' ? { custom_label: null } : {}) })
  const setMealCustomLabel = (meal, label) => patchMeal(meal, { custom_label: label || null })

  // Add (insert) or edit (update) a meal from the modal.
  async function saveMeal(mealData) {
    setSavingMeal(true)
    const { id, day, ...fields } = mealData
    const { error } = id
      ? await supabase.from('meals').update(fields).eq('id', id)
      : await supabase.from('meals').insert({ trip_id: tripId, day, ...fields })
    setSavingMeal(false)
    if (error) { console.error('[MenuDrawer] saveMeal failed:', error); return }
    setEditMeal(null)
    setCoursesData(null)
    if (onRoundsChanged) onRoundsChanged()
  }

  async function deleteMeal(meal) {
    if (!window.confirm('Delete this meal?')) return
    setSavingMeal(true)
    const { error } = await supabase.from('meals').delete().eq('id', meal.id)
    setSavingMeal(false)
    if (error) { console.error('[MenuDrawer] deleteMeal failed:', error); return }
    setEditMeal(null)
    setCoursesData(null)
    if (onRoundsChanged) onRoundsChanged()
  }

  // ── Stays ──
  async function saveStay(stayData) {
    setSavingStay(true)
    const { id, ...fields } = stayData
    const write = (payload) => id
      ? supabase.from('stays').update(payload).eq('id', id)
      : supabase.from('stays').insert({ trip_id: tripId, ...payload })
    let { error } = await write(fields)
    // The `address` column exists only after migration 20260653. If it hasn't
    // been run yet the write fails ("column address does not exist") — retry
    // without address so the rest of the stay still saves (address persists once
    // the migration is applied).
    if (error && /address/i.test(error.message || '') && 'address' in fields) {
      const { address, ...rest } = fields
      ;({ error } = await write(rest))
    }
    setSavingStay(false)
    if (error) {
      console.error('[MenuDrawer] saveStay failed:', error)
      alert('Could not save the stay: ' + (error.message || 'unknown error'))
      return
    }
    setEditStay(null)
    setCoursesData(null)
    if (onRoundsChanged) onRoundsChanged()
  }

  async function deleteStay(stay) {
    if (!window.confirm('Delete this stay?')) return
    setSavingStay(true)
    const { error } = await supabase.from('stays').delete().eq('id', stay.id)
    setSavingStay(false)
    if (error) { console.error('[MenuDrawer] deleteStay failed:', error); return }
    setEditStay(null)
    setCoursesData(null)
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
          {/* Profile — reuses the circular initials badge; opens the account page */}
          <button style={s.item} onClick={() => { onClose(); navigate('/profile') }}>
            <ProfileBadge style={{ width: 36, height: 36, border: 'none', boxShadow: 'none' }} />
            <span>
              <span style={{ ...s.itemLabel, display: 'block' }}>Profile</span>
              <span style={{ ...s.itemSub, display: 'block' }}>Manage your profile</span>
            </span>
          </button>
          {/* Trip switcher — styled like the other menu rows; opens the switcher page */}
          <button style={s.item} onClick={() => setPage('switch-trip')}>
            <span style={s.iconBox}>
              <svg {...svgProps}><path d="M8 3 4 7l4 4" /><path d="M4 7h16" /><path d="m16 21 4-4-4-4" /><path d="M20 17H4" /></svg>
            </span>
            <span>
              <span style={{ ...s.itemLabel, display: 'block' }}>Trips</span>
              <span style={{ ...s.itemSub, display: 'block' }}>Switch or manage trips</span>
            </span>
            <span style={{ marginLeft: 'auto', color: '#7A8FA6', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>Switch ›</span>
          </button>
          {[...(isCommissioner ? [COMMISSIONER_ITEM] : []), ...MENU_ITEMS]
            .filter(item => item.id !== 'archives' || FEATURES.archives)
            .map(item => (
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
        </div>
      </div>

      {/* Secondary pages */}
      {page === 'switch-trip' && (
        <SecondaryPage context={groupName} title="Switch Trip" onBack={backToDrawer}>
          <TripSwitcherPage
            userId={currentUserId}
            currentTripId={activeTripId}
            onPick={id => { onClose(); switchTrip(id) }}
            onCreate={() => { onClose(); navigate('/onboarding/trip') }}
          />
        </SecondaryPage>
      )}
      {page === 'commissioner' && isCommissioner && (
        <SecondaryPage context={tripName} title="Commissioner Tools" onBack={backToDrawer}>
          <CommissionerPage
            data={commissionerData}
            tripId={tripId}
            handicapAllowance={handicapAllowance}
            purseAmount={purseAmount}
            showPurseOnHome={showPurseOnHome}
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
        <SecondaryPage context={groupName} title="Players & Teams" onBack={backToDrawer}>
          <PlayersPage data={playersData} isCommissioner={isCommissioner} currentUserId={currentUserId} onReload={() => setPlayersData(null)} />
        </SecondaryPage>
      )}
      {page === 'courses' && (
        <SecondaryPage context={tripName} title="Schedule & Courses" onBack={backToDrawer}>
          <CoursesPage
            data={coursesData} isCommissioner={isCommissioner} readOnly={readOnly}
            onEditCourse={setEditRound} allowance={handicapAllowance} scoredRounds={scoredRounds}
            onRoundTypeChange={handleRoundTypeSelect} onChangePlayerTee={changePlayerTee} onAddRound={addRound}
            onEditStay={setEditStay} onAddStay={(date) => setEditStay({ __new: true, check_in: date })}
            onEditMeal={setEditMeal} onAddMeal={(date) => setEditMeal({ __new: true, day: date, meal_type: 'dinner' })}
          />
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
          <RulesPage tripId={tripId} isCommissioner={isCommissioner} tournamentFormat={tournamentFormat} />
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
      {page === 'support' && (
        <SecondaryPage context={tripName} title="Support" onBack={backToDrawer}>
          <SupportForm tripId={tripId} userId={currentUserId} />
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
            {/* Convert this day to a non-golf day (moved here from the type pill). */}
            <div style={{ borderTop: '1px solid #E8EDF3', marginTop: 16, paddingTop: 12 }}>
              <div style={modalFieldLabel}>Change day type</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={convertDayBtnStyle} onClick={() => revertRoundToDay(editRound, 'travel')}>Travel Day</button>
                <button style={convertDayBtnStyle} onClick={() => revertRoundToDay(editRound, 'non_golf')}>Non-Golf Day</button>
              </div>
              <div style={{ fontSize: 11, color: '#7A8FA6', marginTop: 6 }}>Removes this round and any scores entered for it.</div>
            </div>
          </div>
        </div>
      )}

      {/* Meal add/edit modal */}
      {editMeal && (
        <MealModal meal={editMeal} saving={savingMeal} onSave={saveMeal} onDelete={deleteMeal} onClose={() => setEditMeal(null)} />
      )}

      {/* Stay add/edit modal */}
      {editStay && (
        <StayModal stay={editStay} saving={savingStay} tripStartDate={tripStartDate} tripEndDate={tripEndDate} onSave={saveStay} onDelete={deleteStay} onClose={() => setEditStay(null)} />
      )}
    </>
  )
}
