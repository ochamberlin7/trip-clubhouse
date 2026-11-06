// Charts for the Career stats page (Individual and Group), from the "Stats Chart
// Upgrades" mockups (Owen, 2026-11-06). Rules they share:
//   • lower values sit lower (a lower score = a lower line);
//   • line charts scroll sideways once there are more trips than fit, open on the
//     latest, and keep their scale fixed on the left;
//   • numbers stay black; colour only marks things (blue-to-red score scale from
//     ColorBrewer RdBu, colorblind-safe; navy = you, grey = everyone else);
//   • every mark has a hover / long-press title with its exact value.
import { useLayoutEffect, useRef, useState } from 'react'
import { INK, MUTED, NAVY, ROW_LINE, SCORE_COLORS } from './careerTheme'
import { winShareColor } from '../../lib/chartScale'

const AXIS_W = 28
const txt = { fontFamily: 'inherit', fontSize: 10, fill: MUTED }
const val = { fontFamily: 'inherit', fontSize: 11, fontWeight: 700, fill: INK }

// A scrolling line chart.
//   labels:  one per x position (trips / years / rounds)
//   xs:      optional pixel x for each label (e.g. real dates); else evenly spaced by `step`
//   series:  [{ key, values: [number|null], color, width = 2, dots = true, endLabel?, title? }]
//            null values break the line (a player who missed a trip)
//   lo / hi / ticks: the value scale; fmt formats tick and point labels
//   pointLabels: draw the value above each point of the FIRST series
//            (or per series: pointLabel: 'above' | 'below')
//   pointFmt: formats point labels (defaults to fmt)
//   xTicks:  optional [{ x, label }] axis ticks (e.g. Jan 1 of each year) drawn instead of a label per point
export function ScrollLineChart({ labels, xs, xTicks, step = 76, series, lo, hi, ticks, fmt = v => v, pointFmt, pointLabels = false, height = 150, endPad = 52, area = false }) {
  const bodyRef = useRef(null)
  const [scrolls, setScrolls] = useState(false)
  const top = 18, bot = height - 26
  // Enough room on the left that the first label isn't cut off (~5.6px a character).
  const pad = Math.max(22, xTicks ? 0 : Math.ceil(String(labels[0] || '').length * 2.9) + 4)
  const xAt = xs ? (i => pad + xs[i]) : (i => pad + i * step)
  const width = Math.max(pad * 2 + Math.max(xs ? Math.max(0, ...xs) : step * Math.max(0, labels.length - 1), ...(xTicks || []).map(t => t.x)) + endPad, 120)
  const y = v => bot - (v - lo) / (hi - lo || 1) * (bot - top)
  useLayoutEffect(() => {
    const b = bodyRef.current
    if (!b) return
    b.scrollLeft = b.scrollWidth
    setScrolls(b.scrollWidth > b.clientWidth + 4)
    // Again once layout settles (fonts, tile width), so it opens on the very end.
    // Again once layout settles (fonts, tile width, the hint line), so it opens on the very end.
    const end = () => { b.scrollLeft = b.scrollWidth }
    const id = requestAnimationFrame(end)
    const t = setTimeout(end, 120)
    return () => { cancelAnimationFrame(id); clearTimeout(t) }
  }, [width])
  const segs = vals => {
    const out = []; let cur = []
    vals.forEach((v, i) => { if (v == null) { if (cur.length) out.push(cur); cur = [] } else cur.push([xAt(i), y(v)]) })
    if (cur.length) out.push(cur)
    return out
  }
  const first = series[0]
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        <svg width={AXIS_W} height={height} style={{ flex: 'none', display: 'block' }} aria-hidden="true">
          {ticks.map(t => <text key={t} x={AXIS_W - 6} y={y(t) + 3} textAnchor="end" style={txt}>{fmt(t)}</text>)}
        </svg>
        <div ref={bodyRef} style={{ flex: 1, minWidth: 0, overflowX: 'auto', overscrollBehaviorX: 'contain', scrollbarWidth: 'none' }}>
          <svg width={width} height={height} style={{ display: 'block' }} role="img" aria-label={series.map(s => `${s.title || s.key}: ${s.values.map(v => (v == null ? '—' : fmt(v))).join(', ')}`).join('; ')}>
            {ticks.map(t => <line key={t} x1={0} x2={width} y1={y(t)} y2={y(t)} stroke={ROW_LINE} />)}
            {xTicks
              ? xTicks.map(t => (
                <g key={t.label}>
                  <line x1={pad + t.x} x2={pad + t.x} y1={bot} y2={bot + 4} stroke="#C9D3E0" />
                  <text x={pad + t.x} y={height - 8} textAnchor="middle" style={txt}>{t.label}</text>
                </g>
              ))
              : labels.map((l, i) => <text key={`${l}${i}`} x={xAt(i)} y={height - 8} textAnchor="middle" style={txt}>{l}</text>)}
            {area && first && segs(first.values).map((sg, i) => (
              <polygon key={`a${i}`} points={`${sg.map(p => p.join(',')).join(' ')} ${sg.at(-1)[0]},${bot} ${sg[0][0]},${bot}`} fill={first.color} fillOpacity="0.08" />
            ))}
            {series.map(s => segs(s.values).map((sg, i) => (
              <polyline key={`${s.key}${i}`} points={sg.map(p => p.join(',')).join(' ')} fill="none" stroke={s.color} strokeWidth={s.width || 2} strokeLinejoin="round" strokeLinecap="round">
                {s.title && <title>{s.title}</title>}
              </polyline>
            )))}
            {series.filter(s => s.dots !== false).map(s => s.values.map((v, i) => v == null ? null : (
              <circle key={`${s.key}d${i}`} cx={xAt(i)} cy={y(v)} r={i === s.values.length - 1 && s.lastDot ? 4.5 : 3.2} fill={i === s.values.length - 1 && s.lastDot ? s.lastDot : s.color} stroke="#fff" strokeWidth="2">
                <title>{`${s.title ? `${s.title}, ` : ''}${labels[i]}: ${fmt(v)}`}</title>
              </circle>
            )))}
            {series.map((s, k) => {
              const where = s.pointLabel || (pointLabels && k === 0 ? 'above' : null)
              return where && s.values.map((v, i) => v == null ? null : (
                <text key={`p${s.key}${i}`} x={xAt(i)} y={where === 'below' ? y(v) + 17 : y(v) - 8} textAnchor="middle" style={val}>{(pointFmt || fmt)(v)}</text>
              ))
            })}
            {series.filter(s => s.endLabel).map(s => {
              const i = s.values.reduce((k, v, j) => (v != null ? j : k), -1)
              return i < 0 ? null : <text key={`e${s.key}`} x={xAt(i) + 9} y={y(s.values[i]) + 4} style={{ ...val, fill: s.labelColor || INK }}>{s.endLabel}</text>
            })}
          </svg>
        </div>
      </div>
      {scrolls && <div style={{ fontSize: 10.5, color: '#9AA6B5', textAlign: 'right', marginTop: 2 }}>← swipe for earlier trips</div>}
    </div>
  )
}


