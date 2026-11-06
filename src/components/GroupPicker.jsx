import { useEffect, useRef, useState } from 'react'

// Trip wizard's group dropdown (Owen 2026-11-05): each of your groups once, by
// name only (most recent first), 4 visible and the rest scroll; "+ Create new
// group" always shows under the list. value = a group id or 'new'. A custom list
// (not a native <select>) so the create row can stay pinned with its + icon.
export const NEW_GROUP = 'new'

const NAVY = '#1B3F6E'
const LINE = '#EDF0F4'

const st = {
  wrap: { position: 'relative' },
  button: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', boxSizing: 'border-box', padding: '12px 12px', background: '#fff', border: '1px solid #D5DEE8', borderRadius: 3, fontFamily: 'inherit', fontSize: 16, color: '#0D1B2A', textAlign: 'left', cursor: 'pointer' },
  chev: { marginLeft: 'auto', color: '#9AA6B5', fontSize: 14 },
  pop: { position: 'absolute', zIndex: 20, top: 'calc(100% + 4px)', left: 0, right: 0, background: '#fff', border: '1px solid #D5DEE8', borderRadius: 3, boxShadow: '0 8px 22px rgba(13,27,42,0.12)', overflow: 'hidden' },
  // 4 rows tall (45px each); more groups scroll inside it.
  list: { margin: 0, padding: 0, listStyle: 'none', maxHeight: 4 * 45, overflowY: 'auto', overscrollBehavior: 'contain' },
  opt: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', height: 45, boxSizing: 'border-box', padding: '0 12px', background: 'none', border: 'none', borderTop: `1px solid ${LINE}`, fontFamily: 'inherit', fontSize: 15, color: '#0D1B2A', textAlign: 'left', cursor: 'pointer' },
  check: { width: 14, color: NAVY, fontWeight: 800, flex: 'none' },
  plus: { width: 22, height: 22, borderRadius: '50%', border: `1.5px solid ${NAVY}`, color: NAVY, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 15, lineHeight: 1, flex: 'none', boxSizing: 'border-box' },
}

// allowCreate=false hides "+ Create new group" (the Group stats page's picker).
// label: the list's accessible name.
export default function GroupPicker({ groups, value, onChange, allowCreate = true, label = 'Group' }) {
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
          ? <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current.name}</span>
          : <><span style={st.plus}>+</span><span>Create new group</span></>}
        <span style={st.chev} aria-hidden="true">{open ? '⌃' : '⌄'}</span>
      </button>
      {open && (
        <div style={st.pop}>
          <ul style={st.list} role="listbox" aria-label={label}>
            {groups.map((g, i) => (
              <li key={g.id} role="option" aria-selected={g.id === value}>
                <button type="button" style={{ ...st.opt, ...(i === 0 ? { borderTop: 'none' } : null), ...(g.id === value ? { background: '#F3F6FA' } : null) }} onClick={() => pick(g.id)}>
                  <span style={st.check}>{g.id === value ? '✓' : ''}</span>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
                </button>
              </li>
            ))}
          </ul>
          {allowCreate && (
            <button type="button" style={{ ...st.opt, ...(groups.length ? { borderTop: '1px solid #D5DEE8' } : { borderTop: 'none' }), color: NAVY, fontWeight: 700 }} onClick={() => pick(NEW_GROUP)}>
              <span style={st.plus}>+</span>Create new group
            </button>
          )}
        </div>
      )}
    </div>
  )
}
