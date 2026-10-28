import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { matchInviteSlot } from '../lib/inviteMatch'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useGroup } from '../context/GroupContext'

// Invite link handler: /join/:inviteToken
// Flow: require auth → look up the trip by invite_token → match the signed-in user
// to a guest-list slot via a cascading chain (email → phone → fuzzy name), claim it,
// and enter the trip as a player. No match → a "contact your commissioner" screen.
// It never routes a new user into the onboarding wizard.


export default function JoinTrip() {
  const { inviteToken } = useParams()
  const { user, loading: authLoading } = useAuth()
  const { fetchUserGroups, switchTrip } = useGroup()
  const navigate = useNavigate()

  const [status, setStatus] = useState('loading') // loading | claiming | confirm | nomatch | error
  const [trip, setTrip] = useState(null)
  const [error, setError] = useState(null)
  const [candidate, setCandidate] = useState(null)     // { slotId, name } for the fuzzy-match confirm screen
  const [commissioner, setCommissioner] = useState(null) // { name, email } for the no-match screen
  const [supportCode, setSupportCode] = useState('')     // structured diagnostic for the no-match screen
  const matchDiagRef = useRef({ e: '0', p: '0', n: '0' }) // per-tier match result codes

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      // Preserve the invite so a brand-new user can sign up and return here.
      navigate(`/login?redirect=/join/${inviteToken}`, { replace: true })
      return
    }
    let cancelled = false
    ;(async () => {
      // STEP 1 — look up the trip by its invite token. Uses the token-gated
      // SECURITY DEFINER RPC (trips_select is scoped to group members, so a
      // not-yet-member invitee can't read the row directly). Falls back to a
      // direct select if the RPC isn't deployed yet (pre-migration).
      let tripRow = null
      const rpcRes = await supabase.rpc('trip_by_invite_token', { p_invite_token: inviteToken })
      if (Array.isArray(rpcRes.data)) tripRow = rpcRes.data[0] || null
      if (!tripRow && rpcRes.error && /does not exist|schema cache|could not find|function/i.test(rpcRes.error.message || '')) {
        const { data } = await supabase.from('trips').select('*').eq('invite_token', inviteToken).maybeSingle()
        tripRow = data || null
      }
      if (cancelled) return
      if (!tripRow) { setError('This invite link is invalid.'); setStatus('error'); return }
      setTrip(tripRow)

      // trip_players.user_id (and group_members.user_id) FK to public.profiles.
      // A brand-new signup may not have a profiles row yet, so claiming would
      // violate trip_players_user_id_fkey. Ensure the profile exists first.
      await ensureProfile()
      if (cancelled) return

      // Load the FULL guest list via the token-gated SECURITY DEFINER RPC so
      // email / phone / fuzzy-name matching can see every slot — including
      // name-only players that RLS would otherwise hide.
      const players = await loadGuestList()
      if (cancelled) return

      // Email → phone → exact name → fuzzy name, on unclaimed slots only
      // (shared rules in src/lib/inviteMatch.js).
      const match = matchInviteSlot({ user, players })
      if (match.kind === 'member') { await enterDashboard(tripRow); return }
      if (match.kind === 'claim') { await claimSlot(match.slotId, tripRow); return }

      // Record per-tier results for the diagnostic support code on the no-match screen.
      matchDiagRef.current = match.diag

      if (match.kind === 'confirm') {
        if (cancelled) return
        setCandidate({ slotId: match.slotId, name: match.name })
        setStatus('confirm')
        return
      }

      // No match anywhere — show the commissioner-contact screen.
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

  async function loadGuestList() {
    // Guest list is fetched EXCLUSIVELY via the token-gated SECURITY DEFINER RPC.
    // It bypasses RLS, so it returns every slot for this trip — including
    // name-only players (no email, no phone) like Chase McDonald. No session
    // variable, no fallback direct read (RLS can't see name-only slots).
    const { data } = await supabase.rpc('invite_guest_list', { p_invite_token: inviteToken })
    return Array.isArray(data) ? data : []
  }

  async function showNoMatch(tripRow) {
    // Structured diagnostic: E[email]-P[phone]-N[name]-[first 8 of trip UUID].
    const { e = '0', p = '0', n = '0' } = matchDiagRef.current || {}
    setSupportCode(`E${e}-P${p}-N${n}-${(tripRow.id || '').slice(0, 8)}`)
    const { data } = await supabase.rpc('invite_commissioner', { p_invite_token: inviteToken })
    const c = Array.isArray(data) ? data[0] : data
    setCommissioner(c && (c.display_name || c.email) ? { name: c.display_name, email: c.email } : null)
    setTrip(tripRow)
    setStatus('nomatch')
  }

  // "Back to sign in" must fully sign the user out first — otherwise navigating to
  // /login while still authenticated bounces them onward (to /groups → wizard).
  async function backToSignIn() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
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
    await fetchUserGroups()
    // ALWAYS activate the invited trip by its known id (so TripDashboard loads
    // THIS trip, not a different one, and never bounces to /groups → wizard).
    switchTrip(tripRow.id)
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
    await backfillContact(slotId)
    await enterDashboard(tripRow)
  }

  // After a successful claim, fill in the slot's email/phone from the signed-in
  // user — but only where the card is blank (never overwrite existing values, and
  // never touch first/last name). The player owns the row now (claimed_user_id),
  // so RLS allows the read + update.
  async function backfillContact(slotId) {
    const { data: row } = await supabase
      .from('trip_players').select('email, phone').eq('id', slotId).maybeSingle()
    const patch = {}
    const myEmail = (user.email || '').trim()
    const myPhone = (user.user_metadata?.phone || '').trim()
    if (!row?.email && myEmail) patch.email = myEmail
    if (!row?.phone && myPhone) patch.phone = myPhone
    if (Object.keys(patch).length) {
      await supabase.from('trip_players').update(patch).eq('id', slotId)
    }
  }

  // ── styles ──
  const sh = {
    page: { minHeight: '100vh', background: '#F0F4F8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
    card: { background: '#fff', borderRadius: 16, padding: '28px 24px', maxWidth: 440, width: '100%', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', textAlign: 'center' },
    eyebrow: { fontSize: 11, textTransform: 'uppercase', letterSpacing: '2px', color: '#1B3F6E', fontWeight: 600, marginBottom: 6 },
    eyebrowLg: { fontSize: 16, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#1B3F6E', fontWeight: 700, marginBottom: 8 },
    tripName: { fontSize: 18, fontWeight: 700, color: '#0D1B2A', marginBottom: 10 },
    prompt: { fontSize: 16, color: '#0D1B2A', lineHeight: 1.5, marginBottom: 4 },
    matchName: { fontWeight: 800, color: '#1B3F6E' },
    error: { fontSize: 15, color: '#C0392B', lineHeight: 1.5 },
    body: { fontSize: 15, color: '#2C3E50', lineHeight: 1.5 },
    contact: { fontSize: 15, color: '#1B3F6E', fontWeight: 700, marginTop: 8 },
    loading: { fontSize: 14, color: '#7A8FA6', padding: '20px 0' },
    code: { fontSize: 12, color: '#7A8FA6', marginTop: 14, fontFamily: 'ui-monospace, Menlo, monospace', letterSpacing: '0.5px' },
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
          <div style={sh.eyebrowLg}>Trip Clubhouse</div>
          <div style={sh.body}>
            We couldn&rsquo;t find you on the guest list for this trip.
          </div>
          <div style={sh.body}>
            {commissioner
              ? <>Contact your trip commissioner{commissioner.name ? <>, <span style={sh.matchName}>{commissioner.name}</span></> : ''}
                {commissioner.email ? <> (<a href={`mailto:${commissioner.email}`} style={{ color: '#1B3F6E' }}>{commissioner.email}</a>)</> : ''}, to confirm your information.</>
              : <>Contact your trip commissioner to confirm your information.</>}
          </div>
          {supportCode && <div style={sh.code}>Support code: {supportCode}</div>}
          <button style={sh.btn} onClick={backToSignIn}>Back to sign in</button>
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
          <button style={sh.btn} onClick={backToSignIn}>Back to sign in</button>
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