// Score mix: one bar per score, best to worst (the order is the scale), each with
// its count and share. counts: { eagles (incl. albatrosses), birdies, pars, bogeys, doubles, triples }.
export function ScoreMixBars({ rows }) {
  const total = rows.reduce((a, r) => a + r.n, 0) || 1
  const max = Math.max(1, ...rows.map(r => r.n))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} role="img" aria-label={rows.map(r => `${r.label} ${r.n}`).join(', ')}>
      {rows.map(r => (
        <div key={r.label} style={{ display: 'grid', gridTemplateColumns: '64px 1fr 40px', alignItems: 'center', gap: 8 }} title={`${r.label}: ${r.n} of ${total} holes (${Math.round(r.n / total * 100)}%)`}>
          <span style={{ fontSize: 13, color: '#2C3E50' }}>{r.label}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{ height: 14, width: `${Math.max(1.5, r.n / max * 100)}%`, background: SCORE_COLORS[r.tone], borderRadius: '0 4px 4px 0', flex: 'none', maxWidth: 'calc(100% - 30px)' }} />
            <b style={{ fontSize: 12.5, color: INK, fontVariantNumeric: 'tabular-nums' }}>{r.n}</b>
          </span>
          <span style={{ fontSize: 11.5, color: MUTED, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Math.round(r.n / total * 100)}%</span>
        </div>
      ))}
    </div>
  )
}

