import { useEffect, useRef, useState } from 'react'
import { groupMeta } from '../lib/myGroups'

// Trip wizard's group dropdown: your groups (most recent trip first, with trip
// count and year) and "+ Create new group" at the bottom. value = a group id or
// 'new'. A custom list (not a native <select>) so each row can show its meta line.
export const NEW_GROUP = 'new'

const NAVY = '#1B3F6E'
const MUTED = '#5F6B7A'
const LINE = '#EDF0F4'

const st = {
  wrap: { position: 'relative' },
  button: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', boxSizing: 'border-box', padding: '12px 12px', background: '#fff', border: '1px solid #D5DEE8', borderRadius: 3, fontFamily: 'inherit', fontSize: 16, color: '#0D1B2A', textAlign: 'left', cursor: 'pointer' },
  meta: { fontSize: 12.5, color: MUTED, whiteSpace: 'nowrap' },
  chev: { marginLeft: 'auto', color: '#9AA6B5', fontSize: 14 },
  list: { position: 'absolute', zIndex: 20, top: 'calc(100% + 4px)', left: 0, right: 0, margin: 0, padding: 0, listStyle: 'none', background: '#fff', border: '1px solid #D5DEE8', borderRadius: 3, boxShadow: '0 8px 22px rgba(13,27,42,0.12)', maxHeight: 320, overflowY: 'auto' },
  opt: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', boxSizing: 'border-box', padding: '11px 12px', background: 'none', border: 'none', borderTop: `1px solid ${LINE}`, fontFamily: 'inherit', fontSize: 15, color: '#0D1B2A', textAlign: 'left', cursor: 'pointer' },
  check: { width: 14, color: NAVY, fontWeight: 800, flex: 'none' },
  plus: { width: 22, height: 22, borderRadius: '50%', border: `1.5px solid ${NAVY}`, color: NAVY, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 15, lineHeight: 1, flex: 'none', boxSizing: 'border-box' },
}

export default function GroupPicker({ groups, value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const esc = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  const current = groups.find(g => g.id === value) || null
  const pick = v => { onChange(v); setOpen(false) }

  return (
    <div style={st.wrap} ref={ref}>
      <button type="button" style={st.button} onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open}>
        {current
          ? <><span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current.name}</span><span style={st.meta}>{groupMeta(current)}</span></>
          : <><span style={st.plus}>+</span><span>Create new group</span></>}
        <span style={st.chev} aria-hidden="true">{open ? '⌃' : '⌄'}</span>
      </button>
      {open && (
        <ul style={st.list} role="listbox" aria-label="Group">
          {groups.map((g, i) => (
            <li key={g.id} role="option" aria-selected={g.id === value}>
              <button type="button" style={{ ...st.opt, ...(i === 0 ? { borderTop: 'none' } : null), ...(g.id === value ? { background: '#F3F6FA' } : null) }} onClick={() => pick(g.id)}>
                <span style={st.check}>{g.id === value ? '✓' : ''}</span>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
                <span style={{ ...st.meta, marginLeft: 'auto' }}>{groupMeta(g)}</span>
              </button>
            </li>
          ))}
          <li role="option" aria-selected={value === NEW_GROUP}>
            <button type="button" style={{ ...st.opt, ...(groups.length ? null : { borderTop: 'none' }), color: NAVY, fontWeight: 700 }} onClick={() => pick(NEW_GROUP)}>
              <span style={st.plus}>+</span>Create new group
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}
