import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useMyCareer } from '../../lib/useMyCareer'
import { useGroup } from '../../context/GroupContext'
import { FORMAT_KEYS, FORMAT_NAMES } from '../../lib/careerDetail'
import { s, NAVY, INK, MUTED, HAIR, ROW_LINE, GOLD, LNUM } from './careerTheme'
import { one, vsPar, pct, half, fmtDate, roundWhere, tripWhere, intVsPar, plural, formatLabel } from '../../lib/careerFormat'
import { Tile, Cols, GrossNetTable, PeopleTile, CareerSwitch } from './statTiles'
import { GroupStatsView } from './GroupStatsPage'
import { useGroupStats } from '../../lib/useGroupStats'

// Career page (opened from the Career title on Home): one player's numbers across
// every trip. Layout "B" (Owen, 2026-10-30): totals on top, then three tabs —
// Scoring · Competition (match play / Stableford / stroke play) · Trips. Gross and
// net sit side by side in each tile; every tile title is navy. All numbers come
// from buildCareerDetail (careerDetail.js), loaded by the shared useMyCareer so
// they match Home and the Trophy Room. Every number is black (Owen, 2026-10-31);
// a number that came from one trip or round can be tapped to see where.

const TABS = [{ id: 'scoring', label: 'Scoring' }, { id: 'competition', label: 'Competition' }, { id: 'trips', label: 'Trips' }]

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
  const onBack = () => navigate('/home')
  return view === 'group'
    ? <GroupStatsView groups={group.groups} groupId={group.groupId} onPick={group.setGroupId} stats={group.stats} error={group.error} onBack={onBack} switcher={switcher}
        onOpenTrip={id => { switchTrip(id); navigate('/dashboard') }} />
    : <CareerView detail={detail} name={name} onBack={onBack} switcher={switcher} />
}

// The page itself, given the numbers (kept apart from loading so it can be previewed).
export function CareerView({ detail, name, onBack, switcher }) {
  const [tab, setTab] = useState('scoring')
  const hi = detail?.handicap?.length ? detail.handicap[detail.handicap.length - 1].index : null
  const since = detail?.trips?.length ? detail.trips[detail.trips.length - 1].startDate?.slice(0, 4) : null

  return (
    <div style={s.page}>
      <header style={s.mast}>
        <button style={s.back} onClick={onBack}>‹ Home</button>
        {switcher}
        <h1 style={{ ...s.title, marginTop: switcher ? 14 : 30 }}>Career stats</h1>
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
