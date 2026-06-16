import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useGroup } from '../../context/GroupContext'
import CourseSearchInput from '../../components/CourseSearchInput'

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

function StepTripDetails({
  groupName, setGroupName,
  tripName, setTripName,
  startDate, onStartDateChange,
  endDate, onEndDateChange,
  onNext,
}) {
  const [error, setError] = useState('')

  function handleNext() {
    if (!groupName.trim()) { setError('Group name is required.'); return }
    if (!tripName.trim()) { setError('Trip name is required.'); return }
    if (!startDate) { setError('Start date is required.'); return }
    if (!endDate) { setError('End date is required.'); return }
    if (endDate <= startDate) { setError('End date must be after start date.'); return }
    setError('')
    onNext()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Change 1: "Name Your Crew" — first field, drives groups.name */}
      <div>
        <label className="field-label">What do you call your group?</label>
        <input
          type="text"
          placeholder="The Boys, CTI Crew, etc."
          value={groupName}
          onChange={e => setGroupName(e.target.value)}
          autoFocus
        />
      </div>
      <div>
        <label className="field-label">Trip Name</label>
        <input
          type="text"
          placeholder="e.g. Northern Michigan 2026"
          value={tripName}
          onChange={e => setTripName(e.target.value)}
        />
      </div>
      <div>
        <label className="field-label">Start Date</label>
        <input
          type="date"
          value={startDate}
          onChange={e => onStartDateChange(e.target.value)}
        />
      </div>
      <div>
        <label className="field-label">End Date</label>
        <input
          type="date"
          value={endDate}
          onChange={e => onEndDateChange(e.target.value)}
          min={startDate}
        />
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p className="wizard-step-subtitle" style={{ marginTop: 0 }}>
        Do you know your schedule yet? If so, enter it here. If not, you can leave days as Unknown and fill them in later.
      </p>
      {schedule.map((day, idx) => (
        <div key={day.date} className="schedule-day">
          <div className="schedule-day-header">
            <span className="schedule-day-label">{formatDay(day.date)}</span>
            <select
              value={day.type === 'golf' ? 'golf' : day.type}
              onChange={e => setDayType(idx, e.target.value)}
            >
              <option value="unknown">Unknown</option>
              <option value="non_golf">Non-Golf Day</option>
              <option value="travel">Travel Day</option>
              <option value="golf">Add Golf Round</option>
            </select>
          </div>

          {day.type === 'golf' && (
            <div className="round-inputs">
              {day.rounds.map((round, rIdx) => (
                <div key={round.id} className="round-input-row" style={{ alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {round.course ? (
                      // Course chosen → show it and collapse the picker. "Change" reopens it.
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, background: '#F5F8FA', border: '1px solid #DDE3EA', borderRadius: 8, padding: '10px 12px' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: '#0D1B2A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {round.course.club_name || round.course.course_name}
                          </div>
                          <div style={{ fontSize: 12, color: '#7A8FA6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {[round.course.tee_name && `${round.course.tee_name} tees`, round.course.location].filter(Boolean).join(' · ') || 'Course selected'}
                          </div>
                        </div>
                        <button
                          onClick={() => setRoundCourse(idx, rIdx, null)}
                          style={{ flexShrink: 0, background: 'none', border: 'none', color: '#1B3F6E', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                        >Change</button>
                      </div>
                    ) : (
                      <CourseSearchInput
                        placeholder={`Search course${day.rounds.length > 1 ? ` (Round ${rIdx + 1})` : ''}...`}
                        initialValue={round.courseName}
                        onQueryChange={text => updateCourseName(idx, rIdx, text)}
                        onCourseSelected={data => setRoundCourse(idx, rIdx, data)}
                      />
                    )}
                  </div>
                  <button
                    className="btn-remove-round"
                    onClick={() => removeRound(idx, round.id)}
                    aria-label="Remove round"
                  >
                    ×
                  </button>
                </div>
              ))}
              {/* Change 3: hide button once 2 rounds added */}
              {day.rounds.length < MAX_ROUNDS_PER_DAY && (
                <button className="btn-add-round" onClick={() => addRound(idx)}>
                  + Add Another Round
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <button className="btn btn-outline" onClick={onBack}>← Back</button>
        <button className="btn btn-primary" onClick={handleNext}>Next →</button>
      </div>
    </div>
  )
}

// ── Step 2: Add Players ───────────────────────────────────────────

const MAX_PLAYERS = 20

const playerInputStyle = { background: '#F5F8FA', border: '1px solid #DDE3EA', borderRadius: 8, padding: '10px 12px', fontSize: 14, width: '100%', fontFamily: 'inherit', color: '#0D1B2A' }
const playerInputErr = { ...playerInputStyle, borderColor: '#C0392B' }

function StepAddPlayers({ players, setPlayers, onBack, onNext }) {
  const [showErrors, setShowErrors] = useState(false)

  function update(id, field, value) {
    setPlayers(players.map(p => p.id === id ? { ...p, [field]: value } : p))
  }
  function addRow() {
    if (players.length >= MAX_PLAYERS) return
    setPlayers([...players, { id: uid(), first_name: '', last_name: '', email: '' }])
  }
  function removeRow(id) {
    setPlayers(players.filter(p => p.id !== id))
  }
  function handleNext() {
    const valid = players.every(p => p.first_name.trim() && p.last_name.trim())
    if (!valid) { setShowErrors(true); return }
    onNext()
  }

  const cardStyle = { position: 'relative', background: '#fff', border: '1px solid #DDE3EA', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }
  const playerLabelStyle = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#7A8FA6' }
  const labelRowStyle = { display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 6px 2px' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <p className="wizard-step-subtitle" style={{ marginTop: 0 }}>Add everyone who's coming on the trip</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {players.map((p, idx) => {
          const fErr = showErrors && !p.first_name.trim()
          const lErr = showErrors && !p.last_name.trim()
          return (
            <div key={p.id}>
              {/* Label row: "PLAYER N" with the YOU pill beside it for the commissioner */}
              <div style={labelRowStyle}>
                <span style={playerLabelStyle}>Player {idx + 1}</span>
                {p.isCommissioner && <span className="you-badge">YOU</span>}
              </div>
              <div style={cardStyle}>
              {/* Remove button (non-commissioner only), top-right corner */}
              {!p.isCommissioner && (
                <button
                  onClick={() => removeRow(p.id)}
                  aria-label="Remove player"
                  style={{ position: 'absolute', top: 6, right: 6, width: 30, height: 30, background: 'transparent', border: 'none', color: '#7A8FA6', fontSize: 20, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit' }}
                >×</button>
              )}

              {/* First + Last on one row (clear of the remove control when present) */}
              <div style={{ display: 'flex', gap: 8, paddingRight: p.isCommissioner ? 0 : 30 }}>
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
              </div>
            </div>
          )
        })}
      </div>

      {players.length < MAX_PLAYERS && (
        <button
          onClick={addRow}
          style={{ background: 'transparent', border: '1px dashed #DDE3EA', borderRadius: 8, padding: 12, width: '100%', color: '#7A8FA6', fontSize: 14, fontWeight: 600, textAlign: 'center', cursor: 'pointer', fontFamily: 'inherit' }}
        >+ Add Player</button>
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

function StepTournament({ playerCount, hasTournament, setHasTournament, numTeams, setNumTeams, onBack, onFinish, loading, submitError }) {
  const validCounts = getValidTeamCounts(playerCount)
  // Create Trip is always available once a tournament choice is made — when there
  // aren't enough players for teams yet, they can be assigned later.
  const canFinish = hasTournament !== null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <p className="tournament-question">Set up a tournament?</p>
        <div className="yes-no-row">
          <button
            className={`yes-no-btn ${hasTournament === true ? 'selected' : ''}`}
            onClick={() => setHasTournament(true)}
          >
            Yes
          </button>
          <button
            className={`yes-no-btn ${hasTournament === false ? 'selected' : ''}`}
            onClick={() => { setHasTournament(false); setNumTeams(2) }}
          >
            No
          </button>
        </div>
      </div>

      {hasTournament === true && (
        <>
          <div>
            <p className="field-label" style={{ marginBottom: 10 }}>Tournament Format</p>
            <span className="format-tag">⛳ Match Play</span>
          </div>

          {validCounts.length > 0 ? (
            <div>
              <p className="field-label" style={{ marginBottom: 10 }}>
                Number of Teams
                <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: 6 }}>
                  ({playerCount} player{playerCount !== 1 ? 's' : ''})
                </span>
              </p>
              <div className="team-count-options">
                {validCounts.map(n => (
                  <button
                    key={n}
                    className={`team-count-btn ${numTeams === n ? 'selected' : ''}`}
                    onClick={() => setNumTeams(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p style={{ fontSize: 13, color: '#7A8FA6', margin: 0 }}>
              You can assign teams later in Commissioner Tools once more players join.
            </p>
          )}
        </>
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

const STEP_TITLES = ['Create a Trip', 'Day Schedule', 'Add Players', 'Tournament']

export default function TripWizard() {
  const { user } = useAuth()
  const { fetchUserGroups, selectGroup } = useGroup()
  const navigate = useNavigate()

  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  // Change 5: checking for existing trip on mount
  const [checking, setChecking] = useState(true)

  // Step 0
  const [groupName, setGroupName] = useState('')   // Change 1
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

  // Change 5: block wizard if user already has an active trip
  useEffect(() => {
    if (!user) return
    async function checkExistingTrip() {
      try {
        const { data: memberships } = await supabase
          .from('group_members')
          .select('group_id')
          .eq('user_id', user.id)
          .eq('role', 'admin')

        if (memberships && memberships.length > 0) {
          const groupIds = memberships.map(m => m.group_id)
          const { data: trips } = await supabase
            .from('trips')
            .select('id')
            .in('group_id', groupIds)
            .eq('status', 'active')
            .limit(1)

          if (trips && trips.length > 0) {
            navigate('/dashboard', { replace: true, state: { singleTripWarning: true } })
            return
          }
        }
      } catch (_) {
        // If check fails, let wizard proceed
      }
      setChecking(false)
    }
    checkExistingTrip()
  }, [user])

  // Seed the player list: commissioner (locked, from profile) + one blank row.
  useEffect(() => {
    if (!user || players.length > 0) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
      if (cancelled) return
      const dn = (data?.display_name || user.email.split('@')[0]).trim()
      const parts = dn.split(/\s+/)
      setPlayers([
        { id: 'me', isCommissioner: true, first_name: parts[0] || dn, last_name: parts.slice(1).join(' '), email: user.email },
        { id: uid(), first_name: '', last_name: '', email: '' },
      ])
    })()
    return () => { cancelled = true }
  }, [user])

  // Change 4: guard date changes — confirm+clear schedule if already built
  function handleStartDateChange(val) {
    if (schedule.length > 0 && val !== startDate) {
      if (!window.confirm('Changing the dates will reset your schedule. Continue?')) return
      setSchedule([])
    }
    setStartDate(val)
  }

  function handleEndDateChange(val) {
    if (schedule.length > 0 && val !== endDate) {
      if (!window.confirm('Changing the dates will reset your schedule. Continue?')) return
      setSchedule([])
    }
    setEndDate(val)
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
        .insert({ name: groupName.trim(), created_by: user.id })
        .select()
        .single()
      if (groupErr) throw groupErr

      // 2. Add user as admin
      const { error: memberErr } = await supabase
        .from('group_members')
        .insert({ group_id: group.id, user_id: user.id, role: 'admin' })
      if (memberErr) throw memberErr

      // 3. Create trip
      const { data: trip, error: tripErr } = await supabase
        .from('trips')
        .insert({
          group_id: group.id,
          name: tripName.trim(),
          format: hasTournament ? 'match_play' : 'stroke_play',
          team_mode: !!hasTournament,
          created_by: user.id,
          status: 'active',
          start_date: startDate,
          end_date: endDate,
        })
        .select()
        .single()
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

      // 7. Set active group and navigate
      await fetchUserGroups()
      selectGroup({ ...group, role: 'admin' })
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
            startDate={startDate} onStartDateChange={handleStartDateChange}
            endDate={endDate} onEndDateChange={handleEndDateChange}
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
