import { useEffect, useState } from 'react'
import { LEADERBOARDS, rankLeaderboard, rivalsOf } from '../../lib/groupStats'
import GroupPicker from '../../components/GroupPicker'
import { s, NAVY, INK, MUTED, HAIR, ROW_LINE, GOLD, LNUM, CAPS } from './careerTheme'
import { one, roundWhere, intVsPar, fmtRange, fmtDate } from '../../lib/careerFormat'
import { Tile, Cols, TapValue, PeopleTile } from './statTiles'

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
  teamName: { fontSize: 14.5, fontWeight: 700, color: INK },
}

const fmtVal = (def, v) => (v == null ? '—' : def.fmt === 'one' ? one(v) : v)

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
  if (!d.trips.length) return <div style={s.empty}>This group has no trips yet.</div>
  return d.trips.map(t => <TripCard key={t.tripId} t={t} onOpen={() => onOpenTrip(t.tripId)} />)
}

// Full-screen summary of one trip: when, where, courses, who went, teams, the
// final score, and a button into the trip itself (old scorecards etc.).
function TripSummary({ t, onClose, onOpenTrip }) {
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
          {st && <div style={s.note}>{st.unit === 'net' ? 'Net to par, lowest wins.' : st.unit === 'match points' ? 'Match points: 1 for a win, ½ for a tie.' : 'Most points wins.'}</div>}
        </Tile>

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
          <Tile title="Teams">
            {t.teams.map((tm, i) => (
              <div key={tm.id} style={{ ...g.listRow, display: 'block', ...(i === 0 ? { borderTop: 'none', paddingTop: 0 } : null) }}>
                <div style={g.teamName}>{tm.name}</div>
                <div style={g.listSub}>{tm.players.join(', ')}</div>
              </div>
            ))}
          </Tile>
        ) : t.playerNames.length > 0 && (
          <Tile title="Who went" note={`${t.playerNames.length} players`}>
            <div style={{ fontSize: 14, color: '#2C3E50', lineHeight: 1.6 }}>{t.playerNames.join(', ')}</div>
          </Tile>
        )}

        {onOpenTrip && <button type="button" style={g.openBtn} onClick={() => onOpenTrip(t.tripId)}>Open trip</button>}
        {onOpenTrip && <div style={{ ...s.note, textAlign: 'center', marginTop: -6 }}>Scorecards, leaderboard, schedule and chat for this trip.</div>}
      </div>
    </div>
  )
}

function LeadersTab({ d }) {
  const boards = LEADERBOARDS.filter(l => !l.onlyIf || l.onlyIf(d))
  const [id, setId] = useState(boards[0].id)
  const def = boards.find(b => b.id === id) || boards[0]
  const rows = rankLeaderboard(d, def.id)
  return (
    <>
      <div style={g.pills} role="tablist" aria-label="Leaderboard">
        {boards.map(b => (
          <button key={b.id} role="tab" aria-selected={b.id === def.id} className={`pill-btn${b.id === def.id ? ' active' : ''}`} onClick={() => setId(b.id)}>{b.label}</button>
        ))}
      </div>
      <Tile title={def.label} note={['avg', 'best', 'birdies', 'eagles', 'pars'].includes(def.id) ? 'gross' : null}>
        {rows.map((r, i) => {
          const mine = r.member.key === d.viewerKey
          return (
            <div key={r.member.key} style={{ ...g.row, ...(i === 0 ? { borderTop: 'none' } : null), ...(mine ? g.me : null) }}>
              <span style={{ ...g.name, fontWeight: mine ? 700 : 400 }}>{r.member.name}</span>
              <span style={g.value}>
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
        <Cols items={[{ label: r.rec.holders.length > 1 ? `${r.rec.holders.length}-way tie` : 'Record', value: r.rec.v, where: one1?.where ? roundWhere(one1.where) : null }]} />
        <div style={g.holders}>{r.rec.holders.map(h => h.name).join(' · ')}</div>
      </Tile>
    )
  })
}

function RivalsTab({ d }) {
  const [key, setKey] = useState(d.viewerKey || d.members[0]?.key)
  if (!d.hasMatchPlay) return <div style={s.empty}>Partners and rivals show up once the group has played match play.</div>
  const member = d.members.find(m => m.key === key) || d.members[0]
  const { partners, opponents } = rivalsOf(member)
  return (
    <>
      <GroupPicker groups={d.members.map(m => ({ id: m.key, name: m.key === d.viewerKey ? `${m.name} (you)` : m.name }))} value={member.key} onChange={setKey} allowCreate={false} label="Player" />
      {!partners.length && !opponents.length && <div style={s.empty}>{member.name} hasn't finished a match with this group yet.</div>}
      <PeopleTile title="Partners" list={partners} lead="Best partner" leadIf={p => p.w > p.l} />
      <PeopleTile title="Opponents" list={opponents} lead="Nemesis" leadIf={p => p.l > p.w} />
      {(partners.length > 0 || opponents.length > 0) && <div style={{ ...s.note, textAlign: 'center', marginTop: 0 }}>Standard and Point Match Play together. A match counts once every hole is scored.</div>}
    </>
  )
}

// The Group view of the Career stats page (CareerPage.jsx holds the
// Individual | Group switch and loads the data with useGroupStats). The header
// matches the Individual side (Owen 2026-11-06): the group is chosen with the
// dropdown, not named in the banner. onOpenTrip(tripId) goes into a trip.
export function GroupStatsView({ groups, groupId, onPick, stats, error, onBack, switcher, onOpenTrip }) {
  const [tab, setTab] = useState('history')
  const [openTripId, setOpenTripId] = useState(null)
  const t = stats?.totals
  const openTrip = openTripId && stats?.trips.find(x => x.tripId === openTripId)
  if (openTrip) return <TripSummary t={openTrip} onClose={() => setOpenTripId(null)} onOpenTrip={onOpenTrip} />
  return (
    <div style={s.page}>
      <header style={s.mast}>
        <button style={s.back} onClick={onBack}>‹ Home</button>
        {switcher}
        <h1 style={{ ...s.title, marginTop: switcher ? 14 : 30 }}>Career stats</h1>
        <div style={s.rule} />
      </header>

      <div style={s.inner}>
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
