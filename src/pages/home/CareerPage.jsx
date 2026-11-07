import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useMyCareer } from '../../lib/useMyCareer'
import { useGroup } from '../../context/GroupContext'
import { FORMAT_KEYS, FORMAT_NAMES } from '../../lib/careerDetail'
import { s, NAVY, INK, MUTED, HAIR, ROW_LINE, GOLD, LNUM } from './careerTheme'
import { one, vsPar, pct, half, fmtDate, roundWhere, tripWhere, intVsPar, plural, formatLabel } from '../../lib/careerFormat'
import { Tile, Cols, StatList, PeopleTile, CareerSwitch } from './statTiles'
import { ScrollLineChart, ScoreMixBars, VsParDots } from './statCharts'
import { niceScale } from '../../lib/chartScale'
import { GroupStatsView } from './GroupStatsPage'
import { useGroupStats } from '../../lib/useGroupStats'

// Career page (opened from the Career title on Home): one player's numbers across
// every trip. Layout "B" (Owen, 2026-10-30): totals on top, then three tabs —
// Scoring · Competition (match play / Stableford / stroke play) · Trips. Gross and
// net sit side by side in each tile; every tile title is navy. All numbers come
// from buildCareerDetail (careerDetail.js), loaded by the shared useMyCareer so
// they match Home and the Trophy Room. Every number is black (Owen, 2026-10-31);
// a number that came from one trip or round can be tapped to see where.

// Fire / drinks / defended totals. A copy saved on the phone before these existed
// has none, so fall back to zeros until the fresh numbers arrive.
const NO_EXTRAS = { defended: 0, drinks: 0, fireHoles: 0, longestFire: null }
const ex = d => d.extras || NO_EXTRAS

const TABS = [{ id: 'scoring', label: 'Scoring' }, { id: 'competition', label: 'Competition' }, { id: 'trips', label: 'Trips' }]


// Scoring (Owen 2026-11-06): the scoring average shows gross and net side by side
// with a gross line by trip (net is listed, not charted); best/worst rounds and the rest stay gross. Net uses the
// full handicap, so it means the same on every trip. Handicap is a line on a real
// timeline. Charts from the "Stats Chart Upgrades" mockups; they scroll sideways.

// Handicap points on a real timeline: x by date (PX_PER_YEAR), nudged apart so two
// trips close together don't overlap; a tick at Jan 1 of each year.
const PX_PER_YEAR = 84, MIN_GAP = 40
function handicapTimeline(hc) {
  const t = hc.map(p => (p.date ? Date.parse(p.date) : NaN))
  if (t.some(Number.isNaN) || hc.length < 2) return null
  const yr = 365.25 * 86400000
  const startYear = new Date(t[0]).getUTCFullYear()
  const origin = Date.UTC(startYear, 0, 1)
  const raw = t.map(v => ((v - origin) / yr) * PX_PER_YEAR)
  const xs = []
  raw.forEach((r, i) => xs.push(i ? Math.max(r, xs[i - 1] + MIN_GAP) : r))
  // Map a raw x onto the nudged axis (piecewise between neighbouring points).
  const place = r => {
    if (r <= raw[0]) return r + (xs[0] - raw[0])
    for (let i = 1; i < raw.length; i++) {
      if (r <= raw[i]) {
        const f = raw[i] === raw[i - 1] ? 1 : (r - raw[i - 1]) / (raw[i] - raw[i - 1])
        return xs[i - 1] + f * (xs[i] - xs[i - 1])
      }
    }
    return r + (xs.at(-1) - raw.at(-1))
  }
  const endYear = new Date(t.at(-1)).getUTCFullYear() + 1
  const xTicks = []
  for (let y = startYear; y <= endYear; y++) xTicks.push({ x: place(((Date.UTC(y, 0, 1) - origin) / yr) * PX_PER_YEAR), label: String(y) })
  return { xs, xTicks }
}

const trend = (a, b) => (a == null || b == null ? null : <>{a < b ? '▼' : a > b ? '▲' : '='} <b style={{ color: INK }}>{Math.abs(a - b).toFixed(1)}</b> vs last trip</>)

