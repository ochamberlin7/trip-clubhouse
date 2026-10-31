import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useMyCareer } from '../../lib/useMyCareer'
import { FORMAT_KEYS, FORMAT_NAMES } from '../../lib/careerDetail'

// Career page (opened from the Career title on Home): one player's numbers across
// every trip. Layout "B" (Owen, 2026-10-30): totals on top, then three tabs —
// Scoring · Competition (match play / Stableford / stroke play) · Trips. Gross and
// net sit side by side in each tile; every tile title is navy. All numbers come
// from buildCareerDetail (careerDetail.js), loaded by the shared useMyCareer so
// they match Home and the Trophy Room. Every number is black (Owen, 2026-10-31);
// a number that came from one trip or round can be tapped to see where.

const NAVY = '#1B3F6E'
const INK = '#0D1B2A'
const MUTED = '#5F6B7A'
const HAIR = '#E3E1DA'
const RULE = '#C9D3E0'
const TILE_BORDER = '#D5DEE8'
const TILE_BAR = '#EEF2F7'
const ROW_LINE = '#EDF0F4'
const GOLD = '#B08A3E'
const GOLD_TEXT = '#D8C08A'
const FAINT = '#9AA6B5'
const SERIF = "'Playfair Display', Georgia, serif"
const CAPS = { fontWeight: 700, letterSpacing: '1.3px', textTransform: 'uppercase' }
const LNUM = { fontVariantNumeric: 'lining-nums tabular-nums', fontFeatureSettings: '"lnum" 1' }

const s = {
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

const TABS = [{ id: 'scoring', label: 'Scoring' }, { id: 'competition', label: 'Competition' }, { id: 'trips', label: 'Trips' }]

const one = n => (n == null ? '—' : n.toFixed(1))
const vsPar = n => (n == null ? '—' : Math.abs(n) < 0.05 ? 'E' : `${n > 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`)
const pct = n => (n == null ? '—' : `${Math.round(n * 100)}%`)
const half = n => (n % 1 ? `${Math.floor(n) || ''}½` : String(n))
const initials = name => (name || '').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '—'
function fmtDate(iso, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!iso) return ''
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' })
}

function Tile({ title, note, children, pad = true }) {
  return (
    <section style={s.tile}>
      <h3 style={{ ...s.tileBar, margin: 0 }}>{title}{note && <span style={s.tileNote}>{note}</span>}</h3>
      <div style={pad ? s.tileBody : undefined}>{children}</div>
    </section>
  )
}

