import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useGroup } from '../../context/GroupContext'
import CourseSearchInput from '../../components/CourseSearchInput'
import { BONUS_GAMES } from '../../lib/bonusGames'
import { WIZARD_CHOICES } from '../../lib/gameFormats'
import { formatPhone } from '../../lib/formatPhone'

// ── helpers ──────────────────────────────────────────────────────

function getDaysInRange(start, end) {
  const days = []
  const cur = new Date(start + 'T00:00:00')
  const last = new Date(end + 'T00:00:00')
  while (cur <= last) {
    days.push(cur.toISOString().split('T')[0])
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

function formatDay(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric'
  })
}

// "Thursday, Nov 12" — the schedule's serif day heading.
function formatDayLong(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric'
  })
}

function uid() {
  return Math.random().toString(36).slice(2)
}

// Supported team counts: 2 (default), 3, or 4 — only those that divide the players
// into equal teams.
function getValidTeamCounts(n) {
  const counts = []
  for (let i = 2; i <= Math.min(4, Math.floor(n / 2)); i++) {
    if (n % i === 0) counts.push(i)
  }
  return counts
}

// ── Step 0: Trip Details ──────────────────────────────────────────
// Change 1: groupName field added as first field
// Change 4: date changes use parent-supplied handlers that guard schedule state

