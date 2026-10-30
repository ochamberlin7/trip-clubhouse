import { useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { accountAvatarUrl } from '../lib/avatar'
import { uploadAvatar, removeAvatar } from '../lib/avatarUpload'

// Photo picker for the signed-in account. Render `input` somewhere (it's hidden),
// call `pick()` from a tap. Uploading updates the account, so every badge
// re-renders with the new photo.
export function useAvatarPicker() {
  const { user } = useAuth()
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pick = () => { if (!busy) { setError(''); inputRef.current?.click() } }
  async function onChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !user) return
    setBusy(true)
    try { await uploadAvatar(user.id, file) } catch (err) { setError(err?.message || 'Upload failed.') }
    setBusy(false)
  }
  async function remove() {
    if (!user || busy) return
    setBusy(true); setError('')
    try { await removeAvatar(user.id) } catch (err) { setError(err?.message || 'Could not remove the photo.') }
    setBusy(false)
  }
  const input = <input ref={inputRef} type="file" accept="image/*" onChange={onChange} style={{ display: 'none' }} />
  return { pick, remove, busy, error, input, hasPhoto: !!accountAvatarUrl(user) }
}
