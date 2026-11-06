// Small helpers for the Career stats charts (scales and colours). Pure.

// A nice tick set around [min, max] with `n` steps.
// maxGaps: most gaps between gridlines before trying a bigger step (short charts use fewer).
export function niceScale(values, { pad = 0.5, step: fixed, maxGaps = 6 } = {}) {
  const vs = values.filter(v => v != null)
  if (!vs.length) return { lo: 0, hi: 1, ticks: [0, 1] }
  let lo = Math.min(...vs) - pad, hi = Math.max(...vs) + pad
  const span = hi - lo
  // About five gridlines: the smallest "nice" step (1, 2, 5 × 10^k) giving ≤ maxGaps gaps once rounded out.
  let step = fixed
  if (!step) {
    const raw = span / 5, mag = 10 ** Math.floor(Math.log10(raw || 1))
    step = [1, 2, 5, 10].map(m => m * mag).find(c => Math.ceil(hi / c - 1e-9) - Math.floor(lo / c + 1e-9) <= maxGaps) || 10 * mag
    if (step < 1) step = Math.max(0.5, step) // whole or half strokes only
  }
  lo = Math.floor(lo / step) * step
  hi = Math.ceil(hi / step) * step
  const ticks = []
  for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(Math.round(t * 10) / 10)
  return { lo, hi, ticks }
}

// A W–T–L cell colour: blue when the row player won more, red when they lost more,
// light grey when even (ColorBrewer RdBu).
const STOPS = [[0, [178, 24, 43]], [0.25, [244, 165, 130]], [0.5, [242, 242, 242]], [0.75, [146, 197, 222]], [1, [33, 102, 172]]]
export function winShareColor(p) {
  for (let i = 1; i < STOPS.length; i++) {
    if (p <= STOPS[i][0]) {
      const [a, ca] = STOPS[i - 1], [b, cb] = STOPS[i], k = (p - a) / (b - a)
      return { bg: `rgb(${ca.map((v, j) => Math.round(v + (cb[j] - v) * k)).join(',')})`, dark: p <= 0.15 || p >= 0.85 }
    }
  }
  return { bg: 'rgb(33,102,172)', dark: true }
}