function ScoringTab({ d }) {
  const g = d.gross
  // Average on each trip, oldest first (trips with a full 18-hole round).
  const byTrip = [...d.trips].reverse().filter(t => t.average != null)
  const avgScale = niceScale(byTrip.map(t => t.average), { pad: 2, maxGaps: 3 })
  const last = byTrip.at(-1), prev = byTrip.at(-2)
  // Handicap index at each trip, oldest first.
  const hc = d.handicap
  const timeline = handicapTimeline(hc)
  const hcScale = niceScale(hc.map(p => p.index), { pad: 1 })
  const mix = [
    { label: 'Eagle+', n: g.counts.eagles + g.counts.albatrosses, tone: 'eagle' },
    { label: 'Birdie', n: g.counts.birdies, tone: 'birdie' },
    { label: 'Par', n: g.counts.pars, tone: 'par' },
    { label: 'Bogey', n: g.counts.bogeys, tone: 'bogey' },
    { label: 'Double', n: g.counts.doubles, tone: 'double' },
    { label: 'Triple+', n: g.counts.triples, tone: 'triple' },
  ]
  const shortTrip = t => `${(t.name || '').replace(/\s*'?\d{2,4}$/, '').split(/\s+/).slice(-1)[0] || 'Trip'} '${(t.startDate || '').slice(2, 4)}`
  const fmtAvg = v => (Number.isInteger(v) ? v : v.toFixed(1))
  return (
    <>
      <Tile title="Scoring average" note={g.roundsCounted ? `${g.roundsCounted} full round${g.roundsCounted === 1 ? '' : 's'} · ${plural(byTrip.length, 'trip')}` : null}>
        {g.roundsCounted ? (
          <>
            <Cols items={[
              { label: 'Gross', value: one(g.average), sub: trend(last?.average, prev?.average) },
              { label: 'Net', value: d.net?.average == null ? '—' : one(d.net.average), sub: trend(last?.netAverage, prev?.netAverage) },
            ]} />
            {byTrip.length > 0 && (
              <div style={{ marginTop: 12 }}>
                {/* Gross line only; net is the number above (Owen 2026-11-06 mockup). */}
                <ScrollLineChart
                  labels={byTrip.map(shortTrip)} step={100} height={124} area pointLabels {...avgScale}
                  fmt={fmtAvg} pointFmt={v => v.toFixed(1)}
                  series={[{ key: 'gross', title: 'Gross average', values: byTrip.map(t => t.average), color: NAVY, lastDot: GOLD }]}
                />
              </div>
            )}
          </>
        ) : <div style={{ ...s.note, marginTop: 0, textAlign: 'center' }}>Finish an 18-hole round to see your average.</div>}
      </Tile>
      {g.roundsCounted > 0 && (
        <Tile title="Best and worst round" note="gross">
          <Cols items={[
            { label: 'Best', value: g.best?.total ?? '—', where: roundWhere(g.best) },
            { label: 'Worst', value: g.worst?.total ?? '—', where: g.roundsCounted > 1 ? roundWhere(g.worst) : null },
          ]} />
        </Tile>
      )}
      {hc.length > 0 && (
        <Tile title="Handicap index" note="at each trip">
          {hc.length > 1 ? (
            <ScrollLineChart
              labels={hc.map(p => p.tripName || '')} xs={timeline?.xs} xTicks={timeline?.xTicks} step={84}
              height={160} pointLabels {...hcScale} fmt={v => (Number.isInteger(v) ? v : one(v))}
              series={[{ key: 'hc', title: 'Handicap index', values: hc.map(p => p.index), color: NAVY, lastDot: GOLD }]}
            />
          ) : <Cols items={[{ label: 'Index', value: one(hc[0].index) }]} />}
        </Tile>
      )}
      <Tile title="Where the strokes go" note="gross · average vs par per hole">
        <VsParDots rows={[
          { label: 'Par 3s', v: g.byPar[3].vsPar, n: g.byPar[3].holes },
          { label: 'Par 4s', v: g.byPar[4].vsPar, n: g.byPar[4].holes },
          { label: 'Par 5s', v: g.byPar[5].vsPar, n: g.byPar[5].holes },
          { label: 'Hardest 6', v: g.hardest, n: null },
        ]} />
        <div style={{ marginTop: 6 }}>
          <StatList rows={[
            { label: 'Front 9 average', value: one(g.front) },
            { label: 'Back 9 average', value: one(g.back) },
            { label: 'Bounce-back', value: pct(g.bounceBack) },
          ]} />
        </div>
        <div style={s.note}>Hardest 6 = the holes with stroke index 1–6. Bounce-back = par or better on the hole right after a bogey or worse.</div>
      </Tile>
      <Tile title="Score totals" note={`gross · ${d.totals.holes} holes`}>
        <ScoreMixBars rows={mix} />
        {g.counts.aces > 0 && <div style={s.note}>Holes in one: {g.counts.aces} (counted in Eagle+).</div>}
      </Tile>
      {/* Fire and drinks (Owen 2026-11-06): each trip's Stats tab numbers, added up. */}
      <Tile title="Fire and drinks">
        <Cols items={[
          { label: 'Fire holes', value: ex(d).fireHoles },
          { label: 'Longest streak', value: ex(d).longestFire ? plural(ex(d).longestFire.holes, 'hole') : '—', where: tripWhere(ex(d).longestFire) },
          { label: 'Drinks', value: ex(d).drinks },
        ]} />
      </Tile>
    </>
  )
}

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
      <PeopleTile title="Partners" list={f.partners} unit={unit} />
      <PeopleTile title="Opponents" list={f.opponents} unit={unit} />
    </>
  )
}

