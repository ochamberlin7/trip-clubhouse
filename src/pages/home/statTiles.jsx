// Tiles shared by the Career and Group stats pages: titled tiles, side-by-side
// numbers that line up (label / number / caption rows), tap-a-number-for-where
// pop-ups, Win–Tie–Loss records, and partner / opponent lists.
import { useEffect, useRef, useState } from 'react'
import { s, MUTED, ROW_LINE } from './careerTheme'
import { initials, plural } from '../../lib/careerFormat'

export function Tile({ title, note, children, pad = true }) {
  return (
    <section style={s.tile}>
      <h3 style={{ ...s.tileBar, margin: 0 }}>{title}{note && <span style={s.tileNote}>{note}</span>}</h3>
      <div style={pad ? s.tileBody : undefined}>{children}</div>
    </section>
  )
}

// A number that came from one trip or round: tap it for a small pop-up naming where.
// size: 'sm' for numbers in a list row.
// size: undefined (big tile number) | 'sm' (leaderboard) | 'row' (a StatList row: same size as the row)
export function TapValue({ value, where, size }) {
  const small = size === 'sm' || size === 'row'
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open])
  return (
    <span ref={ref} style={{ position: 'relative', display: 'block' }}>
      <button type="button" style={size === 'row' ? { ...s.tap, fontSize: 'inherit', fontWeight: 'inherit', lineHeight: 'inherit' } : size === 'sm' ? { ...s.tap, fontSize: 15, lineHeight: '20px' } : s.tap} onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label={`${value}. Show where`}>{value}</button>
      {open && (
        <span role="status" style={small ? { ...s.pop, left: 'auto', right: 0, transform: 'none' } : s.pop}>
          <span style={small ? { ...s.popArrow, left: 'auto', right: 8, marginLeft: 0 } : s.popArrow} />
          {where.title}
          {where.detail && <small style={s.popSmall}>{where.detail}</small>}
        </span>
      )}
    </span>
  )
}

// Win – Tie – Loss with a faint word over each number (`small` for lists).
function RecordHead({ small }) {
  const st = small ? s.recSmHead : s.recHead
  return <span style={small ? s.recSm : s.rec}><span style={st}>{small ? 'W' : 'Win'}</span><span /><span style={st}>{small ? 'T' : 'Tie'}</span><span /><span style={st}>{small ? 'L' : 'Loss'}</span></span>
}

function RecordNums({ r, small }) {
  const st = small ? s.recSmNum : s.recNum
  return <span style={small ? s.recSm : s.rec}><span style={st}>{r.w}</span><span style={st}>–</span><span style={st}>{r.t}</span><span style={st}>–</span><span style={st}>{r.l}</span></span>
}

export function SmallRecord({ r }) {
  return <span style={{ display: 'flex', flexDirection: 'column' }} aria-label={`${r.w} won, ${r.t} tied, ${r.l} lost`}><RecordHead small /><RecordNums r={r} small /></span>
}

// Numbers side by side. Item: { label, value, sub?, where? } or { record, sub? }.
export function Cols({ items }) {
  return (
    <div style={s.cols(items.length)}>
      {items.map((it, i) => (
        <div key={it.label || `c${i}`} style={{ ...s.cell, ...(i ? s.colLine : null) }}>
          {it.record ? <RecordHead /> : <span style={s.colLab}>{it.label}</span>}
          {it.record
            ? <span aria-label={`${it.record.w} won, ${it.record.t} tied, ${it.record.l} lost`}><RecordNums r={it.record} /></span>
            : it.where ? <TapValue value={it.value} where={it.where} /> : <b style={s.big}>{it.value}</b>}
          {it.sub ? <span style={{ ...s.where, alignSelf: 'start' }}>{it.sub}</span> : <span />}
        </div>
      ))}
    </div>
  )
}


export function PeopleTile({ title, list, unit = 'match' }) {
  if (!list.length) return null
  return (
    <Tile title={title}>
      {list.map((p, i) => (
        <div key={p.key} style={{ ...s.person, ...(i ? { borderTop: `1px solid ${ROW_LINE}` } : null) }}>
          <span style={s.av}>{initials(p.name)}</span>
          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ fontSize: 14, color: '#2C3E50' }}>{p.name}</span>
            <span style={{ fontSize: 11, color: MUTED }}>{plural(p.matches, unit)}</span>
          </span>
          <span style={{ marginLeft: 'auto' }}><SmallRecord r={p} /></span>
        </div>
      ))}
    </Tile>
  )
}

// Career stats: Individual | Group, just under the navy header (Owen 2026-11-06:
// one Career stats page for both).
export function CareerSwitch({ value, onChange }) {
  return (
    <div style={s.switchRow}>
      <div style={s.switchBox} role="tablist" aria-label="Career stats">
        {[['me', 'Individual'], ['group', 'Group']].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={value === id} style={s.switchBtn(value === id)} onClick={() => onChange(id)}>{label}</button>
        ))}
      </div>
    </div>
  )
}

// Label on the left, value on the right, one row per stat (gross-only lists).
export function StatList({ rows }) {
  return (
    <table style={s.table}>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.label}>
            <td style={{ ...s.tdName, ...(i === 0 ? { borderTop: 'none' } : null) }}>{r.label}</td>
            <td style={{ ...s.td, ...(i === 0 ? { borderTop: 'none' } : null) }}>{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
