import { useEffect, useRef, useState } from 'react'
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

      // Matching chain runs against the UNCLAIMED slots only.
      const unclaimedSlots = players.filter(p => !p.is_claimed)

      // TIER 1 — email match (normalize both sides: lowercase + trim). A slot with
      // a null/empty email is skipped gracefully (the `p.email &&` guard short-
      // circuits before norm), so it never throws and the chain continues to phone.
      const myEmail = norm(user.email)
      const byEmail = unclaimedSlots.find(p => p.email && norm(p.email) === myEmail)
      if (byEmail) { await claimSlot(byEmail.id, tripRow); return }
      const anyEmailOnFile = unclaimedSlots.some(p => p.email && p.email.trim())
      const eResult = anyEmailOnFile ? '1' : '0' // '✓' unreachable here (would have claimed)

      // TIER 2 — phone match. Strip ALL non-digits on BOTH sides, then compare the
      // last 10 digits (ignores country codes). Auto-claims — phone is specific.
      const myPhone = digitsOf(user.user_metadata?.phone)
      const slotPhones = unclaimedSlots.map(p => digitsOf(p.phone))
      console.log('[JoinTrip] phone match — normalized user phone:', myPhone,
        '| normalized slot phones:', slotPhones)
      const byPhone = myPhone.length >= 10
        ? unclaimedSlots.find(p => {
            const d = digitsOf(p.phone)
            return d.length >= 10 && d.slice(-10) === myPhone.slice(-10)
          })
        : null
      if (byPhone) { await claimSlot(byPhone.id, tripRow); return }
      const anyPhoneOnFile = slotPhones.some(d => d.length > 0)
      const pResult = anyPhoneOnFile ? '1' : '0'

      // TIER 3 — fuzzy name match against the unclaimed slots. A hit needs the user
      // to confirm it's them (names aren't unique enough to auto-claim).
      const myName = (user.user_metadata?.display_name || '').trim()
      const named = unclaimedSlots
        .map(p => ({ id: p.id, name: nameOf(p) }))
        .filter(x => x.name)
      let hit = null
      if (myName && named.length) {
        const fuse = new Fuse(named, { keys: ['name'], threshold: 0.3, includeScore: true })
        hit = fuse.search(myName)[0] || null
      }
      const nResult = hit ? '✓' : (named.length ? '1' : '0')

      // Record per-tier results for the diagnostic support code on the no-match
      // screen. Reachable ✓ only for name (email/phone auto-claim and return).
      matchDiagRef.current = { e: eResult, p: pResult, n: nResult }

      if (hit) {
        if (cancelled) return
        setCandidate({ slotId: hit.item.id, name: hit.item.name })
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

  async function loadGuestList(tripRow) {
    // Expose the invite token to Postgres so the trip_players SELECT policy's
    // invite-token clause lets us read EVERY slot for this trip — including
    // name-only players (no email, no phone) that no other clause can match.
    await supabase.rpc('set_config', { parameter: 'app.invite_token', value: inviteToken, is_local: false })

    const { data, error: rpcErr } = await supabase.rpc('invite_guest_list', { p_invite_token: inviteToken })
    if (!rpcErr && Array.isArray(data)) return data
    // RPC not available — fall back to a direct read. With the invite-token
    // session setting above, RLS exposes all of this trip's slots, so fuzzy name
    // matching can still run for name-only players.
    const { data: fb } = await supabase
      .from('trip_players')
      .select('id, email, phone, first_name, last_name, guest_name, is_claimed, claimed_user_id')
      .eq('trip_id', tripRow.id)
    return fb || []
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
    await enterDashboard(tripRow)
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
