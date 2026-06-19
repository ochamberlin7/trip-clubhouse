import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Fuse from 'fuse.js'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useGroup } from '../context/GroupContext'

// Invite link handler: /join/:inviteToken
// Flow: require auth → look up the trip by invite_token → match the signed-in user
// to a guest-list slot via a cascading chain (email → phone → fuzzy name), claim it,
// and enter the trip as a player. No match → a "contact your commissioner" screen.
// It never routes a new user into the onboarding wizard.

const norm = s => (s || '').toLowerCase().trim()
const digitsOf = s => (s || '').replace(/\D/g, '')
const nameOf = p => [p.first_name, p.last_name].filter(Boolean).join(' ') || p.guest_name || ''

export default function JoinTrip() {
  const { inviteToken } = useParams()
  const { user, loading: authLoading } = useAuth()
  const { fetchUserGroups, selectGroup } = useGroup()
  const navigate = useNavigate()

  const [status, setStatus] = useState('loading') // loading | claiming | confirm | nomatch | error
  const [trip, setTrip] = useState(null)
  const [error, setError] = useState(null)
  const [candidate, setCandidate] = useState(null)     // { slotId, name } for the fuzzy-match confirm screen
  const [commissioner, setCommissioner] = useState(null) // { name, email } for the no-match screen

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      // Preserve the invite so a brand-new user can sign up and return here.
      navigate(`/login?redirect=/join/${inviteToken}`, { replace: true })
      return
    }
    let cancelled = false
    ;(async () => {
      // STEP 1 — look up the trip by its invite token.
      const { data: tripRow } = await supabase
        .from('trips').select('*').eq('invite_token', inviteToken).maybeSingle()
      if (cancelled) return
      if (!tripRow) { setError('This invite link is invalid.'); setStatus('error'); return }
      setTrip(tripRow)

      // trip_players.user_id (and group_members.user_id) FK to public.profiles.
      // A brand-new signup may not have a profiles row yet, so claiming would
      // violate trip_players_user_id_fkey. Ensure the profile exists first.
      await ensureProfile()
      if (cancelled) return

      // Load the FULL guest list via a SECURITY DEFINER RPC (gated on the invite
      // token) so phone / fuzzy-name matching can see every slot — RLS otherwise
      // limits a not-yet-member to their own email-matching row. Falls back to a
      // direct read (email-match still works) if the RPC isn't deployed yet.
      const players = await loadGuestList(tripRow)
      if (cancelled) return

      // Already a member of this trip → straight to the dashboard.
      if (players.some(p => p.claimed_user_id === user.id)) {
        await enterDashboard(tripRow)
        return
      }

      // STEP 1 — email match (normalize both sides: lowercase + trim).
      const myEmail = norm(user.email)
      const byEmail = players.find(p => !p.is_claimed && p.email && norm(p.email) === myEmail)
      if (byEmail) { await claimSlot(byEmail.id, tripRow); return }

      // STEP 2 — phone match (strip non-digits; compare last 10 to ignore country
      // codes). Phone is specific enough to auto-claim without confirmation.
      const myPhone = digitsOf(user.user_metadata?.phone)
      if (myPhone.length >= 10) {
        const byPhone = players.find(p => {
          const d = digitsOf(p.phone)
          return !p.is_claimed && d.length >= 10 && d.slice(-10) === myPhone.slice(-10)
        })
        if (byPhone) { await claimSlot(byPhone.id, tripRow); return }
      }

      // STEP 3 — fuzzy name match against the unclaimed slots. A hit needs the
      // user to confirm it's them (names aren't unique enough to auto-claim).
      const myName = (user.user_metadata?.display_name || '').trim()
      const unclaimed = players
        .filter(p => !p.is_claimed)
        .map(p => ({ id: p.id, name: nameOf(p) }))
        .filter(x => x.name)
      if (myName && unclaimed.length) {
        const fuse = new Fuse(unclaimed, { keys: ['name'], threshold: 0.3, includeScore: true })
        const hit = fuse.search(myName)[0]
        if (hit) {
          if (cancelled) return
          setCandidate({ slotId: hit.item.id, name: hit.item.name })
          setStatus('confirm')
          return
        }
      }

      // STEP 4 — no match. Show the commissioner-contact screen.
      if (cancelled) return
      await showNoMatch(tripRow)
    })()
    return () => { cancelled = true }
  }, [user, authLoading, inviteToken]) // eslint-disable-line react-hooks/exhaustive-deps

  // Make sure this user's public.profiles row exists before any write that FKs to
  // it (trip_players.user_id, group_members.user_id). ignoreDuplicates so an
  // existing user's profile is never overwritten. Stores phone alongside the name.
  async function ensureProfile() {
    const displayName =
      user.user_metadata?.display_name?.trim() || (user.email || '').split('@')[0] || 'Player'
    const phone = user.user_metadata?.phone?.trim() || null
    await supabase
      .from('profiles')
      .upsert({ id: user.id, display_name: displayName, phone }, { onConflict: 'id', ignoreDuplicates: true })
  }

  async function loadGuestList(tripRow) {
    const { data, error: rpcErr } = await supabase.rpc('invite_guest_list', { p_invite_token: inviteToken })
    if (!rpcErr && Array.isArray(data)) return data
    // RPC not available — fall back to a direct read (RLS exposes the user's own
    // email-matching / claimed rows, so the email-match path still works).
    const { data: fb } = await supabase
      .from('trip_players')
      .select('id, email, phone, first_name, last_name, guest_name, is_claimed, claimed_user_id')
      .eq('trip_id', tripRow.id)
    return fb || []
  }

  async function showNoMatch(tripRow) {
    const { data } = await supabase.rpc('invite_commissioner', { p_invite_token: inviteToken })
    const c = Array.isArray(data) ? data[0] : data
    setCommissioner(c && (c.display_name || c.email) ? { name: c.display_name, email: c.email } : null)
    setTrip(tripRow)
    setStatus('nomatch')
  }

  // Ensure a group_members row exists (as a player — never admin/commissioner),
  // activate the group, then go to the dashboard.
  async function enterDashboard(tripRow) {
    const { data: existing } = await supabase
      .from('group_members').select('group_id, role')
      .eq('group_id', tripRow.group_id).eq('user_id', user.id).maybeSingle()
    if (!existing) {
      // role 'player' — the group_members check constraint only allows 'admin'/'player'.
      await supabase.from('group_members').insert({ group_id: tripRow.group_id, user_id: user.id, role: 'player' })
    }
    const { data: group } = await supabase.from('groups').select('id, name').eq('id', tripRow.group_id).maybeSingle()
    await fetchUserGroups()
    // ALWAYS activate the invited group by its known id (so TripDashboard loads
    // THIS trip, not a different one, and never bounces to /groups → wizard).
    const role = existing?.role || 'player'
    selectGroup({ id: tripRow.group_id, name: group?.name || 'Trip', role })
    navigate('/dashboard', { replace: true })
  }

  // Claim a guest slot via the SECURITY DEFINER RPC (so phone / name-matched users,
  // whose email isn't the slot's email, can claim too). Falls back to a direct
  // self-claim if the RPC isn't deployed (email-match path).
  async function claimSlot(slotId, tripRow) {
    setStatus('claiming')
    let { error: claimErr } = await supabase.rpc('claim_invite_slot', {
      p_invite_token: inviteToken, p_slot_id: slotId,
    })
    if (claimErr && /does not exist|schema cache|could not find|function/i.test(claimErr.message || '')) {
      claimErr = (await supabase.from('trip_players').update({
        is_claimed: true, claimed_user_id: user.id, user_id: user.id,
      }).eq('id', slotId)).error
    }
    if (claimErr) { setError(claimErr.message); setStatus('error'); return }
    await enterDashboard(tripRow)
  }

  // ── styles ──
  const sh = {
    page: { minHeight: '100vh', background: '#F0F4F8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
    card: { background: '#fff', borderRadius: 16, padding: '28px 24px', maxWidth: 440, width: '100%', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', textAlign: 'center' },
    eyebrow: { fontSize: 11, textTransform: 'uppercase', letterSpacing: '2px', color: '#1B3F6E', fontWeight: 600, marginBottom: 6 },
    tripName: { fontSize: 18, fontWeight: 700, color: '#0D1B2A', marginBottom: 10 },
    prompt: { fontSize: 16, color: '#0D1B2A', lineHeight: 1.5, marginBottom: 4 },
    matchName: { fontWeight: 800, color: '#1B3F6E' },
    error: { fontSize: 15, color: '#C0392B', lineHeight: 1.5 },
    body: { fontSize: 15, color: '#2C3E50', lineHeight: 1.5 },
    contact: { fontSize: 15, color: '#1B3F6E', fontWeight: 700, marginTop: 8 },
    loading: { fontSize: 14, color: '#7A8FA6', padding: '20px 0' },
    btn: { width: '100%', padding: 15, borderRadius: 10, border: 'none', background: '#1B3F6E', color: '#fff', fontSize: 16, fontWeight: 800, marginTop: 16, cursor: 'pointer', fontFamily: 'inherit' },
    btnGhost: { width: '100%', padding: 15, borderRadius: 10, border: '2px solid #DDE3EA', background: '#fff', color: '#1B3F6E', fontSize: 16, fontWeight: 700, marginTop: 10, cursor: 'pointer', fontFamily: 'inherit' },
  }

  if (status === 'confirm' && candidate) {
    return (
      <div style={sh.page}>
        <div style={sh.card}>
          <div style={sh.eyebrow}>Trip Clubhouse</div>
          {trip?.name && <div style={sh.tripName}>{trip.name}</div>}
          <div style={sh.prompt}>
            We found <span style={sh.matchName}>{candidate.name}</span> on the guest list — is that you?
          </div>
          <button style={sh.btn} onClick={() => claimSlot(candidate.slotId, trip)}>
            Yes, that&rsquo;s me
          </button>
          <button style={sh.btnGhost} onClick={() => { setCandidate(null); showNoMatch(trip) }}>
            No, that&rsquo;s not me
          </button>
        </div>
      </div>
    )
  }

  if (status === 'nomatch') {
    return (
      <div style={sh.page}>
        <div style={sh.card}>
          <div style={sh.eyebrow}>Trip Clubhouse</div>
          {trip?.name && <div style={sh.tripName}>{trip.name}</div>}
          <div style={sh.body}>
            We couldn&rsquo;t find you on the guest list for {trip?.name || 'this trip'}.
          </div>
          <div style={sh.body}>
            {commissioner
              ? <>Contact your trip commissioner{commissioner.name ? <>, <span style={sh.matchName}>{commissioner.name}</span></> : ''}
                {commissioner.email ? <> (<a href={`mailto:${commissioner.email}`} style={{ color: '#1B3F6E' }}>{commissioner.email}</a>)</> : ''}, to get added.</>
              : <>Contact your trip commissioner to get added with this email.</>}
          </div>
          <button style={sh.btn} onClick={() => navigate('/login', { replace: true })}>Back to sign in</button>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div style={sh.page}>
        <div style={sh.card}>
          <div style={sh.eyebrow}>Trip Clubhouse</div>
          {trip?.name && <div style={sh.tripName}>{trip.name}</div>}
          <div style={sh.error}>{error}</div>
          <button style={sh.btn} onClick={() => navigate('/login', { replace: true })}>Back to sign in</button>
        </div>
      </div>
    )
  }

  // loading | claiming
  return (
    <div style={sh.page}>
      <div style={sh.card}>
        <div style={sh.eyebrow}>Trip Clubhouse</div>
        <div style={sh.loading}>{status === 'claiming' ? 'Joining the trip…' : 'Loading…'}</div>
      </div>
    </div>
  )
}
