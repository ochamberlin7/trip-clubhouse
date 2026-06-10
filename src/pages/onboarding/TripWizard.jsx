import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useGroup } from '../../context/GroupContext'

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

function getValidTeamCounts(n) {
  const counts = []
  for (let i = 2; i <= Math.floor(n / 2); i++) {
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
      return { ...d, rounds, type: rounds.length === 0 ? 'non_golf' : d.type }
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
      {schedule.map((day, idx) => (
        <div key={day.date} className="schedule-day">
          <div className="schedule-day-header">
            <span className="schedule-day-label">{formatDay(day.date)}</span>
            <select
              value={day.type === 'golf' ? 'golf' : day.type}
              onChange={e => setDayType(idx, e.target.value)}
            >
              <option value="non_golf">Non-Golf Day</option>
              <option value="travel">Travel Day</option>
              <option value="golf">Add Golf Round</option>
            </select>
          </div>

          {day.type === 'golf' && (
            <div className="round-inputs">
              {day.rounds.map((round, rIdx) => (
                <div key={round.id} className="round-input-row">
                  <input
                    type="text"
                    placeholder={`Course name${day.rounds.length > 1 ? ` (Round ${rIdx + 1})` : ''}`}
                    value={round.courseName}
                    onChange={e => updateCourseName(idx, rIdx, e.target.value)}
                  />
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

// ── Step 2: Player Count ──────────────────────────────────────────
// Change 2: counter only — no name entry, no player list

function StepPlayerCount({ playerCount, setPlayerCount, onBack, onNext }) {
  function decrement() { setPlayerCount(c => Math.max(2, c - 1)) }
  function increment() { setPlayerCount(c => Math.min(20, c + 1)) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <label className="field-label" style={{ fontSize: 16, marginBottom: 16, display: 'block' }}>
          How many players are in your group?
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <button
            className="btn btn-outline btn-auto"
            onClick={decrement}
            disabled={playerCount <= 2}
            style={{ width: 52, height: 52, fontSize: 24, padding: 0, borderRadius: 12 }}
          >
            −
          </button>
          <span style={{ fontSize: 48, fontWeight: 800, color: '#1a2b4a', minWidth: 60, textAlign: 'center' }}>
            {playerCount}
          </span>
          <button
            className="btn btn-outline btn-auto"
            onClick={increment}
            disabled={playerCount >= 20}
            style={{ width: 52, height: 52, fontSize: 24, padding: 0, borderRadius: 12 }}
          >
            +
          </button>
        </div>
        <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 12 }}>
          You're automatically included as Player 1. Min 2 · Max 20.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button className="btn btn-outline" onClick={onBack}>← Back</button>
        <button className="btn btn-primary" onClick={onNext}>Next →</button>
      </div>
    </div>
  )
}

// ── Step 3: Tournament Setup ──────────────────────────────────────

function StepTournament({ playerCount, hasTournament, setHasTournament, numTeams, setNumTeams, onBack, onFinish, loading, submitError }) {
  const validCounts = getValidTeamCounts(playerCount)
  const canFinish = hasTournament === false || (hasTournament === true && numTeams !== null)

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
            onClick={() => { setHasTournament(false); setNumTeams(null) }}
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

          <div>
            <p className="field-label" style={{ marginBottom: 10 }}>
              Number of Teams
              <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: 6 }}>
                ({playerCount} player{playerCount !== 1 ? 's' : ''})
              </span>
            </p>
            {validCounts.length === 0 ? (
              <p style={{ fontSize: 14, color: '#9ca3af' }}>
                Need at least 4 players for team options (2 teams of 2).
              </p>
            ) : (
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
            )}
          </div>
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

const STEP_TITLES = ['Create a Trip', 'Day Schedule', 'Player Count', 'Tournament']

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

  // Step 2 — Change 2: integer count instead of player array
  const [playerCount, setPlayerCount] = useState(2)

  // Step 3
  const [hasTournament, setHasTournament] = useState(null)
  const [numTeams, setNumTeams] = useState(null)

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
    setSchedule(days.map(date => ({ date, type: 'non_golf', rounds: [] })))
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

      // 4. Create rounds from golf days
      const roundRows = []
      let roundNum = 1
      for (const day of schedule) {
        if (day.type === 'golf') {
          for (const r of day.rounds) {
            roundRows.push({
              trip_id: trip.id,
              round_number: roundNum++,
              course_name: r.courseName.trim() || 'TBD',
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

      // 5. Create trip_players from count (Change 2)
      // Member 1 = the auth user; Members 2..N are anonymous placeholders
      const playerRows = Array.from({ length: playerCount }, (_, i) => ({
        trip_id: trip.id,
        user_id: i === 0 ? user.id : null,
        guest_name: i === 0 ? null : `Member ${i + 1}`,
        handicap_index: null,
      }))
      const { error: playersErr } = await supabase.from('trip_players').insert(playerRows)
      if (playersErr) throw playersErr

      // 6. Create teams if tournament
      if (hasTournament && numTeams) {
        const teamRows = Array.from({ length: numTeams }, (_, i) => ({
          trip_id: trip.id,
          name: `Team ${i + 1}`,
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
          <StepPlayerCount
            playerCount={playerCount}
            setPlayerCount={setPlayerCount}
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