function AllPanel({ c, defended }) {
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
          <Cols items={[{ record: c.record }, { label: 'Points defended', value: defended }]} />
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
      {pill === 'all' ? <AllPanel c={c} defended={ex(d).defended} /> : <Panel f={c.formats[pill]} />}
      {(pill === 'all' || pill === 'standard' || pill === 'points') && (c.formats.standard || c.formats.points) && (
        <div style={{ ...s.note, textAlign: 'center', marginTop: 0 }}>A match counts once every hole is scored. The side that won more holes wins it; equal holes is a tie.</div>
      )}
      <div style={{ ...s.note, textAlign: 'center', marginTop: 0 }}>Net on this page always uses your full handicap, so it means the same on every trip.</div>
    </>
  )
}

function TripsTab({ d }) {
  const [open, setOpen] = useState(() => d.trips[0]?.tripId || null)
  if (!d.trips.length) return <div style={s.empty}>Your trips show up here once they're over.</div>
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
        {t.past ? (
          <div style={{ ...s.grid4, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <div><b style={s.g4Num}>{t.rounds ?? '—'}</b><span style={s.g4Lab}>Rounds</span></div>
            <div><b style={s.g4Num}>{t.handicap == null ? '—' : one(t.handicap)}</b><span style={s.g4Lab}>Handicap</span></div>
          </div>
        ) : (
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
        )}
        {isOpen && t.past && (
          <div style={s.rounds}>
            {t.courses.map(c => <div key={c} style={s.roundRow}><span style={{ minWidth: 0 }}>{c}</span></div>)}
            <div style={{ ...s.note, marginTop: 6 }}>{[t.pastFormat, 'From the trip spreadsheet, before the app. No scorecards.'].filter(Boolean).join(' · ')}</div>
          </div>
        )}
        {isOpen && !t.past && (
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

// Career stats (Owen 2026-11-06): one page, linked as "Career stats" on Home, with
// an Individual | Group switch — your own numbers, or a group's (GroupStatsView).
// /career?view=group opens on Group; the last view is remembered on the phone.
const VIEW_KEY = 'careerStats:view'
function initialView() {
  const q = new URLSearchParams(window.location.search).get('view')
  if (q === 'group' || q === 'me') return q
  try { return localStorage.getItem(VIEW_KEY) === 'group' ? 'group' : 'me' } catch { return 'me' }
}

export default function CareerPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [view, setViewState] = useState(initialView)
  const setView = v => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v) } catch { /* private mode */ } }
  const { switchTrip } = useGroup()
  const { detail } = useMyCareer(user?.id)
  const group = useGroupStats(user?.id, { enabled: view === 'group' })
  const name = (user?.user_metadata?.display_name || '').trim()
  const switcher = <CareerSwitch value={view} onChange={setView} />
  // Name, handicap and "since" stay in the header on both sides (Owen 2026-11-06).
  const headline = careerHeadline(detail)
  const onBack = () => navigate('/home')
  return view === 'group'
    ? <GroupStatsView groups={group.groups} groupId={group.groupId} onPick={group.setGroupId} stats={group.stats} error={group.error} onBack={onBack} switcher={switcher} name={name} headline={headline}
        onOpenTrip={id => { switchTrip(id); navigate('/dashboard') }} />
    : <CareerView detail={detail} name={name} onBack={onBack} switcher={switcher} />
}

// "Handicap index 12.8 · since 2019" under your name in the header.
function careerHeadline(detail) {
  const hi = detail?.handicap?.length ? detail.handicap[detail.handicap.length - 1].index : null
  const since = detail?.trips?.length ? detail.trips[detail.trips.length - 1].startDate?.slice(0, 4) : null
  return [hi != null && `Handicap index ${one(hi)}`, since && `since ${since}`].filter(Boolean).join(' · ')
}

// The page itself, given the numbers (kept apart from loading so it can be previewed).
export function CareerView({ detail, name, onBack, switcher }) {
  const [tab, setTab] = useState('scoring')
  const headline = careerHeadline(detail)

  return (
    <div style={s.page}>
      <header style={s.mast}>
        <button style={s.back} onClick={onBack}>‹ Home</button>
        <h1 style={{ ...s.title, marginTop: 30 }}>Career stats</h1>
        {name && <div style={s.who}>{name}</div>}
        <div style={s.rule} />
        {headline && <div style={s.hi}>{headline}</div>}
      </header>

      <div style={s.inner}>
        {/* Individual | Group switch sits just under the navy header (Owen 2026-11-06). */}
        {switcher}
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