// ── Range calendar (no external dependency) ───────────────────────
const CAL_DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const CAL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
// Local YYYY-MM-DD (never UTC, so the calendar day matches what the user tapped).
function isoOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function parseIso(s) { return s ? new Date(s + 'T00:00:00') : null }
function fmtShort(s) { return parseIso(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }

// Editorial style (matches the rest of the wizard): hairline frame, serif month,
// small-caps weekdays, square day cells.
const cal = {
  wrap: { border: '1px solid #D5D9DF', borderRadius: 3, padding: '12px 10px', background: '#fff' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #E3E1DA' },
  nav: { width: 34, height: 34, border: 'none', background: 'none', fontSize: 22, lineHeight: 1, color: '#1B3F6E', cursor: 'pointer', fontFamily: 'inherit' },
  monthLabel: { fontFamily: 'var(--font-serif)', fontSize: 18, color: '#0D1B2A' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center' },
  dow: { fontSize: 10, fontWeight: 700, letterSpacing: '1.4px', color: '#8C97A6', padding: '4px 0 6px' },
  day: { border: 'none', background: 'none', borderRadius: 2, padding: '9px 0', fontSize: 14, fontWeight: 500, color: '#0D1B2A', cursor: 'pointer', fontFamily: 'inherit' },
  inrange: { background: 'rgba(27,63,110,0.10)', borderRadius: 0 },
  endpoint: { background: '#1B3F6E', color: '#fff', fontWeight: 700 },
}

function RangeCalendar({ startDate, endDate, onSelect }) {
  const [view, setView] = useState(() => {
    const base = parseIso(startDate) || new Date()
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })
  const year = view.getFullYear()
  const month = view.getMonth()
  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div style={cal.wrap}>
      <div style={cal.header}>
        <button type="button" style={cal.nav} onClick={() => setView(new Date(year, month - 1, 1))} aria-label="Previous month">‹</button>
        <span style={cal.monthLabel}>{CAL_MONTHS[month]} {year}</span>
        <button type="button" style={cal.nav} onClick={() => setView(new Date(year, month + 1, 1))} aria-label="Next month">›</button>
      </div>
      <div style={cal.grid}>
        {CAL_DOW.map((d, i) => <span key={`h${i}`} style={cal.dow}>{d}</span>)}
        {cells.map((d, i) => {
          if (d == null) return <span key={i} />
          const iso = isoOf(new Date(year, month, d))
          const isEndpoint = iso === startDate || iso === endDate
          const inRange = startDate && endDate && iso > startDate && iso < endDate
          return (
            <button
              type="button"
              key={i}
              onClick={() => onSelect(iso)}
              style={{ ...cal.day, ...(inRange ? cal.inrange : null), ...(isEndpoint ? cal.endpoint : null) }}
            >
              {d}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function StepTripDetails({
  groupName, setGroupName,
  tripName, setTripName,
  startDate, endDate, onRangeChange,
  onNext,
}) {
  const [error, setError] = useState('')

  // Single-interaction range selection: 1st click = start (clears any end), 2nd
  // click = end if it's on/after start, else it becomes a new start. A complete
  // range stays visible; clicking again begins a new range.
  function handleDateClick(iso) {
    if (!startDate || (startDate && endDate)) { onRangeChange(iso, ''); return }
    if (iso < startDate) { onRangeChange(iso, ''); return }
    onRangeChange(startDate, iso)
  }

  const rangeText = startDate
    ? (endDate ? `${fmtShort(startDate)} – ${fmtShort(endDate)}` : `${fmtShort(startDate)} – select end date`)
    : 'Tap a date to set your trip start'

  function handleNext() {
    // Group name is pre-filled with a default and stays editable, so it's no
    // longer required here — a cleared field falls back to the default on submit.
    if (!tripName.trim()) { setError('Trip name is required.'); return }
    if (!startDate) { setError('Start date is required.'); return }
    if (!endDate) { setError('End date is required.'); return }
    // Allow a one-day trip (end === start); only reject an end strictly before start.
    if (endDate < startDate) { setError('End date cannot be before start date.'); return }
    setError('')
    onNext()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <p className="wz-intro">Name your group and trip, then pick your dates.</p>
      {/* Change 1: "Name Your Crew" — first field, drives groups.name */}
      <div>
        <label className="wz-label">What do you call your group?</label>
        <input
          type="text"
          placeholder="The Boys, CTI Crew, etc."
          value={groupName}
          onChange={e => setGroupName(e.target.value)}
          autoFocus
        />
      </div>
      <div>
        <label className="wz-label">Trip name</label>
        <input
          className="wizard-field"
          type="text"
          placeholder="e.g. Northern Michigan 2026"
          value={tripName}
          onChange={e => setTripName(e.target.value)}
        />
      </div>
      <div>
        <label className="wz-label">Trip dates</label>
        <RangeCalendar startDate={startDate} endDate={endDate} onSelect={handleDateClick} />
        <div style={{ marginTop: 10, fontFamily: 'var(--font-serif)', fontSize: 18, color: startDate && endDate ? '#0D1B2A' : '#8C97A6' }}>
          {rangeText}
        </div>
      </div>
      {error && <p className="error-msg">{error}</p>}
      <button className="btn btn-primary" onClick={handleNext}>
        Next →
      </button>
    </div>
  )
}

// ── Step 1: Day-by-Day Schedule ───────────────────────────────────
// Change 3: max 2 rounds/day; confirm dialog if zero golf rounds on advance

const MAX_ROUNDS_PER_DAY = 2

function StepSchedule({ schedule, setSchedule, onBack, onNext }) {
  function setDayType(idx, type) {
    const updated = schedule.map((d, i) => {
      if (i !== idx) return d
      const rounds = type === 'golf' && d.rounds.length === 0
        ? [{ id: uid(), courseName: '' }]
        : type !== 'golf' ? [] : d.rounds
      return { ...d, type, rounds }
    })
    setSchedule(updated)
  }

  function updateCourseName(dayIdx, roundIdx, name) {
    setSchedule(schedule.map((d, i) => {
      if (i !== dayIdx) return d
      return {
        ...d,
        rounds: d.rounds.map((r, j) => j === roundIdx ? { ...r, courseName: name } : r),
      }
    }))
  }

  // Store the full selected course (or null when cleared) on the round.
  function setRoundCourse(dayIdx, roundIdx, courseData) {
    setSchedule(schedule.map((d, i) => {
      if (i !== dayIdx) return d
      return {
        ...d,
        rounds: d.rounds.map((r, j) => {
          if (j !== roundIdx) return r
          return {
            ...r,
            course: courseData,
            courseName: courseData ? (courseData.club_name || courseData.course_name || r.courseName) : r.courseName,
          }
        }),
      }
    }))
  }

  function addRound(dayIdx) {
    setSchedule(schedule.map((d, i) => {
      if (i !== dayIdx) return d
      if (d.rounds.length >= MAX_ROUNDS_PER_DAY) return d
      return { ...d, rounds: [...d.rounds, { id: uid(), courseName: '' }] }
    }))
  }

  function removeRound(dayIdx, roundId) {
    setSchedule(schedule.map((d, i) => {
      if (i !== dayIdx) return d
      const rounds = d.rounds.filter(r => r.id !== roundId)
      return { ...d, rounds, type: rounds.length === 0 ? 'unknown' : d.type }
    }))
  }

  function handleNext() {
    const totalGolfRounds = schedule.reduce((sum, d) => sum + (d.type === 'golf' ? d.rounds.length : 0), 0)
    if (totalGolfRounds === 0) {
      const ok = window.confirm('No golf rounds scheduled — are you sure you want to continue?')
      if (!ok) return
    }
    onNext()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <p className="wz-intro">Add your golf rounds. Not sure yet? Leave a day as Unknown and fill it in later.</p>
      <div>
      <p className="wz-label wz-label-ruled">Your days</p>
      {schedule.map((day, idx) => (
        <div key={day.date} className="wz-day">
          <div className="wz-day-head">
            <span className="wz-day-name"><small>Day {idx + 1}</small>{formatDayLong(day.date)}</span>
            <select
              aria-label={`What's happening ${formatDay(day.date)}`}
              value={day.type === 'golf' ? 'golf' : day.type}
              onChange={e => setDayType(idx, e.target.value)}
            >
              <option value="unknown">Unknown</option>
              <option value="golf">Golf</option>
              <option value="travel">Travel day</option>
              <option value="non_golf">Non-golf day</option>
            </select>
          </div>

          {day.type === 'golf' && (
            <div className="wz-rounds">
              {day.rounds.map((round, rIdx) => (
                <div key={round.id} className="round-input-row" style={{ alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {round.course ? (
                      // Course chosen → show it and collapse the picker. "Change" reopens it.
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #D5D9DF', borderRadius: 3, padding: '10px 12px' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: '#0D1B2A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {round.course.club_name || round.course.course_name}
                          </div>
                          <div style={{ fontSize: 12, color: '#7A8FA6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {[round.course.tee_name && `${round.course.tee_name} tees`, round.course.location].filter(Boolean).join(' · ') || 'Course selected'}
                          </div>
                        </div>
                        <button
                          onClick={() => setRoundCourse(idx, rIdx, null)}
                          style={{ flexShrink: 0, background: 'none', border: 'none', color: '#1B3F6E', fontSize: 10.5, fontWeight: 700, letterSpacing: '1.4px', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit' }}
                        >Change</button>
                      </div>
                    ) : (
                      <>
                        <CourseSearchInput
                          placeholder={`Search course${day.rounds.length > 1 ? ` (Round ${rIdx + 1})` : ''}...`}
                          initialValue={round.courseName}
                          onQueryChange={text => updateCourseName(idx, rIdx, text)}
                          onCourseSelected={data => setRoundCourse(idx, rIdx, data)}
                        />
                        <p className="wz-hint">Can’t find it? You can add the course by hand later.</p>
                      </>
                    )}
                  </div>
                  <button
                    className="wz-x"
                    style={{ marginTop: 10 }}
                    onClick={() => removeRound(idx, round.id)}
                    aria-label="Remove round"
                  >
                    ×
                  </button>
                </div>
              ))}
              {/* Change 3: hide button once 2 rounds added */}
              {day.rounds.length < MAX_ROUNDS_PER_DAY && (
                <button className="wz-link" style={{ paddingTop: 0 }} onClick={() => addRound(idx)}>
                  + Add another round
                </button>
              )}
            </div>
          )}
        </div>
      ))}
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <button className="btn btn-outline" onClick={onBack}>← Back</button>
        <button className="btn btn-primary" onClick={handleNext}>Next →</button>
      </div>
    </div>
  )
}

// ── Step 2: Add Players ───────────────────────────────────────────

const MAX_PLAYERS = 20

// Look comes from the wizard's shared input style (index.css, .wizard-page input).
const playerInputStyle = { width: '100%' }
const playerInputErr = { ...playerInputStyle, borderColor: '#C0392B' }

function StepAddPlayers({ players, setPlayers, onBack, onNext }) {
  const [showErrors, setShowErrors] = useState(false)

  function update(id, field, value) {
    setPlayers(players.map(p => p.id === id ? { ...p, [field]: value } : p))
  }
  function addRow() {
    if (players.length >= MAX_PLAYERS) return
    setPlayers([...players, { id: uid(), first_name: '', last_name: '', email: '', phone: '' }])
  }
  function removeRow(id) {
    setPlayers(players.filter(p => p.id !== id))
  }
  function handleNext() {
    const valid = players.every(p => p.first_name.trim() && p.last_name.trim())
    if (!valid) { setShowErrors(true); return }
    onNext()
  }

  // Editorial style: each player is a small-caps ruled label, then their fields —
  // no boxed cards.
  const fieldsStyle = { display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 12 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <p className="wz-intro">Add everyone who’s coming on the trip.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {players.map((p, idx) => {
          const fErr = showErrors && !p.first_name.trim()
          const lErr = showErrors && !p.last_name.trim()
          return (
            <div key={p.id}>
              {/* Ruled label: "PLAYER N", a YOU tag for the commissioner, and the
                  remove × (everyone but the commissioner) at the right. */}
              <div className="wz-label wz-label-ruled">
                <span>Player {idx + 1}</span>
                {p.isCommissioner && <span className="wz-you">You</span>}
                {!p.isCommissioner && (
                  <button className="wz-x" onClick={() => removeRow(p.id)} aria-label="Remove player">×</button>
                )}
              </div>
              <div style={fieldsStyle}>
              {/* First + Last on one row */}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  style={{ ...(fErr ? playerInputErr : playerInputStyle), flex: 1, minWidth: 0 }}
                  placeholder="First name"
                  value={p.first_name}
                  onChange={e => update(p.id, 'first_name', e.target.value)}
                />
                <input
                  style={{ ...(lErr ? playerInputErr : playerInputStyle), flex: 1, minWidth: 0 }}
                  placeholder="Last name"
                  value={p.last_name}
                  onChange={e => update(p.id, 'last_name', e.target.value)}
                />
              </div>

              {/* Email full width */}
              <input
                style={playerInputStyle}
                placeholder="Email (optional)"
                value={p.email}
                onChange={e => update(p.id, 'email', e.target.value)}
              />

              {/* Phone full width — optional; enables phone matching on invite.
                  Store raw digits, display formatted (invite matching normalizes
                  digits on both sides, so the stored format doesn't matter). */}
              <input
                style={playerInputStyle}
                type="tel"
                placeholder="Phone (optional)"
                value={formatPhone(p.phone ?? '')}
                onChange={e => update(p.id, 'phone', e.target.value.replace(/\D/g, ''))}
              />
              </div>
            </div>
          )
        })}
      </div>

      {players.length < MAX_PLAYERS && (
        <button className="wz-add-row" style={{ borderTop: '1px solid #E3E1DA' }} onClick={addRow}>
          Add a player<span style={{ marginLeft: 'auto', color: '#1B3F6E', fontSize: 20, lineHeight: 1 }}>+</span>
        </button>
      )}

      {showErrors && <p className="error-msg">First and last name are required for every player.</p>}

      <div style={{ display: 'flex', gap: 12 }}>
        <button className="btn btn-outline" onClick={onBack}>← Back</button>
        <button className="btn btn-primary" onClick={handleNext}>Next →</button>
      </div>
    </div>
  )
}

// ── Step 3: Tournament Setup ──────────────────────────────────────

// Editorial "1A" layout (picked 2026-10-29): serif format names on hairline rows,
// small-caps group labels, a squared segmented control for teams. One list of
// radio rows replaces the old Yes/No question — "No tournament" is its own row.
const T = {
  NAVY: '#1B3F6E',
  // Section headings (Teams / Individual / No tournament): bold navy small caps
  // over a 2px navy rule, so the three groups read clearly apart.
  group: { fontSize: 12.5, fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#1B3F6E', margin: '0 0 6px' },
  list: { borderTop: '2px solid #1B3F6E' },
  // Field labels inside a section (e.g. Number of teams) stay light grey.
  fieldLabel: { fontSize: 10.5, fontWeight: 700, letterSpacing: '1.8px', textTransform: 'uppercase', color: '#8C97A6', margin: '0 0 10px' },
  row: { display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid #E3E1DA', padding: '14px 2px', cursor: 'pointer', fontFamily: 'inherit' },
  name: { display: 'block', fontFamily: "var(--font-serif)", fontSize: 18, color: '#0D1B2A', lineHeight: 1.2 },
  desc: { display: 'block', fontSize: 13, color: '#7C8796', marginTop: 3, lineHeight: 1.4 },
  radio: on => ({ flexShrink: 0, marginLeft: 'auto', width: 16, height: 16, borderRadius: '50%', boxSizing: 'border-box', border: on ? '5px solid #1B3F6E' : '1.5px solid #9AA6B5' }),
  seg: { display: 'flex', border: '1px solid #1B3F6E', borderRadius: 4, overflow: 'hidden' },
  segBtn: (on, first) => ({ flex: 1, padding: '10px 0', background: on ? '#1B3F6E' : 'transparent', color: on ? '#fff' : '#1B3F6E', border: 'none', borderLeft: first ? 'none' : '1px solid #1B3F6E', fontSize: 14, fontWeight: 600, letterSpacing: '0.3px', cursor: 'pointer', fontFamily: 'inherit' }),
  note: { fontSize: 13, color: '#7C8796', margin: 0, lineHeight: 1.45 },
  check: on => ({ flexShrink: 0, width: 16, height: 16, borderRadius: 2, marginTop: 3, boxSizing: 'border-box', border: `1.5px solid ${on ? '#1B3F6E' : '#9AA6B5'}`, background: on ? '#1B3F6E' : 'transparent', color: '#fff', fontSize: 11, lineHeight: '13px', textAlign: 'center' }),
}
const TEAM_WORD = { 2: 'Two', 3: 'Three', 4: 'Four' }

function FormatRow({ name, desc, on, onClick }) {
  return (
    <button type="button" role="radio" aria-checked={on} style={T.row} onClick={onClick}>
      <span style={{ minWidth: 0 }}>
        <span style={T.name}>{name}</span>
        <span style={T.desc}>{desc}</span>
      </span>
      <span style={T.radio(on)} />
    </button>
  )
}

function StepTournament({ playerCount, hasTournament, setHasTournament, numTeams, setNumTeams, tournamentFormat, setTournamentFormat, bonusGames, setBonusGames, onBack, onFinish, loading, submitError }) {
  const validCounts = getValidTeamCounts(playerCount)
  // Create Trip is available once a choice is made — when there aren't enough
  // players for teams yet, they can be assigned later.
  const canFinish = hasTournament !== null
  const [bonusOpen, setBonusOpen] = useState(false)
  const toggleBonus = id =>
    setBonusGames(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))

  // A team choice keeps (or restores) a team count; an individual choice means no teams.
  function pickFormat(c) {
    setHasTournament(true)
    setTournamentFormat(c.format)
    if (c.teams) { if (numTeams === 0) setNumTeams(validCounts[0] ?? 2) }
    else { setNumTeams(0); setBonusGames([]) }
  }
  function pickNone() {
    setHasTournament(false); setNumTeams(2); setBonusGames([])
  }
  const isOn = c => hasTournament === true && tournamentFormat === c.format && (c.teams ? numTeams !== 0 : numTeams === 0)
  const withTeams = hasTournament === true && numTeams !== 0
  const group = (label, choices) => (
    <div>
      <p style={T.group}>{label}</p>
      <div style={T.list} role="radiogroup" aria-label={label}>
        {choices.map(c => <FormatRow key={c.key} name={c.name} desc={c.desc} on={isOn(c)} onClick={() => pickFormat(c)} />)}
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
      {group('Teams', WIZARD_CHOICES.filter(c => c.teams))}
      {group('Individual', WIZARD_CHOICES.filter(c => !c.teams))}
      <div>
        <p style={T.group}>No tournament</p>
        <div style={T.list} role="radiogroup" aria-label="No tournament">
          <FormatRow name="Just for fun" desc="Scores and stats only — no standings." on={hasTournament === false} onClick={pickNone} />
        </div>
      </div>

      {withTeams && (
        <div>
          <p style={T.fieldLabel}>
            Number of teams <span style={{ letterSpacing: '1px', fontWeight: 500 }}>· {playerCount} player{playerCount !== 1 ? 's' : ''}</span>
          </p>
          {validCounts.length > 0 ? (
            <div style={T.seg} role="radiogroup" aria-label="Number of teams">
              {validCounts.map((n, i) => (
                <button key={n} type="button" role="radio" aria-checked={numTeams === n} style={T.segBtn(numTeams === n, i === 0)}
                  onClick={() => setNumTeams(n)}>{TEAM_WORD[n] || n}</button>
              ))}
            </div>
          ) : (
            <p style={T.note}>You can assign teams later in Commissioner Tools once more players join.</p>
          )}
        </div>
      )}

      {/* Bonus games — optional trip-long team games, chosen once here (no way to
          change after the trip is created). Hidden without teams. Data-driven from BONUS_GAMES. */}
      {withTeams && (
        <div>
          <button
            type="button"
            onClick={() => setBonusOpen(o => !o)}
            aria-expanded={bonusOpen}
            style={{ ...T.row, borderTop: '1px solid #E3E1DA', padding: '12px 2px' }}
          >
            <span style={{ ...T.name, fontSize: 16 }}>Add a bonus game{bonusGames.length ? ` (${bonusGames.length})` : ''}</span>
            <span style={{ marginLeft: 'auto', color: '#9AA6B5', fontSize: 18, transform: bonusOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>›</span>
          </button>
          {bonusOpen && BONUS_GAMES.map(g => {
            const on = bonusGames.includes(g.id)
            return (
              <button key={g.id} type="button" role="checkbox" aria-checked={on} onClick={() => toggleBonus(g.id)}
                style={{ ...T.row, alignItems: 'flex-start' }}>
                <span style={T.check(on)}>{on ? '✓' : ''}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ ...T.name, fontSize: 16 }}>{g.name}</span>
                  <span style={T.desc}>{g.blurb}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}

      {submitError && <p className="error-msg">{submitError}</p>}

      <div style={{ display: 'flex', gap: 12 }}>
        <button className="btn btn-outline" onClick={onBack} disabled={loading}>← Back</button>
        <button
          className="btn btn-primary"
          onClick={onFinish}
          disabled={loading || !canFinish}
        >
          {loading ? 'Creating trip…' : 'Create Trip'}
        </button>
      </div>
    </div>
  )
}

// ── Main Wizard ───────────────────────────────────────────────────

const STEP_TITLES = ['Create a Trip', 'Day Schedule', 'Add Players', 'Set Up a Tournament']

export default function TripWizard() {
  const { user } = useAuth()
  const { fetchUserGroups, switchTrip } = useGroup()
  const navigate = useNavigate()

  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  // Multi-trip: users may create additional trips, so the wizard is never blocked.
  const [checking] = useState(false)

  // Step 0
  const [groupName, setGroupName] = useState('')   // Change 1
  const [defaultGroupName, setDefaultGroupName] = useState('')  // "{Last Name} Group", seeded from profile
  const [tripName, setTripName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Step 1
  const [schedule, setSchedule] = useState([])

  // Step 2 — player entry rows (row 1 = commissioner, prefilled & locked)
  const [players, setPlayers] = useState([])
  const playerCount = players.length

  // Step 3
  const [hasTournament, setHasTournament] = useState(null)
  const [numTeams, setNumTeams] = useState(2) // 2 teams is the default
  const [tournamentFormat, setTournamentFormat] = useState('standard_match_play') // default (pre-selected)
  const [bonusGames, setBonusGames] = useState([]) // enabled bonus-game ids (one-time, set-up only)

  // Seed the player list: commissioner (locked, from profile) + one blank row.
  useEffect(() => {
    if (!user || players.length > 0) return
    let cancelled = false
    ;(async () => {
      // profiles.phone comes from migration 20260639; if it hasn't been applied the
      // select errors on the missing column, so retry name-only rather than losing
      // the display-name prefill (phone then falls back to auth metadata below).
      let { data, error } = await supabase.from('profiles').select('display_name, phone').eq('id', user.id).maybeSingle()
      if (error) { ({ data } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle()) }
      if (cancelled) return
      // Prefer the profile's display name, then the auth metadata's (set at signup
      // with the full "First Last" — reliable even before the profile row syncs),
      // and only fall back to the email prefix if neither exists. Using the email
      // is what made the default group name read "{email} Group" instead of the
      // last name, since an email prefix has no space to split a surname from.
      const dn = (data?.display_name || user.user_metadata?.display_name || user.email.split('@')[0]).trim()
      // Prefill the commissioner's phone from their account (profiles.phone, with
      // auth metadata as a fallback — the two mirror each other, see ProfilePage).
      const myPhone = data?.phone || user.user_metadata?.phone || ''
      const parts = dn.split(/\s+/)
      const lastName = parts.slice(1).join(' ') || parts[0] || dn
      // Pre-fill the group name with "{Last Name} Group"; keep it editable and
      // reuse it as the fallback if the field is cleared before submitting.
      const defaultName = `${lastName} Group`.trim()
      setDefaultGroupName(defaultName)
      setGroupName(prev => (prev.trim() ? prev : defaultName))
      setPlayers([
        { id: 'me', isCommissioner: true, first_name: parts[0] || dn, last_name: parts.slice(1).join(' '), email: user.email, phone: myPhone },
        { id: uid(), first_name: '', last_name: '', email: '', phone: '' },
      ])
    })()
    return () => { cancelled = true }
  }, [user])

  // Change 4: guard date changes — confirm+clear schedule if already built. The
  // range calendar sets both dates through here (start-only mid-selection has
  // nextEnd = '').
  function handleRangeChange(nextStart, nextEnd) {
    const changed = nextStart !== startDate || nextEnd !== endDate
    if (schedule.length > 0 && changed) {
      if (!window.confirm('Changing the dates will reset your schedule. Continue?')) return
      setSchedule([])
    }
    setStartDate(nextStart)
    setEndDate(nextEnd)
  }

  function goToStep1() {
    const days = getDaysInRange(startDate, endDate)
    // Default each day to "Unknown" — the schedule can be filled in later.
    setSchedule(days.map(date => ({ date, type: 'unknown', rounds: [] })))
    setStep(1)
  }

  async function handleFinish() {
    setLoading(true)
    setSubmitError(null)

    try {
      // 1. Create group using groupName (Change 1)
      const { data: group, error: groupErr } = await supabase
        .from('groups')
        .insert({ name: groupName.trim() || defaultGroupName, created_by: user.id })
        .select()
        .single()
      if (groupErr) throw groupErr

      // 2. Add user as admin
      const { error: memberErr } = await supabase
        .from('group_members')
        .insert({ group_id: group.id, user_id: user.id, role: 'admin' })
      if (memberErr) throw memberErr

      // 3. Create trip
      const tripPayload = {
        group_id: group.id,
        name: tripName.trim(),
        format: hasTournament ? tournamentFormat : 'stroke_play',
        team_mode: !!hasTournament,
        // Bonus games are team games — only kept when a tournament (teams) exists.
        // One-time choice: there's no way to change this after the trip is created.
        bonus_games: hasTournament && numTeams ? bonusGames : [],
        created_by: user.id,
        status: 'active',
        start_date: startDate,
        end_date: endDate,
      }
      let { data: trip, error: tripErr } = await supabase.from('trips').insert(tripPayload).select().single()
      // The bonus_games column exists only after migration 20260661. If it hasn't
      // been applied yet, retry without it so trip creation still works (bonus
      // games just can't be enabled until the migration runs).
      if (tripErr && /bonus_games/i.test(tripErr.message || '')) {
        const { bonus_games, ...rest } = tripPayload // eslint-disable-line no-unused-vars
        ;({ data: trip, error: tripErr } = await supabase.from('trips').insert(rest).select().single())
      }
      if (tripErr) throw tripErr

      // Persist each day's type so the Courses page can show every day in the
      // range (golf days come from the rounds table; the rest from here). Done as
      // a separate, non-fatal update so trip creation still works if the
      // trips.schedule column hasn't been added yet.
      await supabase.from('trips')
        .update({ schedule: schedule.map(d => ({ date: d.date, type: d.type })) })
        .eq('id', trip.id)
        .then(({ error }) => { if (error) console.warn('[TripWizard] schedule not saved:', error.message) })

      // 4. Create rounds from golf days
      const roundRows = []
      let roundNum = 1
      for (const day of schedule) {
        if (day.type === 'golf') {
          for (const r of day.rounds) {
            const c = r.course
            roundRows.push({
              trip_id: trip.id,
              round_number: roundNum++,
              course_name: (c?.course_name || c?.club_name || r.courseName || '').trim() || 'TBD',
              club_name: c?.club_name ?? null,
              golfcourse_id: c?.golfcourse_id ?? null,
              tee_name: c?.tee_name ?? null,
              course_rating: c?.course_rating ?? null,
              slope_rating: c?.slope_rating ?? null,
              holes: c?.holes ?? null,
              location_city: c?.location_city ?? null,
              location_state: c?.location_state ?? null,
              location_lat: c?.location_lat ?? null,
              location_lon: c?.location_lon ?? null,
              par_total: c?.par_total ?? null,
              number_of_holes: c?.number_of_holes ?? null,
              tees: c?.tees ?? null,
              // Tournament set up → rounds default to 'tournament'; otherwise
              // 'none' ("not decided yet"). Commissioner refines per-round later.
              round_type: hasTournament ? 'tournament' : 'none',
              date: day.date,
              status: 'upcoming',
            })
          }
        }
      }
      if (roundRows.length > 0) {
        const { error: roundErr } = await supabase.from('rounds').insert(roundRows)
        if (roundErr) throw roundErr
      }

      // 5. Create trip_players from the entered players. The commissioner's
      //    row is linked to their account (claimed); the rest are unclaimed.
      const playerRows = players.map(p => {
        const first = p.first_name.trim()
        const last = p.last_name.trim()
        const fullName = `${first} ${last}`.trim()
        if (p.isCommissioner) {
          return {
            trip_id: trip.id,
            user_id: user.id,
            claimed_user_id: user.id,
            is_claimed: true,
            first_name: first,
            last_name: last,
            // Save the edited email; fall back to the account email if cleared.
            email: p.email.trim() || user.email,
            phone: p.phone?.trim() || null,
            handicap_index: null,
          }
        }
        return {
          trip_id: trip.id,
          user_id: null,
          is_claimed: false,
          first_name: first,
          last_name: last,
          email: p.email.trim() || null,
          phone: p.phone?.trim() || null, // enables invite phone-matching for this guest
          guest_name: fullName || null, // compatibility for legacy name displays
          handicap_index: null,
        }
      })
      const { error: playersErr } = await supabase.from('trip_players').insert(playerRows)
      if (playersErr) throw playersErr

      // 6. Create teams if tournament. Rows exist from creation; names start null
      //    (computed as "Team N" until the commissioner names them). color_index is
      //    fixed to team_index.
      if (hasTournament && numTeams) {
        const teamRows = Array.from({ length: numTeams }, (_, i) => ({
          trip_id: trip.id,
          name: null,
          team_index: i + 1,
          color_index: i + 1,
        }))
        const { error: teamsErr } = await supabase.from('teams').insert(teamRows)
        if (teamsErr) throw teamsErr
      }

      // 7. Reload trips and switch to the newly-created one (user is its commissioner).
      await fetchUserGroups()
      switchTrip(trip.id)
      navigate('/dashboard', { replace: true })

    } catch (err) {
      setSubmitError(err?.message || 'An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  if (checking) return <div className="loading-screen">Loading…</div>

  const progressPct = ((step + 1) / STEP_TITLES.length) * 100

  return (
    <div className="wizard-page">
      <div className="wizard-header">
        <div className="wizard-header-top">
          <div>
            <p className="wizard-brand">Trip Clubhouse</p>
            <p className="wizard-title">{STEP_TITLES[step]}</p>
          </div>
          <span className="wizard-step-indicator">{step + 1} / {STEP_TITLES.length}</span>
        </div>
        <div className="wizard-progress-track">
          <div className="wizard-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <div className="wizard-body">
        {step === 0 && (
          <StepTripDetails
            groupName={groupName} setGroupName={setGroupName}
            tripName={tripName} setTripName={setTripName}
            startDate={startDate} endDate={endDate} onRangeChange={handleRangeChange}
            onNext={goToStep1}
          />
        )}

        {step === 1 && (
          <StepSchedule
            schedule={schedule}
            setSchedule={setSchedule}
            onBack={() => setStep(0)}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <StepAddPlayers
            players={players}
            setPlayers={setPlayers}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}

        {step === 3 && (
          <StepTournament
            playerCount={playerCount}
            hasTournament={hasTournament} setHasTournament={setHasTournament}
            numTeams={numTeams} setNumTeams={setNumTeams}
            tournamentFormat={tournamentFormat} setTournamentFormat={setTournamentFormat}
            bonusGames={bonusGames} setBonusGames={setBonusGames}
            onBack={() => setStep(2)}
            onFinish={handleFinish}
            loading={loading}
            submitError={submitError}
          />
        )}
      </div>
    </div>
  )
}
