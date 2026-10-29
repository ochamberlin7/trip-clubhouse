import { teamColor, colorIndexOf, getTeamDisplayName } from '../lib/teamColors'
import { roundCourseName } from '../lib/scoring'
import { fmtPoints, roundCell, dayLabel, leadLine } from '../lib/leaderboardView'

// Ryder Cup–style Leaderboard: solid team-coloured blocks side by side with each
// team's total (one row, however many teams — fixed team order), a lead line, then
// each round:
//   • 2 teams  → one row per round: red score · course name · blue score
//   • 3–4 teams → a light strip "Day N · Course" with every team's score lined up
//                 under its own block
// Numbers come from teamStandings (shared); wording from leaderboardView.js.
// `standings` null = still loading (blocks show a dot, rounds a dash).
const SERIF = "'Playfair Display', Georgia, serif"

const sb = {
  blocks: { display: 'grid', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-card)' },
  block: { color: '#fff', textAlign: 'center', padding: '14px 4px 12px', minWidth: 0 },
  blockName: { fontSize: 10, fontWeight: 700, letterSpacing: '1.4px', textTransform: 'uppercase', opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 4px' },
  blockNum: { fontFamily: SERIF, fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: 'lining-nums', marginTop: 2 },
  lead: { textAlign: 'center', fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--muted)', margin: '10px 0' },
  rounds: { background: 'var(--bg1)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-card)' },
  row2: { display: 'grid', gridTemplateColumns: '1fr 2.2fr 1fr', alignItems: 'center', textAlign: 'center', padding: '11px 8px' },
  course: { fontSize: 13, fontWeight: 600, color: 'var(--cream2)', lineHeight: 1.3 },
  score: { fontSize: 16, fontWeight: 800 },
  strip: { background: '#EEF2F7', color: '#1B3F6E', fontSize: 11.5, fontWeight: 700, padding: '5px 12px' },
  rowN: { display: 'grid', textAlign: 'center', padding: '8px 0' },
  line: { borderTop: '1px solid var(--bg2)' },
  empty: { padding: 16, textAlign: 'center', color: 'var(--muted)', fontStyle: 'italic', fontSize: 13 },
}

export default function TeamScoreboard({ trip, teams, rounds, standings, format }) {
  const n = Math.max(1, teams.length)
  const cols = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }
  const numSize = n <= 2 ? 46 : n === 3 ? 38 : 32
  const solid = t => teamColor(colorIndexOf(t)).solid
  const cell = (t, r) => (standings ? roundCell(format, standings.perRound.get(t.id)?.get(r.id)) : '—')
  const two = teams.length === 2

  return (
    <div>
      <div style={{ ...sb.blocks, ...cols }}>
        {teams.map(t => (
          <div key={t.id} style={{ ...sb.block, background: solid(t) }}>
            <div style={sb.blockName}>{getTeamDisplayName(t)}</div>
            <div style={{ ...sb.blockNum, fontSize: numSize }}>{standings ? fmtPoints(standings.total.get(t.id) ?? 0) : '·'}</div>
          </div>
        ))}
      </div>

      <div style={sb.lead}>{standings ? leadLine({ format, teams, standings, rounds }) : ' '}</div>

      <div style={sb.rounds}>
        {rounds.length === 0 && <div style={sb.empty}>No rounds yet</div>}
        {rounds.map((r, i) => {
          const day = dayLabel(r, trip?.start_date)
          const name = roundCourseName(r) || r.course_name || 'Round'
          if (two) {
            return (
              <div key={r.id} style={{ ...sb.row2, ...(i ? sb.line : null) }}>
                <span style={{ ...sb.score, color: solid(teams[0]) }}>{cell(teams[0], r)}</span>
                <span style={sb.course}>{name}</span>
                <span style={{ ...sb.score, color: solid(teams[1]) }}>{cell(teams[1], r)}</span>
              </div>
            )
          }
          return (
            <div key={r.id}>
              <div style={sb.strip}>{[day, name].filter(Boolean).join(' · ')}</div>
              <div style={{ ...sb.rowN, ...cols }}>
                {teams.map(t => <span key={t.id} style={{ ...sb.score, color: solid(t) }}>{cell(t, r)}</span>)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
