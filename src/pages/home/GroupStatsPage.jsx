import { useEffect, useState } from 'react'
import { LEADERBOARDS, rankLeaderboard, rivalsOf, headToHead, averagesByTrip } from '../../lib/groupStats'
import GroupPicker from '../../components/GroupPicker'
import { s, NAVY, INK, MUTED, HAIR, ROW_LINE, GOLD, LNUM, CAPS, CROWD } from './careerTheme'
import { one, roundWhere, intVsPar, fmtRange, fmtDate } from '../../lib/careerFormat'
import { Tile, Cols, TapValue, PeopleTile } from './statTiles'
import { ScrollLineChart, HeadToHeadGrid, LineKey } from './statCharts'
import { niceScale } from '../../lib/chartScale'
import { TEAM_COLORS, LEGACY_TEAM_COLORS, paletteForTrip } from '../../lib/teamColors'

// Group stats (Owen, 2026-11-06; the Group side of the Career stats page): pick one of your groups, then see that group's
// numbers across every trip it has taken — trip history and winners, all-time
// leaderboards, group records, and each member's partners and rivals. Same look
// as the Career page; every member's numbers come from the Career page's own math
// (buildGroupStats → buildCareerDetail), limited to the group's trips.

const TABS = [{ id: 'history', label: 'History' }, { id: 'leaders', label: 'Leaders' }, { id: 'records', label: 'Records' }, { id: 'rivals', label: 'Rivals' }]