// A number that came from one trip or round: tap it for a small pop-up naming where.
function TapValue({ value, where }) {
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
      <button type="button" style={s.tap} onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label={`${value}. Show where`}>{value}</button>
      {open && (
        <span role="status" style={s.pop}>
          <span style={s.popArrow} />
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
function SmallRecord({ r }) {
  return <span style={{ display: 'flex', flexDirection: 'column' }} aria-label={`${r.w} won, ${r.t} tied, ${r.l} lost`}><RecordHead small /><RecordNums r={r} small /></span>
}

// Numbers side by side. Item: { label, value, sub?, where? } or { record, sub? }.
function Cols({ items }) {
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

function GrossNetTable({ rows }) {
  return (
    <table style={s.table}>
      <thead><tr><th style={{ ...s.th, width: 'auto' }} /><th style={s.th}>Gross</th><th style={s.th}>Net</th></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.label}>
            <td style={s.tdName}>{r.label}</td>
            <td style={s.td}>{r.gross}</td>
            <td style={{ ...s.td, ...(r.net === '—' ? { color: '#9AA6B5', fontWeight: 400 } : null) }}>{r.net}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// Handicap index at each trip, drawn to scale (oldest left).
function HandicapTrend({ points }) {
  if (points.length === 1) return <Cols items={[{ label: points[0].tripName, value: one(points[0].index) }]} />
  const W = 320, top = 22, bottom = 80
  const vals = points.map(p => p.index)
  const lo = Math.floor(Math.min(...vals)), hi = Math.ceil(Math.max(...vals))
  const span = Math.max(hi - lo, 1)
  const x = i => 34 + (i * (W - 64)) / (points.length - 1)
  const y = v => bottom - ((v - lo) / span) * (bottom - top)
  const line = points.map((p, i) => `${x(i)},${y(p.index)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} 104`} width="100%" role="img" aria-label={`Handicap index by trip: ${vals.join(', ')}`}>
      {[hi, lo].map(v => (
        <g key={v}>
          <line x1="24" x2={W - 10} y1={y(v)} y2={y(v)} stroke={ROW_LINE} />
          <text x="0" y={y(v) + 4} fontSize="10" fill={MUTED}>{v}</text>
        </g>
      ))}
      <polygon points={`${line} ${x(points.length - 1)},${bottom} ${x(0)},${bottom}`} fill={NAVY} fillOpacity="0.08" />
      <polyline points={line} fill="none" stroke={NAVY} strokeWidth="2" />
      {points.map((p, i) => {
        const last = i === points.length - 1
        return (
          <g key={p.tripId}>
            <circle cx={x(i)} cy={y(p.index)} r={last ? 4.5 : 3} fill={last ? GOLD : NAVY} />
            <text x={x(i)} y={y(p.index) - 8} fontSize="11" fontWeight="700" fill={INK} textAnchor="middle">{one(p.index)}</text>
            <text x={x(i)} y="98" fontSize="10" fill={MUTED} textAnchor="middle">{p.date ? `${fmtDate(p.date, { month: 'short' })} ’${p.date.slice(2, 4)}` : ''}</text>
          </g>
        )
      })}
    </svg>
  )
}

// Pop-up text for a round ("CTI Michigan" / "Arcadia Bluffs · Oct 1, 2026") or a trip finish.
const roundWhere = r => (r ? { title: r.tripName, detail: [r.course, fmtDate(r.date)].filter(Boolean).join(' · ') } : null)
const tripWhere = f => (f ? { title: f.tripName, detail: f.date ? fmtDate(f.date, { month: 'short', year: 'numeric' }) : '' } : null)

function ScoringTab({ d }) {
  const { gross: g, net: n } = d
  const counts = [
    ['Holes in one', 'aces'], ['Albatrosses', 'albatrosses'], ['Eagles', 'eagles'], ['Birdies', 'birdies'],
    ['Pars', 'pars'], ['Bogeys', 'bogeys'], ['Double bogeys', 'doubles'], ['Triple bogeys or worse', 'triples'],
  ]
  return (
    <>
      <Tile title="Scoring average" note={g.roundsCounted ? `${g.roundsCounted} full 18-hole round${g.roundsCounted === 1 ? '' : 's'}` : null}>
        {g.roundsCounted
          ? <Cols items={[{ label: 'Gross', value: one(g.average) }, { label: 'Net', value: one(n.average) }]} />
          : <div style={{ ...s.note, marginTop: 0, textAlign: 'center' }}>Finish an 18-hole round to see your average.</div>}
      </Tile>
      {g.best && (
        <Tile title="Best round">
          <Cols items={[
            { label: 'Gross', value: g.best.total, where: roundWhere(g.best) },
            { label: 'Net', value: n.best.total, where: roundWhere(n.best) },
          ]} />
        </Tile>
      )}
      {g.worst && g.roundsCounted > 1 && (
        <Tile title="Worst round">
          <Cols items={[
            { label: 'Gross', value: g.worst.total, where: roundWhere(g.worst) },
            { label: 'Net', value: n.worst.total, where: roundWhere(n.worst) },
          ]} />
        </Tile>
      )}
      {d.handicap.length > 0 && (
        <Tile title="Handicap index" note="at each trip"><HandicapTrend points={d.handicap} /></Tile>
      )}
      <Tile title="Where the strokes go" note="average vs par">
        <GrossNetTable rows={[
          { label: 'Par 3s', gross: vsPar(g.byPar[3].vsPar), net: vsPar(n.byPar[3].vsPar) },
          { label: 'Par 4s', gross: vsPar(g.byPar[4].vsPar), net: vsPar(n.byPar[4].vsPar) },
          { label: 'Par 5s', gross: vsPar(g.byPar[5].vsPar), net: vsPar(n.byPar[5].vsPar) },
          { label: 'Hardest 6 holes', gross: vsPar(g.hardest), net: vsPar(n.hardest) },
          { label: 'Front 9 average', gross: one(g.front), net: one(n.front) },
          { label: 'Back 9 average', gross: one(g.back), net: one(n.back) },
          { label: 'Bounce-back', gross: pct(g.bounceBack), net: pct(n.bounceBack) },
        ]} />
        <div style={s.note}>Hardest 6 = the holes with stroke index 1–6. Bounce-back = par or better on the hole right after a bogey or worse.</div>
      </Tile>
      <Tile title="Score totals" note={`${d.totals.holes} holes`}>
        <GrossNetTable rows={counts.map(([label, k]) => ({ label, gross: g.counts[k], net: k === 'aces' ? '—' : n.counts[k] }))} />
        <div style={s.note}>A hole in one also counts in its own row (an ace on a par 3 is an eagle). Holes in one are gross only.</div>
      </Tile>
    </>
  )
}

function PeopleTile({ title, list, lead, leadIf, unit = 'match' }) {
  if (!list.length) return null
  return (
    <Tile title={title}>
      {list.map((p, i) => (
        <div key={p.key} style={{ ...s.person, ...(i ? { borderTop: `1px solid ${ROW_LINE}` } : null) }}>
          <span style={s.av}>{initials(p.name)}</span>
          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ fontSize: 14, color: '#2C3E50' }}>{p.name}</span>
            <span style={{ fontSize: 11, color: MUTED }}>{i === 0 && leadIf(p) ? `${lead} · ` : ''}{plural(p.matches, unit)}</span>
          </span>
          <span style={{ marginLeft: 'auto' }}><SmallRecord r={p} /></span>
        </div>
      ))}
    </Tile>
  )
}

const intVsPar = n => (n == null ? '—' : n === 0 ? 'E' : `${n > 0 ? '+' : '−'}${Math.abs(n)}`)
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : word.endsWith('h') ? 'es' : 's'}`
const formatLabel = f => ((f.format === 'stableford' || f.format === 'stroke') && f.teams ? `Team ${FORMAT_NAMES[f.format]}` : FORMAT_NAMES[f.format])

// First tile of every format pill: your best finish (tap for the trip) and trips won.
function FormatHead({ name, f, note }) {
  return (
    <Tile title={name} note={note}>
      <Cols items={[
        { label: 'Best finish', value: f.bestFinish?.label || '—', where: tripWhere(f.bestFinish) },
        { label: 'Trips won', value: f.won },
      ]} />
    </Tile>
  )
}

function People({ f, unit }) {
  return (
    <>
      <PeopleTile title="Partners" list={f.partners} lead="Best partner" leadIf={p => p.w > p.l} unit={unit} />
      <PeopleTile title="Opponents" list={f.opponents} lead="Nemesis" leadIf={p => p.l > p.w} unit={unit} />
    </>
  )
}

function AllPanel({ c }) {
  const { standard, points } = c.formats
  return (
    <>
      <Tile title="Trips won" note={plural(c.tournamentTrips, 'tournament trip')}>
        <Cols items={[{ label: 'Won', value: c.titles }, { label: 'Top 3', value: c.top3 }]} />
      </Tile>
      {c.finishes.length > 0 && (
        <Tile title="Finishes">
          {c.finishes.map((f, i) => (
            <div key={f.tripId} style={{ ...s.person, ...(i ? { borderTop: `1px solid ${ROW_LINE}` } : null) }}>
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontSize: 14, color: '#2C3E50' }}>{f.name}</span>
                <span style={{ fontSize: 11, color: MUTED }}>{[f.startDate?.slice(0, 4), formatLabel(f)].filter(Boolean).join(' · ')}</span>
              </span>
              <b style={{ marginLeft: 'auto', fontSize: 14, color: INK }}>{f.finish}</b>
            </div>
          ))}
        </Tile>
      )}
      {(standard || points) && (
        <Tile title="Match play record" note={standard && points ? 'both formats' : null}>
          <Cols items={[{ record: c.record }]} />
        </Tile>
      )}
    </>
  )
}

function StandardPanel({ f }) {
  return (
    <>
      <FormatHead name="Standard Match Play" f={f} note={`${plural(f.trips, 'trip')} · ${plural(f.matches, 'match')}`} />
      <Tile title="Matches">
        <Cols items={[
          { record: f.record },
          { label: 'Match points', value: half(f.matchPoints), sub: `of ${f.matches}` },
          { label: 'Holes won', value: f.points },
        ]} />
      </Tile>
      <People f={f} unit="match" />
    </>
  )
}

function PointsPanel({ f }) {
  return (
    <>
      <FormatHead name="Point Match Play" f={f} note={`${plural(f.trips, 'trip')} · ${plural(f.rounds, 'round')}`} />
      <Tile title="Points">
        <Cols items={[
          { label: 'Won', value: f.points },
          { label: 'Defended', value: f.defended },
          { label: 'Per round', value: one(f.perRound) },
        ]} />
      </Tile>
      <Tile title="Rounds">
        <Cols items={[
          { record: f.record, sub: "your group's match each round" },
          { label: 'Best round', value: f.bestRound ? f.bestRound.points : '—', where: roundWhere(f.bestRound) },
        ]} />
      </Tile>
      <People f={f} unit="round" />
    </>
  )
}

function StablefordPanel({ f }) {
  return (
    <>
      <FormatHead name="Stableford" f={f} note={`${plural(f.trips, 'trip')} · ${plural(f.rounds, 'round')}`} />
      <Tile title="Stableford points">
        <Cols items={[{ label: 'Total', value: f.points }, { label: 'Per round', value: one(f.perRound) }]} />
      </Tile>
      <Tile title="Rounds">
        <Cols items={[
          { label: 'Best round', value: f.best ? f.best.points : '—', where: roundWhere(f.best) },
          { label: 'Played to handicap', value: f.toHandicap, sub: 'rounds of 36+ (2 a hole)' },
        ]} />
      </Tile>
    </>
  )
}

function StrokePanel({ f }) {
  return (
    <>
      <FormatHead name="Stroke Play" f={f} note={`${plural(f.trips, 'trip')} · ${plural(f.rounds, 'round')}`} />
      <Tile title="Net to par">
        <Cols items={[
          { label: 'Per round', value: vsPar(f.netToPar) },
          { label: 'Best round', value: f.best ? intVsPar(f.best.netToPar) : '—', where: roundWhere(f.best) },
        ]} />
      </Tile>
    </>
  )
}

const PANELS = { standard: StandardPanel, points: PointsPanel, stableford: StablefordPanel, stroke: StrokePanel }

// Competition (layout "2", Owen 2026-10-31): a row of pills — All, then only the
// formats you've played — each showing that format's own numbers.
function CompetitionTab({ d }) {
  const c = d.competition
  const [pill, setPill] = useState('all')
  const present = FORMAT_KEYS.filter(k => c.formats[k])
  if (!present.length) {
    return <div style={s.empty}>Your competition numbers show up after a trip with a tournament: match play, Stableford or stroke play.</div>
  }
  const Panel = PANELS[pill]
  return (
    <>
      <div style={s.pills} role="tablist" aria-label="Formats">
        {[['all', 'All'], ...present.map(k => [k, FORMAT_NAMES[k]])].map(([k, label]) => (
          <button key={k} role="tab" aria-selected={pill === k} className={`pill-btn${pill === k ? ' active' : ''}`} onClick={() => setPill(k)}>{label}</button>
        ))}
      </div>
      {pill === 'all' ? <AllPanel c={c} /> : <Panel f={c.formats[pill]} />}
      {(pill === 'all' || pill === 'standard' || pill === 'points') && (c.formats.standard || c.formats.points) && (
        <div style={{ ...s.note, textAlign: 'center', marginTop: 0 }}>A match counts once every hole is scored. The side that won more holes wins it; equal holes is a tie.</div>
      )}
      <div style={{ ...s.note, textAlign: 'center', marginTop: 0 }}>Net on this page always uses your full handicap, so it means the same on every trip.</div>
    </>
  )
}

function TripsTab({ d }) {
  const [open, setOpen] = useState(() => d.trips[0]?.tripId || null)
  if (!d.trips.length) return <div style={s.empty}>Your trips show up here after your first round.</div>
  return d.trips.map(t => {
    const isOpen = open === t.tripId
    return (
      <section key={t.tripId} style={{ ...s.trip, ...(isOpen ? { borderColor: NAVY } : null) }}>
        <button style={s.tripHead} onClick={() => setOpen(isOpen ? null : t.tripId)} aria-expanded={isOpen}>
          <span style={s.yr}>{t.startDate ? t.startDate.slice(0, 4) : ''}</span>
          <span style={{ minWidth: 0 }}>
            <span style={{ ...s.tripName, display: 'block' }}>{t.name}</span>
            {t.finish && <span style={{ ...s.finish, display: 'block' }}>{t.finish}</span>}
          </span>
          <span style={{ marginLeft: 'auto', color: '#9AA6B5', fontSize: 18 }}>{isOpen ? '⌃' : '⌄'}</span>
        </button>
        <div style={s.grid4}>
          <div><b style={s.g4Num}>{t.rounds}</b><span style={s.g4Lab}>Rounds</span></div>
          <div><b style={s.g4Num}>{one(t.average)}</b><span style={s.g4Lab}>Avg</span></div>
          <div><b style={s.g4Num}>{t.best ?? '—'}</b><span style={s.g4Lab}>Best</span></div>
          {t.gameType === 'stableford'
            ? <div><b style={s.g4Num}>{t.stableford ?? '—'}</b><span style={s.g4Lab}>Stbl pts</span></div>
            : t.gameType === 'stroke'
              ? <div><b style={s.g4Num}>{intVsPar(t.netToPar)}</b><span style={s.g4Lab}>Net</span></div>
              : <div><b style={s.g4Num}>{t.gameType === 'match' ? t.points : '—'}</b><span style={s.g4Lab}>Points</span></div>}
        </div>
        {isOpen && (
          <div style={s.rounds}>
            {t.roundsList.map(r => (
              <div key={r.roundId} style={s.roundRow}>
                <span style={{ minWidth: 0 }}>
                  {[fmtDate(r.date, { month: 'short', day: 'numeric' }), r.course].filter(Boolean).join(' · ') || 'Round'}
                  {r.practice && <span style={{ color: MUTED }}> · Practice</span>}
                </span>
                <b style={LNUM}>{r.gross}{!r.complete && <span style={{ color: MUTED, fontWeight: 400 }}> thru {r.holesScored}</span>}</b>
              </div>
            ))}
          </div>
        )}
      </section>
    )
  })
}

export default function CareerPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { detail } = useMyCareer(user?.id)
  const name = (user?.user_metadata?.display_name || '').trim()
  return <CareerView detail={detail} name={name} onBack={() => navigate('/home')} />
}

// The page itself, given the numbers (kept apart from loading so it can be previewed).
export function CareerView({ detail, name, onBack }) {
  const [tab, setTab] = useState('scoring')
  const hi = detail?.handicap?.length ? detail.handicap[detail.handicap.length - 1].index : null
  const since = detail?.trips?.length ? detail.trips[detail.trips.length - 1].startDate?.slice(0, 4) : null

  return (
    <div style={s.page}>
      <header style={s.mast}>
        <button style={s.back} onClick={onBack}>‹ Home</button>
        <div style={s.eyebrow}>Your career</div>
        <h1 style={s.title}>Career</h1>
        {name && <div style={s.who}>{name}</div>}
        <div style={s.rule} />
        {(hi != null || since) && (
          <div style={s.hi}>{[hi != null && `Handicap index ${one(hi)}`, since && `since ${since}`].filter(Boolean).join(' · ')}</div>
        )}
      </header>

      <div style={s.inner}>
        {!detail ? (
          <div style={s.empty}>Adding up your stats…</div>
        ) : (
          <>
            <div style={s.totals}>
              {[['Total trips', detail.totals.trips], ['Total rounds', detail.totals.rounds], ['Holes played', detail.totals.holes]].map(([label, v], i) => (
                <div key={label} style={{ textAlign: 'center', ...(i ? { borderLeft: `1px solid ${HAIR}` } : null) }}>
                  <b style={s.totNum}>{v}</b><span style={s.totLab}>{label}</span>
                </div>
              ))}
            </div>
            {detail.totals.trips === 0 ? (
              <div style={s.empty}>Your stats start with your first round.</div>
            ) : (
              <>
                <div style={s.tabs} role="tablist" aria-label="Career sections">
                  {TABS.map(t => (
                    <button key={t.id} role="tab" aria-selected={tab === t.id} style={{ ...s.tab, ...(tab === t.id ? s.tabOn : null) }} onClick={() => setTab(t.id)}>{t.label}</button>
                  ))}
                </div>
                {tab === 'scoring' && <ScoringTab d={detail} />}
                {tab === 'competition' && <CompetitionTab d={detail} />}
                {tab === 'trips' && <TripsTab d={detail} />}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
