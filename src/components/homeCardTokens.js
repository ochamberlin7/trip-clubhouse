// Home card shell tokens: the shared card used by every Home widget. White paper,
// hairline border, 4px corners, no shadow; a small-caps green label with a hairline
// under it instead of a filled header bar. Widgets with a plain header should use
// <HomeCard> (homeCard.jsx); these raw objects are for the few that need a bespoke
// header (an icon in the label, flex-start alignment, etc.). Values are design
// tokens from src/index.css; never put a hex here.
export const HOME_CARD = {
  background: 'var(--paper)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--card-radius)',
  boxShadow: 'none',
  overflow: 'hidden',
  marginBottom: 12,
}

export const HOME_CARD_HEADER = {
  background: 'var(--paper)',
  borderBottom: '1px solid var(--line-soft)',
  padding: '9px 14px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}

export const HOME_CARD_LABEL = { color: 'var(--primary)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.14em' }
export const HOME_CARD_TAIL = { color: 'var(--slate)', fontSize: 12, fontWeight: 500 }
