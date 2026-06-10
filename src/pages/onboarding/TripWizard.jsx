import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useGroup } from '../../context/GroupContext'

const STEPS = ['Trip Details', 'Format', 'Rounds', 'Done']

export default function TripWizard() {
  const { user } = useAuth()
  const { activeGroup } = useGroup()
  const navigate = useNavigate()

  useEffect(() => {
    if (!activeGroup) navigate('/groups')
  }, [activeGroup])

  const [step, setStep] = useState(0)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const [tripName, setTripName] = useState('')
  const [format, setFormat] = useState('stroke_play')
  const [teamMode, setTeamMode] = useState(false)
  const [numRounds, setNumRounds] = useState(1)
  const [rounds, setRounds] = useState([{ course_name: '', date: '' }])

  function handleNumRoundsChange(n) {
    const count = parseInt(n)
    setNumRounds(count)
    const updated = Array.from({ length: count }, (_, i) =>
      rounds[i] || { course_name: '', date: '' }
    )
    setRounds(updated)
  }

  function updateRound(index, field, value) {
    const updated = [...rounds]
    updated[index] = { ...updated[index], [field]: value }
    setRounds(updated)
  }

  async function handleFinish() {
    setLoading(true)
    setError(null)

    try {
      const { data: trip, error: tripError } = await supabase
        .from('trips')
        .insert({
          group_id: activeGroup.id,
          name: tripName,
          format,
          team_mode: teamMode,
          created_by: user.id,
          status: 'active'
        })
        .select()
        .single()

      if (tripError) { setError(tripError.message); return }

      const roundRows = rounds.map((r, i) => ({
        trip_id: trip.id,
        round_number: i + 1,
        course_name: r.course_name,
        date: r.date,
        status: 'upcoming'
      }))

      const { error: roundError } = await supabase.from('rounds').insert(roundRows)
      if (roundError) { setError(roundError.message); return }

      navigate('/dashboard')
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-container">
      <h1>Trip Clubhouse</h1>
      <div className="wizard-steps">
        {STEPS.map((s, i) => (
          <span key={s} className={i === step ? 'active' : i < step ? 'done' : ''}>{s}</span>
        ))}
      </div>

      {step === 0 && (
        <div>
          <h2>Trip Details</h2>
          <input type="text" placeholder="Trip name (e.g. Northern Michigan 2026)"
            value={tripName} onChange={e => setTripName(e.target.value)} />
          <button onClick={() => setStep(1)} disabled={!tripName}>Next</button>
        </div>
      )}

      {step === 1 && (
        <div>
          <h2>Format</h2>
          <select value={format} onChange={e => setFormat(e.target.value)}>
            <option value="stroke_play">Stroke Play</option>
            <option value="match_play">Match Play</option>
            <option value="stableford">Stableford</option>
          </select>
          <label>
            <input type="checkbox" checked={teamMode}
              onChange={e => setTeamMode(e.target.checked)} />
            Team mode (players divided into teams)
          </label>
          <div className="wizard-nav">
            <button className="secondary" onClick={() => setStep(0)}>Back</button>
            <button onClick={() => setStep(2)}>Next</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <h2>Rounds</h2>
          <label>Number of rounds</label>
          <select value={numRounds} onChange={e => handleNumRoundsChange(e.target.value)}>
            {[1,2,3,4,5,6,7].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          {rounds.map((r, i) => (
            <div key={i} className="round-row">
              <p>Round {i + 1}</p>
              <input type="text" placeholder="Course name"
                value={r.course_name} onChange={e => updateRound(i, 'course_name', e.target.value)} />
              <input type="date" value={r.date}
                onChange={e => updateRound(i, 'date', e.target.value)} />
            </div>
          ))}
          {error && <p className="error">{error}</p>}
          <div className="wizard-nav">
            <button className="secondary" onClick={() => setStep(1)}>Back</button>
            <button onClick={handleFinish} disabled={loading}>
              {loading ? 'Creating trip...' : 'Create Trip'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
