import { useCallback, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { accountAvatarUrl } from '../lib/avatar'
import { uploadAvatar, removeAvatar } from '../lib/avatarUpload'
import PhotoCropper from './PhotoCropper'
import PhotoActionSheet from './PhotoActionSheet'

// Photo picker for the signed-in account. Render `input` somewhere (it holds the
// hidden file input and the crop window), call `pick()` from a tap. Flow: pick a
// photo → "Move and scale" crop window → Save uploads exactly what's in the
// circle. Uploading updates the account, so every badge re-renders.
// `edit()` is the tap handler for "Edit photo": with a photo it opens the
// Change / Remove pop-up, without one it goes straight to picking.
export function useAvatarPicker() {
  const { user } = useAuth()
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState(null) // { file, url } while the crop window is open
  const [sheetOpen, setSheetOpen] = useState(false)
  const hasPhoto = !!accountAvatarUrl(user)
  const pick = () => { if (!busy) { setError(''); inputRef.current?.click() } }
  const edit = () => { if (busy) return; if (hasPhoto) setSheetOpen(true); else pick() }
  const closeSheet = useCallback(() => setSheetOpen(false), [])

  const closeCropper = useCallback(() => {
    setPicked(p => { if (p) URL.revokeObjectURL(p.url); return null })
    setError('')
  }, [])

  function onChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !user) return
    if (!/^image\//.test(file.type || 'image/')) { setError('Pick a photo file.'); return }
    setError('')
    setPicked({ file, url: URL.createObjectURL(file) })
  }

  async function saveCrop(area) {
    if (!picked || !user) return
    setBusy(true); setError('')
    try {
      await uploadAvatar(user.id, picked.file, area)
      setBusy(false)
      closeCropper()
    } catch (err) {
      setBusy(false)
      setError(err?.message || 'Upload failed.')
    }
  }

  async function remove() {
    if (!user || busy) return
    setBusy(true); setError('')
    try { await removeAvatar(user.id) } catch (err) { setError(err?.message || 'Could not remove the photo.') }
    setBusy(false)
  }

  const input = (
    <>
      <input ref={inputRef} type="file" accept="image/*" onChange={onChange} style={{ display: 'none' }} />
      {sheetOpen && (
        <PhotoActionSheet
          onChange={() => { setSheetOpen(false); pick() }}
          onRemove={() => { setSheetOpen(false); remove() }}
          onClose={closeSheet}
        />
      )}
      {picked && <PhotoCropper imageUrl={picked.url} onSave={saveCrop} onCancel={closeCropper} busy={busy} error={error} />}
    </>
  )
  // While the crop window is open its own error line is used.
  return { pick, edit, remove, busy: busy && !picked, error: picked ? '' : error, input, hasPhoto }
}
