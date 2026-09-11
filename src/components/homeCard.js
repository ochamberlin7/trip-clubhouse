// "Classic, Softened" Home card shell — shared by the Home widgets (Next Tee
// Times, Trash Talk Thread, Weather). White card with a soft deep shadow and a
// solid navy header bar: white bold uppercase label left, soft-navy tail right.
export const HOME_CARD = {
  background: '#FFFFFF',
  borderRadius: 20,
  boxShadow: '0 16px 28px -12px rgba(15,30,51,.30), 0 3px 8px rgba(15,30,51,.14)',
  overflow: 'hidden',
  marginBottom: 14,
}

export const HOME_CARD_HEADER = {
  background: '#1B3F6E',
  padding: '11px 16px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}

export const HOME_CARD_LABEL = { color: '#fff', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }
export const HOME_CARD_TAIL = { color: '#C7D6EA', fontSize: 12, fontWeight: 600 }
