import { useState } from 'react'
import { LEADERBOARDS, rankLeaderboard, rivalsOf } from '../../lib/groupStats'
import GroupPicker from '../../components/GroupPicker'
import { s, NAVY, INK, MUTED, HAIR, ROW_LINE, GOLD, LNUM, CAPS } from './careerTheme'
import { one, roundWhere, plural } from '../../lib/careerFormat'
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
  seg: { display: 'inline-flex', alignSelf: 'flex-start', background: '#E4E8EE', borderRadius: 28, padding: 3 },
  segBtn: on => ({ padding: '5px 16px', fontSize: 12, fontWeight: 700, borderRadius: 28, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: on ? NAVY : 'transparent', color: on ? '#fff' : MUTED }),
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: `1px solid ${ROW_LINE}` },
  rank: { width: 22, fontSize: 13, color: MUTED, ...LNUM, textAlign: 'right', flex: 'none' },
  name: { fontSize: 14, color: '#2C3E50', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  value: { marginLeft: 'auto', fontSize: 15, fontWeight: 800, color: INK, ...LNUM },
  me: { background: '#F3F6FA', margin: '0 -12px', padding: '9px 12px' },
  holders: { fontSize: 13, color: '#2C3E50', textAlign: 'center', marginTop: 6, lineHeight: 1.4 },
}

const fmtVal = (def, v) => (v == null ? '—' : def.fmt === 'one' ? one(v) : v)
const yearsOf = t => (t.firstYear ? (t.lastYear && t.lastYear !== t.firstYear ? `${t.firstYear}–${t.lastYear}` : t.firstYear) : null)

function TripCard({ t }) {
  const status = t.status === 'upcoming' ? 'Upcoming' : t.status === 'live' ? 'In progress' : null
  return (
    <section style={s.trip}>
      <div style={{ ...s.tripHead, cursor: 'default' }}>
        <span style={s.yr}>{t.startDate ? t.startDate.slice(0, 4) : ''}</span>
        <span style={{ minWidth: 0 }}>
          <span style={{ ...s.tripName, display: 'block' }}>{t.name}</span>
          <span style={{ ...g.muted, display: 'block' }}>{t.format}</span>
          {t.winner && <span style={{ ...g.winner, display: 'block' }}>Won by {t.winner.label}</span>}
          {!t.winner && status && <span style={{ ...g.statusPill, display: 'block', marginTop: 3 }}>{status}</span>}
        </span>
      </div>
      <div style={{ ...s.grid4, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <div><b style={s.g4Num}>{t.rounds}</b><span style={s.g4Lab}>Rounds</span></div>
        <div><b style={s.g4Num}>{t.players}</b><span style={s.g4Lab}>Players</span></div>
        <div><b style={s.g4Num}>{t.courses.length}</b><span style={s.g4Lab}>Courses</span></div>
      </div>
      {(t.courses.length > 0 || t.winner?.players?.length > 0) && (
        <div style={{ ...s.rounds, paddingTop: 8 }}>
          {t.winner?.kind === 'team' && t.winner.players.length > 0 && <div style={g.muted}>{t.winner.label}: {t.winner.players.join(', ')}</div>}
          {t.courses.length > 0 && <div style={{ ...g.muted, marginTop: t.winner?.kind === 'team' ? 4 : 0 }}>{t.courses.join(' · ')}</div>}
        </div>
      )}
    </section>
  )
}

function HistoryTab({ d }) {
  if (!d.trips.length) return <div style={s.empty}>This group has no trips yet.</div>
  return d.trips.map(t => <TripCard key={t.tripId} t={t} />)
}

function LeadersTab({ d }) {
  const boards = LEADERBOARDS.filter(l => !l.onlyIf || l.onlyIf(d))
  const [id, setId] = useState(boards[0].id)
  const [mode, setMode] = useState('gross')
  const def = boards.find(b => b.id === id) || boards[0]
  const split = !def.value
  const rows = rankLeaderboard(d, def.id, mode)
  return (
    <>
      <div style={g.pills} role="tablist" aria-label="Leaderboard">
        {boards.map(b => (
          <button key={b.id} role="tab" aria-selected={b.id === def.id} className={`pill-btn${b.id === def.id ? ' active' : ''}`} onClick={() => setId(b.id)}>{b.label}</button>
        ))}
      </div>
      {split && (
        <div style={g.seg} role="tablist" aria-label="Gross or net">
          {['gross', 'net'].map(m => <button key={m} role="tab" aria-selected={mode === m} style={g.segBtn(mode === m)} onClick={() => setMode(m)}>{m === 'gross' ? 'Gross' : 'Net'}</button>)}
        </div>
      )}
      <Tile title={def.label} note={split ? (mode === 'gross' ? 'gross' : 'net') : null}>
        {rows.map((r, i) => {
          const mine = r.member.key === d.viewerKey
          return (
            <div key={r.member.key} style={{ ...g.row, ...(i === 0 ? { borderTop: 'none' } : null), ...(mine ? g.me : null) }}>
              <span style={g.rank}>{r.rank ?? ''}</span>
              <span style={{ ...g.name, fontWeight: mine ? 700 : 400 }}>{r.member.name}</span>
              <span style={g.value}>
                {r.where && r.v != null ? <TapValue value={fmtVal(def, r.v)} where={roundWhere(r.where)} size="sm" /> : fmtVal(def, r.v)}
              </span>
            </div>
          )
        })}
      </Tile>
      <div style={{ ...s.note, textAlign: 'center', marginTop: 0 }}>Counts only this group's trips. Net uses each player's full handicap.</div>
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
// Individual | Group switch and loads the data with useGroupStats).
export function GroupStatsView({ groups, groupId, onPick, stats, error, onBack, switcher }) {
  const [tab, setTab] = useState('history')
  const group = groups?.find(x => x.id === groupId) || null
  const t = stats?.totals
  const sub = t ? [plural(t.trips, 'trip'), yearsOf(t), plural(t.players, 'player')].filter(Boolean).join(' · ') : null
  return (
    <div style={s.page}>
      <header style={s.mast}>
        <button style={s.back} onClick={onBack}>‹ Home</button>
        {switcher}
        <div style={{ ...s.eyebrow, ...(switcher ? { marginTop: 14 } : null) }}>Career stats · Group</div>
        <h1 style={g.title}>{group?.name || 'Your groups'}</h1>
        <div style={s.rule} />
        {sub && <div style={s.hi}>{sub}</div>}
      </header>

      <div style={s.inner}>
        {groups == null ? <div style={s.empty}>Loading your groups…</div>
          : groups.length === 0 ? <div style={s.empty}>Your groups show up here after your first trip.</div>
            : (
              <>
                {groups.length > 1 && (
                  <div style={g.pickerWrap}>
                    <GroupPicker groups={groups} value={groupId} onChange={id => { onPick(id); setTab('history') }} allowCreate={false} />
                  </div>
                )}
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
                        {tab === 'history' && <HistoryTab d={stats} />}
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

