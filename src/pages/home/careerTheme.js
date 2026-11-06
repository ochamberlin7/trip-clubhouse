// Shared look for the Career and Group stats pages (Letterhead navy + gold,
// Stats-tab tiles with navy titles, every number black). Styles only.
export const NAVY = '#1B3F6E'
export const INK = '#0D1B2A'
export const MUTED = '#5F6B7A'
export const HAIR = '#E3E1DA'
export const RULE = '#C9D3E0'
export const TILE_BORDER = '#D5DEE8'
export const TILE_BAR = '#EEF2F7'
export const ROW_LINE = '#EDF0F4'
export const GOLD = '#B08A3E'
export const GOLD_TEXT = '#D8C08A'
export const FAINT = '#9AA6B5'
export const SERIF = "'Playfair Display', Georgia, serif"
export const CAPS = { fontWeight: 700, letterSpacing: '1.3px', textTransform: 'uppercase' }
export const LNUM = { fontVariantNumeric: 'lining-nums tabular-nums', fontFeatureSettings: '"lnum" 1' }

export const s = {
  page: { minHeight: '100vh', background: 'var(--bg0)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 40px)', boxSizing: 'border-box' },
  mast: { background: NAVY, padding: '14px 16px 20px', paddingTop: 'calc(env(safe-area-inset-top) + 14px)', position: 'relative', textAlign: 'center' },
  back: { position: 'absolute', left: 16, top: 'calc(env(safe-area-inset-top) + 14px)', background: 'none', border: 'none', padding: 0, color: GOLD_TEXT, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  eyebrow: { fontSize: 10.5, letterSpacing: '2px', textTransform: 'uppercase', color: '#AFC2DE', marginTop: 26 },
  title: { margin: '4px 0 0', fontFamily: SERIF, fontSize: 34, fontWeight: 700, color: GOLD_TEXT, lineHeight: 1.05 },
  who: { fontFamily: SERIF, fontSize: 18, color: '#fff', marginTop: 6 },
  rule: { width: 70, height: 2, background: GOLD, margin: '10px auto 0' },
  hi: { fontSize: 12, color: '#C7D6EA', marginTop: 8 },
  inner: { maxWidth: 480, margin: '0 auto', padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 14 },
  totals: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', background: '#fff', border: `1px solid ${HAIR}`, borderRadius: 3, padding: '14px 0' },
  totNum: { display: 'block', fontFamily: SERIF, fontSize: 34, lineHeight: 1, color: INK, ...LNUM },
  totLab: { display: 'block', marginTop: 6, fontSize: 10, ...CAPS, color: MUTED },
  tabs: { display: 'flex', borderBottom: `1px solid ${RULE}` },
  tab: { flex: 1, padding: '11px 0', background: 'none', border: 'none', fontSize: 14, fontWeight: 700, color: MUTED, cursor: 'pointer', fontFamily: 'inherit' },
  tabOn: { color: NAVY, boxShadow: `inset 0 -2px 0 ${NAVY}` },
  // overflow stays visible so a number's pop-up isn't cut off; the bar rounds its own corners.
  tile: { background: '#fff', border: `1px solid ${TILE_BORDER}`, borderRadius: 6 },
  tileBar: { background: TILE_BAR, borderRadius: '6px 6px 0 0', padding: '8px 12px', fontSize: 15, fontWeight: 700, color: NAVY, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  tileNote: { fontSize: 11, fontWeight: 600, color: MUTED },
  tileBody: { padding: 12 },
  // Every cell shares three rows (label, number, caption) so the numbers line up across a tile.
  cols: n => ({ display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gridTemplateRows: 'auto auto auto', textAlign: 'center' }),
  cell: { display: 'grid', gridRow: 'span 3', gridTemplateRows: 'subgrid', justifyItems: 'center', alignItems: 'end', rowGap: 3, position: 'relative', minWidth: 0 },
  colLine: { borderLeft: `1px solid ${ROW_LINE}` },
  colLab: { display: 'block', fontSize: 11, lineHeight: '14px', color: MUTED },
  big: { display: 'block', fontSize: 24, fontWeight: 800, color: INK, ...LNUM, lineHeight: '30px', whiteSpace: 'nowrap' },
  // Tappable number: looks like every other number.
  tap: { display: 'block', fontFamily: 'inherit', fontSize: 24, fontWeight: 800, color: INK, ...LNUM, lineHeight: '30px', whiteSpace: 'nowrap', background: 'none', border: 0, padding: 0, cursor: 'pointer' },
  pop: { position: 'absolute', zIndex: 5, top: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)', width: 'max-content', maxWidth: 210, background: NAVY, color: '#fff', fontSize: 12, lineHeight: 1.35, fontWeight: 600, padding: '8px 10px', borderRadius: 6, boxShadow: '0 6px 18px rgba(13,27,42,0.25)', textAlign: 'center', whiteSpace: 'normal' },
  popArrow: { position: 'absolute', top: -5, left: '50%', marginLeft: -5, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: `5px solid ${NAVY}` },
  popSmall: { display: 'block', fontWeight: 400, color: '#C7D6EA', fontSize: 11, marginTop: 2 },
  // Win · Tie · Loss: the faint words and the numbers share fixed columns.
  rec: { display: 'grid', gridTemplateColumns: '28px 9px 28px 9px 28px', justifyItems: 'center', ...LNUM },
  recHead: { fontSize: 9, lineHeight: '14px', letterSpacing: '0.8px', textTransform: 'uppercase', color: FAINT, fontWeight: 700 },
  recNum: { fontSize: 22, lineHeight: '30px', fontWeight: 800, color: INK },
  recSm: { display: 'inline-grid', gridTemplateColumns: '17px 8px 17px 8px 17px', justifyItems: 'center', ...LNUM },
  recSmHead: { fontSize: 8, lineHeight: '10px', letterSpacing: '0.5px', color: FAINT, fontWeight: 700 },
  recSmNum: { fontSize: 15, lineHeight: '18px', fontWeight: 800, color: INK },
  pills: { display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 },
  where: { display: 'block', fontSize: 11, color: MUTED, marginTop: 2, lineHeight: 1.3 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14, ...LNUM },
  th: { fontSize: 10.5, ...CAPS, letterSpacing: '1.2px', color: MUTED, textAlign: 'right', padding: '0 4px 6px', width: 70 },
  td: { padding: '8px 4px', borderTop: `1px solid ${ROW_LINE}`, textAlign: 'right', fontWeight: 700, color: INK },
  tdName: { padding: '8px 4px', borderTop: `1px solid ${ROW_LINE}`, textAlign: 'left', color: '#2C3E50' },
  note: { fontSize: 11, color: MUTED, marginTop: 8, lineHeight: 1.4 },
  empty: { border: `1px dashed ${RULE}`, borderRadius: 3, padding: 16, textAlign: 'center', fontSize: 13, color: MUTED, lineHeight: 1.45 },
  person: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0' },
  av: { width: 30, height: 30, borderRadius: '50%', background: '#DCE4EE', color: NAVY, fontSize: 11, fontWeight: 800, display: 'grid', placeItems: 'center', flex: 'none' },
  trip: { background: '#fff', border: `1px solid ${HAIR}`, borderRadius: 3 },
  tripHead: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '12px 14px 10px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: INK },
  yr: { fontFamily: SERIF, fontSize: 24, color: NAVY, width: 54, flex: 'none', ...LNUM },
  tripName: { fontFamily: SERIF, fontSize: 17, lineHeight: 1.2, color: INK },
  finish: { fontSize: 10.5, ...CAPS, letterSpacing: '1px', color: GOLD, marginTop: 2 },
  grid4: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', borderTop: `1px solid ${HAIR}`, textAlign: 'center', padding: '10px 0' },
  g4Num: { display: 'block', fontSize: 16, fontWeight: 700, ...LNUM },
  g4Lab: { fontSize: 10, ...CAPS, letterSpacing: '1px', color: MUTED },
  rounds: { borderTop: `1px solid ${HAIR}`, padding: '6px 14px 10px', fontSize: 13 },
  roundRow: { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', color: '#2C3E50' },
}
