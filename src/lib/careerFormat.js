// Number and label formatting shared by the Career and Group stats pages.
import { FORMAT_NAMES } from './careerDetail.js'

export const one = n => (n == null ? '—' : n.toFixed(1))
export const vsPar = n => (n == null ? '—' : Math.abs(n) < 0.05 ? 'E' : `${n > 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`)
export const pct = n => (n == null ? '—' : `${Math.round(n * 100)}%`)
export const half = n => (n % 1 ? `${Math.floor(n) || ''}½` : String(n))
export const initials = name => (name || '').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '—'
export function fmtDate(iso, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!iso) return ''
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' })
}
// Pop-up text for a round ("CTI Michigan" / "Arcadia Bluffs · Oct 1, 2026") or a trip finish.
export const roundWhere = r => (r ? { title: r.tripName, detail: [r.course, fmtDate(r.date)].filter(Boolean).join(' · ') } : null)
export const tripWhere = f => (f ? { title: f.tripName, detail: f.date ? fmtDate(f.date, { month: 'short', year: 'numeric' }) : '' } : null)
export const intVsPar = n => (n == null ? '—' : n === 0 ? 'E' : `${n > 0 ? '+' : '−'}${Math.abs(n)}`)
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : word.endsWith('h') ? 'es' : 's'}`
export const formatLabel = f => ((f.format === 'stableford' || f.format === 'stroke') && f.teams ? `Team ${FORMAT_NAMES[f.format]}` : FORMAT_NAMES[f.format])
