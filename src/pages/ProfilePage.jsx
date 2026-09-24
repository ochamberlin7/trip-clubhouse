// The signed-in user's own account/profile — this edits the AUTH record
// (Supabase auth user + the shared `profiles` row), NOT any per-trip
// `trip_players` slot. Editing here does not touch a user's per-trip player
// rows across their trips.
//
// Flat disclosure rows on a plain background (matching Commissioner Tools): each
// field is its own tap-to-expand row with an inline Save; Sign Out is a plain red
// text action under a heavier divider.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { rowUI, Disclosure, SaveLink, Toggle } from '../components/DisclosureRow'
import { isPushSupported, pushPermission, enablePush, disablePush, hasActiveSubscription } from '../lib/push'

// Display-only phone formatting — matches Signup.jsx. Stored value is raw digits.
function formatPhone(raw) {
  const d = (raw || '').replace(/\D/g, '')
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  return raw
}

function splitName(displayName) {
  const parts = (displayName || '').trim().split(/\s+/).filter(Boolean)
  return { first: parts[0] || '', last: parts.slice(1).join(' ') || '' }
}

const emailLooksValid = (e) => /^\S+@\S+\.\S+$/.test((e || '').trim())

const hdr = {
  page: { minHeight: '100vh', background: '#F0F4F8' },
  bar: { position: 'sticky', top: 0, zIndex: 10, background: '#fff', padding: 'max(env(safe-area-inset-top), 16px) 16px 12px', borderBottom: '1px solid #DDE3EA', display: 'flex', alignItems: 'center', gap: 12 },
  back: { width: 34, height: 34, flexShrink: 0, borderRadius: 8, border: '1px solid #E1E7EE', background: '#fff', color: '#1B3F6E', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 },
  eyebrow: { fontSize: 10.5, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#7A8FA6' },
  title: { fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 700, color: '#0D1B2A', lineHeight: 1.1 },
  body: { padding: 16 },
}

export default function ProfilePage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  // AppShell guarantees `user` is present before this renders, so seed directly.
  const seeded = splitName(user?.user_metadata?.display_name)
  const [firstName, setFirstName] = useState(seeded.first)
  const [lastName, setLastName] = useState(seeded.last)
  const [phone, setPhone] = useState(formatPhone(user?.user_metadata?.phone || ''))
  const [email, setEmail] = useState(user?.email || '')

  const [nameState, setNameState] = useState({ saving: false, saved: false, err: '' })
  const [phoneState, setPhoneState] = useState({ saving: false, saved: false, err: '' })
  const [emailState, setEmailState] = useState({ saving: false, saved: false, err: '', note: '' })

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwState, setPwState] = useState({ saving: false, ok: '', err: '' })

  // Push notifications toggle. `supported` gates the whole row; on unsupported
  // devices/browsers we show a clear "not available here" note instead of a broken
  // control. `on` reflects an active subscription for THIS browser.
  const pushSupported = isPushSupported()
  const [pushOn, setPushOn] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushErr, setPushErr] = useState('')
  useEffect(() => {
    if (!pushSupported) return
    hasActiveSubscription().then(setPushOn)
  }, [pushSupported])

  async function togglePush() {
    if (pushBusy) return
    setPushBusy(true); setPushErr('')
    if (pushOn) {
      await disablePush()
      setPushOn(false)
    } else {
      const res = await enablePush(user.id)
      if (res.ok) setPushOn(true)
      else setPushErr(
        res.reason === 'denied' ? 'Notifications are blocked in your device settings — enable them there first.'
        : res.reason === 'unsupported' ? 'Not available on this browser.'
        : res.reason === 'no-vapid-key' ? 'Push isn’t configured on the server yet.'
        : 'Could not enable notifications. Please try again.',
      )
    }
    setPushBusy(false)
  }

  // Each save returns true on success so the caller can collapse the row. Failure
  // (validation or error) returns false → the row stays open with its message.
  async function saveName() {
    if (!firstName.trim() || !lastName.trim()) { setNameState({ saving: false, saved: false, err: 'First and last name are required.' }); return false }
    setNameState({ saving: true, saved: false, err: '' })
    const displayName = `${firstName.trim()} ${lastName.trim()}`.trim()
    try {
      const { error: metaErr } = await supabase.auth.updateUser({ data: { display_name: displayName } })
      if (metaErr) throw metaErr
      const { error: profErr } = await supabase.from('profiles').update({ display_name: displayName }).eq('id', user.id)
      if (profErr) throw profErr
      setNameState({ saving: false, saved: true, err: '' })
      setTimeout(() => setNameState(s => ({ ...s, saved: false })), 2000)
      return true
    } catch (err) {
      setNameState({ saving: false, saved: false, err: err?.message || String(err) })
      return false
    }
  }

  async function savePhone() {
    setPhoneState({ saving: true, saved: false, err: '' })
    const phoneDigits = phone.replace(/\D/g, '') || null
    try {
      const { error: metaErr } = await supabase.auth.updateUser({ data: { phone: phoneDigits } })
      if (metaErr) throw metaErr
      // profiles.phone was added by migration 20260639; if the column/schema cache
      // isn't ready the write fails on "phone" — the value still round-trips via
      // auth metadata above, so that's non-fatal here.
      const { error: profErr } = await supabase.from('profiles').update({ phone: phoneDigits }).eq('id', user.id)
      if (profErr && !/phone/i.test(profErr.message || '')) throw profErr
      setPhone(formatPhone(phone))
      setPhoneState({ saving: false, saved: true, err: '' })
      setTimeout(() => setPhoneState(s => ({ ...s, saved: false })), 2000)
      return true
    } catch (err) {
      setPhoneState({ saving: false, saved: false, err: err?.message || String(err) })
      return false
    }
  }

  async function saveEmail() {
    if (!emailLooksValid(email)) { setEmailState({ saving: false, saved: false, err: 'Enter a valid email address.', note: '' }); return false }
    if (email.trim().toLowerCase() === (user.email || '').toLowerCase()) { setEmailState({ saving: false, saved: true, err: '', note: '' }); setTimeout(() => setEmailState(s => ({ ...s, saved: false })), 2000); return true }
    setEmailState({ saving: true, saved: false, err: '', note: '' })
    try {
      const { error } = await supabase.auth.updateUser({ email: email.trim() })
      if (error) throw error
      // Email changes require confirming the new address before they take effect —
      // keep the row OPEN so the "check your new email" note stays visible (return
      // false so the caller doesn't collapse it).
      setEmailState({ saving: false, saved: false, err: '', note: `Check your new email (${email.trim()}) to confirm the change — until then your login email stays the same.` })
      return false
    } catch (err) {
      setEmailState({ saving: false, saved: false, err: err?.message || String(err), note: '' })
      return false
    }
  }

  async function changePassword() {
    if (!currentPassword) { setPwState({ saving: false, ok: '', err: 'Enter your current password.' }); return false }
    if (newPassword.length < 6) { setPwState({ saving: false, ok: '', err: 'New password must be at least 6 characters.' }); return false }
    if (newPassword !== confirmPassword) { setPwState({ saving: false, ok: '', err: 'New passwords do not match.' }); return false }
    if (newPassword === currentPassword) { setPwState({ saving: false, ok: '', err: 'New password must be different from the current one.' }); return false }
    setPwState({ saving: true, ok: '', err: '' })
    try {
      // Re-authenticate to confirm the current password — no silent updates.
      const { error: reauthErr } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword })
      if (reauthErr) { setPwState({ saving: false, ok: '', err: 'Current password is incorrect.' }); return false }
      const { error: updErr } = await supabase.auth.updateUser({ password: newPassword })
      if (updErr) throw updErr
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      setPwState({ saving: false, ok: 'Password updated.', err: '' })
      return true
    } catch (err) {
      setPwState({ saving: false, ok: '', err: err?.message || String(err) })
      return false
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  const nameValue = `${firstName} ${lastName}`.trim() || '—'
  const phoneValue = phone.trim() ? formatPhone(phone) : '—'
  const emailValue = email || '—'

  return (
    <div style={hdr.page}>
      <div style={hdr.bar}>
        <button style={hdr.back} onClick={() => navigate(-1)} aria-label="Back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div>
          <div style={hdr.eyebrow}>Your Account</div>
          <div style={hdr.title}>Profile</div>
        </div>
      </div>

      <div style={hdr.body}>
        <Disclosure label="Name" value={nameValue}>
          {({ close }) => (<>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={rowUI.fieldLabel}>First Name</div>
                <input style={rowUI.input} type="text" placeholder="First" value={firstName}
                  onChange={e => { setFirstName(e.target.value); setNameState(s => ({ ...s, saved: false })) }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={rowUI.fieldLabel}>Last Name</div>
                <input style={rowUI.input} type="text" placeholder="Last" value={lastName}
                  onChange={e => { setLastName(e.target.value); setNameState(s => ({ ...s, saved: false })) }} />
              </div>
            </div>
            <SaveLink onClick={async () => { if (await saveName()) close() }} saving={nameState.saving} saved={nameState.saved} error={nameState.err} />
          </>)}
        </Disclosure>

        <Disclosure label="Phone Number" value={phoneValue}>
          {({ close }) => (<>
            <div style={rowUI.fieldLabel}>Phone</div>
            <input style={rowUI.input} type="tel" inputMode="tel" placeholder="(555) 000-0000" value={phone}
              onChange={e => { setPhone(e.target.value); setPhoneState(s => ({ ...s, saved: false })) }}
              onBlur={() => setPhone(formatPhone(phone))} />
            <SaveLink onClick={async () => { if (await savePhone()) close() }} saving={phoneState.saving} saved={phoneState.saved} error={phoneState.err} />
          </>)}
        </Disclosure>

        <Disclosure label="Email" value={emailValue}>
          {({ close }) => (<>
            <div style={rowUI.fieldLabel}>Email</div>
            <input style={rowUI.input} type="email" placeholder="you@example.com" value={email}
              onChange={e => { setEmail(e.target.value); setEmailState(s => ({ ...s, saved: false, note: '' })) }} />
            {emailState.note && <div style={rowUI.info}>{emailState.note}</div>}
            <SaveLink onClick={async () => { if (await saveEmail()) close() }} saving={emailState.saving} saved={emailState.saved} error={emailState.err} />
          </>)}
        </Disclosure>

        <Disclosure label="Change Password" value="">
          {({ close }) => (<>
            <div style={rowUI.fieldLabel}>Current Password</div>
            <input style={rowUI.input} type="password" placeholder="Current password" value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)} autoComplete="current-password" />
            <div style={rowUI.fieldLabel}>New Password</div>
            <input style={rowUI.input} type="password" placeholder="Min 6 characters" value={newPassword}
              onChange={e => setNewPassword(e.target.value)} minLength={6} autoComplete="new-password" />
            <div style={rowUI.fieldLabel}>Confirm New Password</div>
            <input style={rowUI.input} type="password" placeholder="Re-enter new password" value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)} minLength={6} autoComplete="new-password" />
            {pwState.ok && <div style={{ ...rowUI.ok, marginTop: 8 }}>{pwState.ok}</div>}
            <SaveLink onClick={async () => { if (await changePassword()) close() }} saving={pwState.saving} saved={false} error={pwState.err} label="Update password" />
          </>)}
        </Disclosure>

        <Disclosure label="Notifications" value={!pushSupported ? 'Unavailable' : pushOn ? 'On' : 'Off'}>
          {pushSupported ? (
            <>
              <Toggle on={pushOn} onClick={togglePush} label="Trash talk push notifications" />
              <div style={rowUI.note}>Get a push (and an app-icon badge) when someone posts to the Trash Talk thread. iPhone: add Trip Clubhouse to your Home Screen first.</div>
              {pushErr && <div style={rowUI.err}>{pushErr}</div>}
            </>
          ) : (
            <div style={rowUI.note}>Push notifications aren’t available on this browser. On iPhone, add Trip Clubhouse to your Home Screen and open it from there to enable them.</div>
          )}
        </Disclosure>

        <div style={rowUI.dangerWrap}>
          <button style={rowUI.dangerBtn} onClick={handleSignOut}>Sign Out</button>
        </div>
      </div>
    </div>
  )
}