const g = {
  title: { ...s.title, fontSize: 30, padding: '0 40px', textWrap: 'balance' },
  pickerWrap: { marginTop: -2 },
  winner: { fontSize: 10.5, ...CAPS, letterSpacing: '1px', color: GOLD, marginTop: 3 },
  muted: { fontSize: 12, color: MUTED, lineHeight: 1.4 },
  statusPill: { fontSize: 10.5, ...CAPS, letterSpacing: '1px', color: NAVY },
  pills: { display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: `1px solid ${ROW_LINE}` },
  name: { fontSize: 14, color: '#2C3E50', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  value: { marginLeft: 'auto', fontSize: 15, fontWeight: 800, color: INK, ...LNUM },
  me: { background: '#F3F6FA', margin: '0 -12px', padding: '9px 12px' },
  holders: { fontSize: 13, color: '#2C3E50', textAlign: 'center', marginTop: 6, lineHeight: 1.4 },
  cardBtn: { display: 'block', width: '100%', padding: 0, background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: INK },
  dates: { display: 'block', fontSize: 12.5, color: MUTED, marginTop: 2 },
  listRow: { display: 'flex', alignItems: 'baseline', gap: 10, padding: '9px 0', borderTop: `1px solid ${ROW_LINE}`, fontSize: 14, color: '#2C3E50' },
  listSub: { fontSize: 12, color: MUTED, marginTop: 2, lineHeight: 1.35 },
  openBtn: { display: 'block', width: '100%', padding: '14px 0', background: NAVY, color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 700, letterSpacing: '1.4px', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit' },
}

const fmtVal = (def, v) => (v == null ? '—' : def.fmt === 'one' ? one(v) : def.fmt === 'vsPar' ? (Math.abs(v) < 0.05 ? 'E' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`) : v)

// Bar length for a leaderboard value: counts from 0; lower-is-better stats from a
// floor just under the best value, so the best has the shortest bar and gaps show.
function barScale(def, rows) {
  const vs = rows.map(r => r.v).filter(v => v != null)
  if (!vs.length) return () => 0
  const max = Math.max(...vs), min = Math.min(...vs)
  if (def.hi !== false && min >= 0) return v => (max > 0 ? v / max : 0)
  const floor = min - Math.max(1, (max - min) * 0.25)
  return v => (max > floor ? (v - floor) / (max - floor) : 1)
}

// You vs the crowd: everyone's gross average by trip, you in navy, others grey.
function CrowdChart({ d }) {
  const c = averagesByTrip(d)
  if (c.trips.length < 2) return null
  const me = c.lines.find(l => l.key === d.viewerKey)
  const others = c.lines.filter(l => l !== me && l.values.some(v => v != null))
  const scale = niceScale(c.lines.flatMap(l => l.values), { pad: 1 })
  const series = [
    ...others.map(l => ({ key: l.key, title: l.name, values: l.values, color: CROWD, width: 1.5, dots: false })),
    ...(me ? [{ key: me.key, title: 'You', values: me.values, color: NAVY, width: 2.5, endLabel: 'You', labelColor: NAVY }] : []),
  ]
  return (
    <Tile title="Scoring average by trip" note="gross">
      <ScrollLineChart labels={c.trips.map(t => `’${t.year.slice(2)}`)} step={72} height={170} series={series} {...scale} />
      <div style={s.note}>A lower line is a lower score. You in navy, everyone else in grey.</div>
    </Tile>
  )
}

// How it was won: running totals round by round (teams in their colours; for a
// big individual field the winner and you in colour, everyone else grey).
function RaceChart({ t, viewerKey }) {
  const race = t.race
  if (!race || race.rounds.length < 2) return null
  const pal = paletteForTrip({ end_date: t.endDate }) === 'legacy' ? LEGACY_TEAM_COLORS : TEAM_COLORS
  const winnerIds = new Set((t.standings?.rows || []).filter(r => r.rank === 1).map(r => r.id))
  const crowd = race.lines.length > 4 && race.lines.every(l => l.teamIndex == null)
  const colorOf = (l, i) => {
    if (l.teamIndex != null) return (pal[l.teamIndex] || pal[1]).solid
    if (!crowd) return [NAVY, GOLD, '#15808F', '#7A3F9E'][i] || CROWD
    return l.key && l.key === viewerKey ? NAVY : winnerIds.has(l.id) && t.status === 'past' ? GOLD : CROWD
  }
  const fmt = v => (race.lowWins ? (v === 0 ? 'E' : `${v > 0 ? '+' : '−'}${Math.abs(v)}`) : (Number.isInteger(v) ? v : v.toFixed(1)))
  const lines = race.lines.map((l, i) => ({ ...l, color: colorOf(l, i) }))
  const ordered = [...lines].sort((a, b) => (a.color === CROWD) - (b.color === CROWD)).reverse()
  const scale = niceScale(lines.flatMap(l => l.values), { pad: race.lowWins ? 1 : 0.5 })
  const keyItems = crowd
    ? [...lines.filter(l => l.color !== CROWD).map(l => ({ label: l.key === viewerKey ? `${l.name} (you)` : l.name, color: l.color, value: fmt(l.values.at(-1)) })), { label: 'Everyone else', color: CROWD, thin: true }]
    : lines.map(l => ({ label: l.name, color: l.color, value: fmt(l.values.at(-1)) }))
  return (
    <Tile title="How it was won" note={race.lowWins ? 'net to par, lowest wins' : 'running total'}>
      <ScrollLineChart labels={race.rounds.map(r => r.label)} step={70} height={160} fmt={fmt}
        series={ordered.map(l => ({ key: l.id, title: l.name, values: l.values, color: l.color, width: l.color === CROWD ? 1.5 : 2.5, dots: l.color !== CROWD }))} {...scale} />
      <LineKey items={keyItems} />
    </Tile>
  )
}

// The trip's result line: "Won by Team Owen", "Upcoming", "In progress"…
function resultLine(t) {
  if (t.winner) return { text: t.winner.tied ? t.winner.label : `Won by ${t.winner.label}`, gold: true }
  if (t.status === 'upcoming') return { text: 'Upcoming' }
  if (t.status === 'live') return { text: 'In progress' }
  return { text: t.format === 'No tournament' ? 'No tournament' : 'Final' }
}

// History card (Owen 2026-11-06): big year · name, dates, result; rounds /
// players / courses. Tap for the trip's full summary.
function TripCard({ t, onOpen }) {
  const res = resultLine(t)
  return (
    <section style={s.trip}>
      <button type="button" style={g.cardBtn} onClick={onOpen} aria-label={`${t.name}: see the trip`}>
        <div style={{ ...s.tripHead, cursor: 'pointer' }}>
          <span style={s.yr}>{t.startDate ? t.startDate.slice(0, 4) : ''}</span>
          <span style={{ minWidth: 0 }}>
            <span style={{ ...s.tripName, display: 'block' }}>{t.name}</span>
            {t.startDate && <span style={g.dates}>{fmtRange(t.startDate, t.endDate)}</span>}
            <span style={{ ...(res.gold ? g.winner : g.statusPill), display: 'block', marginTop: 3 }}>{res.text}</span>
          </span>
          <span style={{ marginLeft: 'auto', color: '#9AA6B5', fontSize: 20 }} aria-hidden="true">›</span>
        </div>
        <div style={{ ...s.grid4, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <div><b style={s.g4Num}>{t.rounds}</b><span style={s.g4Lab}>Rounds</span></div>
          <div><b style={s.g4Num}>{t.players}</b><span style={s.g4Lab}>Players</span></div>
          <div><b style={s.g4Num}>{t.courses.length}</b><span style={s.g4Lab}>Courses</span></div>
        </div>
      </button>
    </section>
  )
}

function HistoryTab({ d, onOpenTrip }) {
  if (!d.trips.length) return <div style={s.empty}>Trips show up here once they're over.</div>
  return d.trips.map(t => <TripCard key={t.tripId} t={t} onOpen={() => onOpenTrip(t.tripId)} />)
}

// Players in a two-column grid (Owen 2026-11-06: anywhere it lists who went,
// a grid, not a list) — team cards and "Who went".
function NameGrid({ names, pad = 0 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 10, padding: pad }}>
      {names.map((name, j) => (
        <div key={name + j} style={{ fontSize: 13, color: INK, padding: '5px 0', borderTop: j > 1 ? '1px solid #EEF1F4' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
      ))}
    </div>
  )
}

// Full-screen summary of one trip: when, where, courses, who went, teams, the
// final score, and a button into the trip itself (old scorecards etc.).
function TripSummary({ t, onClose, onOpenTrip, viewerKey }) {
  useEffect(() => { window.scrollTo(0, 0) }, [])
  const res = resultLine(t)
  const st = t.standings
  const fmtTotal = v => (v == null ? '—' : st?.unit === 'net' ? intVsPar(v) : v)
  return (
    <div style={s.page}>
      <header style={s.mast}>
        <button style={s.back} onClick={onClose}>‹ Group</button>
        <div style={s.eyebrow}>{t.startDate ? t.startDate.slice(0, 4) : 'Trip'}</div>
        <h1 style={{ ...s.title, fontSize: 30, padding: '0 40px', textWrap: 'balance' }}>{t.name}</h1>
        <div style={s.rule} />
        <div style={s.hi}>{[t.startDate && fmtRange(t.startDate, t.endDate), t.location.join(' · ')].filter(Boolean).join(' · ')}</div>
      </header>
      <div style={s.inner}>
        <div style={{ ...s.totals, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {[['Rounds', t.rounds], ['Players', t.players], ['Courses', t.courses.length]].map(([label, v], i) => (
            <div key={label} style={{ textAlign: 'center', ...(i ? { borderLeft: `1px solid ${HAIR}` } : null) }}>
              <b style={{ ...s.totNum, fontSize: 28 }}>{v}</b><span style={s.totLab}>{label}</span>
            </div>
          ))}
        </div>

        <Tile title={st ? (t.status === 'past' ? 'Final score' : 'Standings so far') : 'Result'} note={t.format}>
          {st ? st.rows.map((r, i) => (
            <div key={r.id} style={{ ...g.listRow, ...(i === 0 ? { borderTop: 'none', paddingTop: 0 } : null) }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: r.rank === 1 ? 700 : 400, color: INK }}>{r.name}</span>
              </span>
              <b style={{ ...g.value, alignSelf: 'center' }}>{fmtTotal(r.total)}</b>
            </div>
          )) : <div style={{ ...s.note, marginTop: 0, textAlign: 'center' }}>{res.text}</div>}
          {t.past && <div style={s.note}>From the trip spreadsheet, before the app{st && st.rows.some(r => r.total == null) ? '; the final points weren\'t recorded' : ''}.</div>}
          {st && !t.past && <div style={s.note}>{st.unit === 'net' ? 'Net to par, lowest wins.' : st.unit === 'match points' ? 'Match points: 1 for a win, ½ for a tie.' : 'Most points wins.'}</div>}
        </Tile>

        <RaceChart t={t} viewerKey={viewerKey} />

        {t.past && t.courses.length > 0 && (
          <Tile title="Courses" note={`${t.rounds} round${t.rounds === 1 ? '' : 's'}`}>
            {t.courses.map((c, i) => (
              <div key={c} style={{ ...g.listRow, ...(i === 0 ? { borderTop: 'none', paddingTop: 0 } : null) }}>
                <span style={{ minWidth: 0 }}>{c}</span>
              </div>
            ))}
          </Tile>
        )}

        {t.roundList.length > 0 && (
          <Tile title="Courses" note={`${t.roundList.length} round${t.roundList.length === 1 ? '' : 's'}`}>
            {t.roundList.map((r, i) => (
              <div key={r.id} style={{ ...g.listRow, ...(i === 0 ? { borderTop: 'none', paddingTop: 0 } : null) }}>
                <span style={{ width: 92, flex: 'none', color: MUTED, fontSize: 13 }}>{r.date ? fmtDate(r.date, { weekday: 'short', month: 'short', day: 'numeric' }) : '—'}</span>
                <span style={{ minWidth: 0 }}>{r.course}{r.practice && <span style={{ color: MUTED }}> · Practice</span>}</span>
              </div>
            ))}
          </Tile>
        )}

        {t.teams.length > 0 ? (
          <Tile title="Teams" note={`${t.teams.length} teams`}>
            {/* Team cards stacked one per row so any number of teams fits (Owen
                2026-11-06): a band in the team's colour, then the players in a
                two-column grid. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {t.teams.map(tm => {
                const pal = paletteForTrip({ end_date: t.endDate }) === 'legacy' ? LEGACY_TEAM_COLORS : TEAM_COLORS
                const color = (pal[tm.teamIndex] || pal[1]).solid
                return (
                  <div key={tm.id} style={{ border: '1px solid #E1E7EE', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ background: color, color: '#fff', fontSize: 13, fontWeight: 800, padding: '7px 10px', lineHeight: 1.2 }}>{tm.name}</div>
                    <NameGrid names={tm.players} pad="4px 10px 6px" />
                  </div>
                )
              })}
            </div>
          </Tile>
        ) : t.playerNames.length > 0 && (
          <Tile title="Who went" note={`${t.playerNames.length} players`}>
            <NameGrid names={t.playerNames} />
          </Tile>
        )}

        {onOpenTrip && !t.past && <button type="button" style={g.openBtn} onClick={() => onOpenTrip(t.tripId)}>Open trip</button>}
        {onOpenTrip && !t.past && <div style={{ ...s.note, textAlign: 'center', marginTop: -6 }}>Scorecards, leaderboard, schedule and chat for this trip.</div>}
      </div>
    </div>
  )
}

function LeadersTab({ d }) {
  const boards = LEADERBOARDS.filter(l => !l.onlyIf || l.onlyIf(d))
  const [id, setId] = useState(boards[0].id)
  const def = boards.find(b => b.id === id) || boards[0]
  const rows = rankLeaderboard(d, def.id)
  const bar = barScale(def, rows)
  if (!d.members.length) return <div style={s.empty}>Leaders show up here once the group has played a round.</div>
  return (
    <>
      <div style={g.pills} role="tablist" aria-label="Leaderboard">
        {boards.map(b => (
          <button key={b.id} role="tab" aria-selected={b.id === def.id} className={`pill-btn${b.id === def.id ? ' active' : ''}`} onClick={() => setId(b.id)}>{b.label}</button>
        ))}
      </div>
      {def.id === 'avg' && <CrowdChart d={d} />}
      <Tile title={def.label} note={def.note || (['avg', 'best', 'birdies', 'eagles', 'pars'].includes(def.id) ? 'gross' : null)}>
        {rows.map((r, i) => {
          const mine = r.member.key === d.viewerKey
          return (
            <div key={r.member.key} style={{ ...g.row, ...(i === 0 ? { borderTop: 'none' } : null), ...(mine ? g.me : null) }}>
              <span style={{ ...g.name, fontWeight: mine ? 700 : 400, width: 128, flex: 'none' }}>{r.member.name}</span>
              <span style={{ flex: 1, minWidth: 0, height: 10, display: 'flex' }} aria-hidden="true">
                {r.v != null && bar(r.v) > 0 && <span style={{ width: `${bar(r.v) * 100}%`, background: mine ? NAVY : CROWD, borderRadius: '0 4px 4px 0' }} />}
              </span>
              <span style={{ ...g.value, marginLeft: 8, minWidth: 34, textAlign: 'right' }}>
                {r.where && r.v != null ? <TapValue value={fmtVal(def, r.v)} where={roundWhere(r.where)} size="sm" /> : fmtVal(def, r.v)}
              </span>
            </div>
          )
        })}
      </Tile>
      <div style={{ ...s.note, textAlign: 'center', marginTop: 0 }}>Counts only this group's trips.</div>
    </>
  )
}

function RecordsTab({ d }) {
  if (!d.records.length) return <div style={s.empty}>Records show up once the group has finished a round.</div>
  return d.records.map(r => {
    const one1 = r.rec.holders.length === 1 ? r.rec.holders[0] : null
    return (
      <Tile key={r.id} title={r.label} note={r.note}>
        <Cols items={[{ label: r.rec.holders.length > 1 ? `${r.rec.holders.length}-way tie` : 'Record', value: r.fmt === 'vsPar' ? intVsPar(r.rec.v) : r.rec.v, where: one1?.where ? roundWhere(one1.where) : null }]} />
        <div style={g.holders}>{r.rec.holders.map(h => h.name).join(' · ')}</div>
      </Tile>
    )
  })
}

// Rivals: a head-to-head grid of everyone (Rounds works for every format: the
// lower net score each round you both played; Matches for match play groups),
// then any member's match play partners and opponents.
function RivalsTab({ d }) {
  const [key, setKey] = useState(d.viewerKey || d.members[0]?.key)
  const [mode, setMode] = useState(d.hasMatchPlay ? 'matches' : 'rounds')
  const h2h = headToHead(d, mode)
  const member = d.members.find(m => m.key === key) || d.members[0]
  const { partners, opponents } = rivalsOf(member)
  // Nobody has scored with this group yet (e.g. its only trip is still upcoming).
  if (!member) return <div style={s.empty}>Rivals show up here once the group has played a round.</div>
  return (
    <>
      <Tile title="Head to head" note="row player's record">
        {d.hasMatchPlay && (
          <div style={{ display: 'inline-flex', background: '#E4E8EE', borderRadius: 28, padding: 3, marginBottom: 10 }} role="tablist" aria-label="Count">
            {[['matches', 'Matches'], ['rounds', 'Rounds']].map(([m, label]) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
                style={{ padding: '5px 16px', fontSize: 12, fontWeight: 700, borderRadius: 28, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: mode === m ? NAVY : 'transparent', color: mode === m ? '#fff' : MUTED }}>{label}</button>
            ))}
          </div>
        )}
        <HeadToHeadGrid h2h={h2h} viewerKey={d.viewerKey} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: MUTED, marginTop: 8 }}>
          <span>Lost more</span><span style={{ flex: 1, height: 8, borderRadius: 4, background: 'linear-gradient(90deg, #B2182B, #F4A582, #F2F2F2, #92C5DE, #2166AC)' }} /><span>Won more</span>
        </div>
        <div style={s.note}>{mode === 'matches'
          ? 'Read across: the row player\'s win–tie–loss in match play against the column player. Grey: never played each other.'
          : 'Read across: every full round both played, the lower net score wins (full handicaps, any format). Grey: never in the same round.'}</div>
      </Tile>
      {d.hasMatchPlay && (
        <>
          <GroupPicker groups={d.members.map(m => ({ id: m.key, name: m.key === d.viewerKey ? `${m.name} (you)` : m.name }))} value={member.key} onChange={setKey} allowCreate={false} label="Player" />
          {!partners.length && !opponents.length && <div style={s.empty}>{member.name} hasn't finished a match with this group yet.</div>}
          <PeopleTile title="Partners" list={partners} />
          <PeopleTile title="Opponents" list={opponents} />
          {(partners.length > 0 || opponents.length > 0) && <div style={{ ...s.note, textAlign: 'center', marginTop: 0 }}>Standard and Point Match Play together. A match counts once every hole is scored.</div>}
        </>
      )}
    </>
  )
}

// The Group view of the Career stats page (CareerPage.jsx holds the
// Individual | Group switch and loads the data with useGroupStats). The header
// matches the Individual side (Owen 2026-11-06): the group is chosen with the
// dropdown, not named in the banner. onOpenTrip(tripId) goes into a trip.
export function GroupStatsView({ groups, groupId, onPick, stats, error, onBack, switcher, onOpenTrip, name, headline }) {
  const [tab, setTab] = useState('history')
  const [openTripId, setOpenTripId] = useState(null)
  const t = stats?.totals
  const openTrip = openTripId && stats?.trips.find(x => x.tripId === openTripId)
  if (openTrip) return <TripSummary t={openTrip} onClose={() => setOpenTripId(null)} onOpenTrip={onOpenTrip} viewerKey={stats?.viewerKey} />
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
        {groups == null ? <div style={s.empty}>Loading your groups…</div>
          : groups.length === 0 ? <div style={s.empty}>Your groups show up here after your first trip.</div>
            : (
              <>
                <div style={g.pickerWrap}>
                  <GroupPicker groups={groups} value={groupId} onChange={id => { onPick(id); setTab('history'); setOpenTripId(null) }} allowCreate={false} />
                </div>
                {error ? <div style={s.empty}>{error}</div>
                  : !stats ? <div style={s.empty}>Adding up the group's stats…</div>
                    : (
                      <>
                        <div style={{ ...s.totals, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
                          {[['Trips', t.trips], ['Rounds', t.rounds], ['Players', t.players], ['Courses', t.courses]].map(([label, v], i) => (
                            <div key={label} style={{ textAlign: 'center', ...(i ? { borderLeft: `1px solid ${HAIR}` } : null) }}>
                              <b style={{ ...s.totNum, fontSize: 28 }}>{v}</b><span style={s.totLab}>{label}</span>
                            </div>
                          ))}
                        </div>
                        <div style={s.tabs} role="tablist" aria-label="Group sections">
                          {TABS.map(x => (
                            <button key={x.id} role="tab" aria-selected={tab === x.id} style={{ ...s.tab, ...(tab === x.id ? s.tabOn : null) }} onClick={() => setTab(x.id)}>{x.label}</button>
                          ))}
                        </div>
                        {tab === 'history' && <HistoryTab d={stats} onOpenTrip={setOpenTripId} />}
                        {tab === 'leaders' && <LeadersTab key={groupId} d={stats} />}
                        {tab === 'records' && <RecordsTab d={stats} />}
                        {tab === 'rivals' && <RivalsTab key={groupId} d={stats} />}
                      </>
                    )}
              </>
            )}
      </div>
    </div>
  )
}