// Average vs par per hole type, gross: a line from par out to each average.
//   rows: [{ label, v (avg strokes vs par), n (holes) }]
export function VsParDots({ rows }) {
  const vs = rows.map(r => r.v).filter(v => v != null)
  const lo = Math.min(-0.5, Math.floor(Math.min(0, ...vs) * 2) / 2), hi = Math.max(1, Math.ceil(Math.max(0, ...vs) * 2) / 2)
  const W = 320, L = 92, R = 40, rowH = 30, H = rows.length * rowH + 26
  const x = v => L + (v - lo) / (hi - lo) * (W - L - R)
  const ticks = []
  for (let t = lo; t <= hi + 1e-9; t += 0.5) ticks.push(Math.round(t * 10) / 10)
  const sign = v => (Math.abs(v) < 0.05 ? 'E' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} role="img" aria-label={rows.map(r => `${r.label} ${r.v == null ? 'no data' : sign(r.v)}`).join(', ')}>
      {ticks.map(t => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={4} y2={H - 22} stroke={t === 0 ? MUTED : ROW_LINE} strokeDasharray={t === 0 ? '3 3' : undefined} />
          <text x={x(t)} y={H - 8} textAnchor="middle" style={txt}>{t === 0 ? 'Par' : sign(t)}</text>
        </g>
      ))}
      {rows.map((r, i) => {
        const yy = 16 + i * rowH
        return (
          <g key={r.label}>
            <text x={0} y={yy + 4} style={{ ...txt, fontSize: 12.5, fill: '#2C3E50' }}>{r.label}</text>
            {r.v != null && (
              <>
                <line x1={x(0)} x2={x(r.v)} y1={yy} y2={yy} stroke={NAVY} strokeWidth="2" />
                <circle cx={x(r.v)} cy={yy} r="5.5" fill={NAVY} stroke="#fff" strokeWidth="2"><title>{`${r.label}: ${sign(r.v)} per hole (${r.n} holes)`}</title></circle>
                <text x={x(r.v) + (r.v >= 0 ? 10 : -10)} y={yy + 4} textAnchor={r.v >= 0 ? 'start' : 'end'} style={val}>{sign(r.v)}</text>
              </>
            )}
          </g>
        )
      })}
    </svg>
  )
}


// Head-to-head grid: every member against every other (row player's W–T–L).
export function HeadToHeadGrid({ h2h, viewerKey }) {
  const first = n => (n || '').split(/\s+/)[0]
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 2, fontSize: 11, fontVariantNumeric: 'tabular-nums', minWidth: '100%' }}>
        <thead>
          <tr>
            <th style={{ position: 'sticky', left: 0, background: '#fff' }} />
            {h2h.order.map(m => <th key={m.key} style={{ fontSize: 10.5, color: MUTED, fontWeight: 700, padding: '2px 4px', whiteSpace: 'nowrap' }}>{first(m.name)}</th>)}
          </tr>
        </thead>
        <tbody>
          {h2h.order.map(a => (
            <tr key={a.key}>
              <th style={{ position: 'sticky', left: 0, background: '#fff', textAlign: 'left', fontSize: 11.5, color: a.key === viewerKey ? INK : '#2C3E50', fontWeight: 700, padding: '2px 6px 2px 0', whiteSpace: 'nowrap' }}>
                {first(a.name)}{a.key === viewerKey ? ' (you)' : ''}
              </th>
              {h2h.order.map(b => {
                if (a.key === b.key) return <td key={b.key} style={{ minWidth: 40, borderRadius: 3, background: 'repeating-linear-gradient(45deg, #EEF1F5 0 4px, #F7F8FA 4px 8px)' }} aria-label="same player" />
                const r = h2h.cell(a.key, b.key)
                if (!r) return <td key={b.key} style={{ minWidth: 40, textAlign: 'center', padding: '7px 2px', borderRadius: 3, background: '#F7F8FA', color: '#9AA6B5' }}>—</td>
                const games = r.w + r.t + r.l
                const c = winShareColor((r.w + r.t / 2) / games)
                return (
                  <td key={b.key} title={`${a.name} vs ${b.name}: ${r.w} won, ${r.t} tied, ${r.l} lost`}
                    style={{ minWidth: 40, textAlign: 'center', padding: '7px 2px', borderRadius: 3, fontWeight: 700, background: c.bg, color: c.dark ? '#fff' : INK, whiteSpace: 'nowrap' }}>
                    {r.w}–{r.t}–{r.l}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Legend row for the line charts: coloured line + name (+ value).
export function LineKey({ items }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 6 }}>
      {items.map(it => (
        <span key={it.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#2C3E50' }}>
          <span style={{ width: it.square ? 10 : 16, height: it.square ? 10 : it.thin ? 2 : 3, borderRadius: 2, background: it.color, flex: 'none' }} />
          {it.label}{it.value != null && <b style={{ color: INK, fontVariantNumeric: 'tabular-nums' }}>{it.value}</b>}
        </span>
      ))}
    </div>
  )
}

