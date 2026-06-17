import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useGroup } from '../context/GroupContext'

// Invite link handler: /join/:inviteToken
// Flow: require auth → look up the trip by invite_token → if the signed-in user's
// email is on the guest list (an unclaimed trip_players row), claim that slot and
// enter the trip as a MEMBER. No email match → "not on the guest list" message —
// it never routes a new user into the onboarding wizard.

export default function JoinTrip() {
  // VERY TOP — before any hook/guard. Confirms the /join route actually mounts
  // JoinTrip (vs being intercepted upstream by a redirect).
  console.log('[JoinTrip] MOUNTED at', typeof window !== 'undefined' ? window.location.pathname : '(ssr)')

  const { inviteToken } = useParams()
  const { user, loading: authLoading } = useAuth()
  const { fetchUserGroups, selectGroup } = useGroup()
  const navigate = useNavigate()

  const [status, setStatus] = useState('loading') // loading | claiming | error
  const [trip, setTrip] = useState(null)
  const [error, setError] = useState(null)

  // Confirms JoinTrip actually mounts after the signup/login redirect.
  console.log('[JoinTrip] render — token:', inviteToken, '| authLoading:', authLoading, '| user:', user?.id || null)

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
      // A brand-new signup may not have a profiles row yet (the signup trigger
      // may not have fired / may not exist), so claiming would violate
      // trip_players_user_id_fkey. Ensure the profile exists first (idempotent).
      await ensureProfile()
      if (cancelled) return

      // Load the trip's players (guest list) — scoped to THIS trip only.
      const { data: playersData, error: playersErr } = await supabase
        .from('trip_players')
        .select('id, email, is_claimed, claimed_user_id')
        .eq('trip_id', tripRow.id)
      if (cancelled) return
      const players = playersData || []

      // Diagnostics: surface the auth email vs. every guest-list email so any
      // mismatch (case / whitespace) or an empty result (RLS) is visible.
      console.log('[JoinTrip] auth user.id =', user.id, 'user.email =', JSON.stringify(user.email))
      console.log('[JoinTrip] trip', tripRow.id, '— trip_players rows:', players.length,
        players.map(p => ({ id: p.id, email: p.email, is_claimed: p.is_claimed })))
      if (playersErr) console.log('[JoinTrip] trip_players query error:', playersErr.message)

      // STEP 2 — already a member of this trip → straight to the dashboard.
      if (players.some(p => p.claimed_user_id === user.id)) {
        await enterDashboard(tripRow)
        return
      }

      // STEP 3 — email auto-match: an unclaimed slot whose email is this user's.
      // Normalize BOTH sides (lowercase + trim) — Supabase Auth emails are
      // lowercased; stored emails may have mixed case or whitespace.
      const myEmail = (user.email || '').toLowerCase().trim()
      const match = players.find(p => !p.is_claimed && p.email && p.email.toLowerCase().trim() === myEmail)
      if (match) {
        await claimSlot(match.id, tripRow)
        return
      }

      // STEP 4 — not on the guest list. Show a message; do NOT route to onboarding.
      if (cancelled) return
      setError(`This invite is tied to a guest list, and ${user.email} isn't on it. Ask your trip commissioner to add you with this email, then open the link again.`)
      setStatus('error')
    })()
    return () => { cancelled = true }
  }, [user, authLoading, inviteToken])

  // Make sure this user's public.profiles row exists before any write that FKs to
  // it (trip_players.user_id, group_members.user_id). ignoreDuplicates so an
  // existing user's profile is never overwritten; the profiles_insert RLS policy
  // (auth.uid() = id) allows a user to create their own row.
  async function ensureProfile() {
    const displayName =
      user.user_metadata?.display_name?.trim() || (user.email || '').split('@')[0] || 'Player'
    const { error: profErr } = await supabase
      .from('profiles')
      .upsert({ id: user.id, display_name: displayName }, { onConflict: 'id', ignoreDuplicates: true })
    if (profErr) console.log('[JoinTrip] ensureProfile error:', profErr.message)
  }

  // Ensure a group_members row exists (as a MEMBER — never admin/commissioner),
  // activate the group, then go to the dashboard.
  async function enterDashboard(tripRow) {
    const { data: existing } = await supabase
      .from('group_members').select('group_id, role')
      .eq('group_id', tripRow.group_id).eq('user_id', user.id).maybeSingle()
    if (!existing) {
      // group_id MUST come from the looked-up trip (not stale/hardcoded).
      const payload = { group_id: tripRow.group_id, user_id: user.id, role: 'member' }
      console.log('[JoinTrip] group_members INSERT payload:', payload)
      const { error: memberErr } = await supabase.from('group_members').insert(payload)
      if (memberErr) console.log('[JoinTrip] group_members INSERT ERROR:', memberErr.message)
    }
    // Read membership back. 0 rows + no insert error ⇒ RLS write block.
    const { data: myMemberships, error: readErr } = await supabase
      .from('group_members').select('group_id, role').eq('user_id', user.id)
    console.log('[JoinTrip] group_members readback for', user.id, '→', myMemberships, readErr ? `(err: ${readErr.message})` : '')

    const { data: group } = await supabase.from('groups').select('id, name').eq('id', tripRow.group_id).maybeSingle()
    await fetchUserGroups()
    // ALWAYS activate the invited group by its known id (so TripDashboard loads
    // THIS trip, not a different one, and never bounces to /groups → wizard).
    const role = existing?.role || myMemberships?.find(m => m.group_id === tripRow.group_id)?.role || 'member'
    selectGroup({ id: tripRow.group_id, name: group?.name || 'Trip', role })
    console.log('[JoinTrip] entering dashboard — group:', tripRow.group_id, 'role:', role, 'groupRead:', !!group)
    navigate('/dashboard', { replace: true })
  }

  async function claimSlot(slotId, tripRow) {
    setStatus('claiming')
    const payload = { is_claimed: true, claimed_user_id: user.id, user_id: user.id }
    console.log('[JoinTrip] claiming slot', slotId, 'payload:', payload)
    const { error: claimErr } = await supabase.from('trip_players').update(payload).eq('id', slotId)
    if (claimErr) { console.log('[JoinTrip] claim error:', claimErr.message); setError(claimErr.message); setStatus('error'); return }
    await enterDashboard(tripRow)
  }

  // ── styles ──
  const sh = {
    page: { minHeight: '100vh', background: '#F0F4F8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
    card: { background: '#fff', borderRadius: 16, padding: '28px 24px', maxWidth: 440, width: '100%', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', textAlign: 'center' },
    eyebrow: { fontSize: 11, textTransform: 'uppercase', letterSpacing: '2px', color: '#1B3F6E', fontWeight: 600, marginBottom: 6 },
    tripName: { fontSize: 18, fontWeight: 700, color: '#0D1B2A', marginBottom: 10 },
    error: { fontSize: 15, color: '#C0392B', lineHeight: 1.5 },
    loading: { fontSize: 14, color: '#7A8FA6', padding: '20px 0' },
    btn: { width: '100%', padding: 15, borderRadius: 10, border: 'none', background: '#1B3F6E', color: '#fff', fontSize: 16, fontWeight: 800, marginTop: 16, cursor: 'pointer', fontFamily: 'inherit' },
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
