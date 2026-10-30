// Profile photo upload/remove (browser + Supabase). Pure helpers: avatar.js.
import { supabase } from './supabase'
import { AVATAR_BUCKET, AVATAR_SIZE, squareCrop, avatarPath } from './avatar'

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be opened as a photo.')) }
    img.src = url
  })
}

// Center-crop to a square and resize to AVATAR_SIZE as a JPEG blob.
export async function shrinkToSquareJpeg(file, size = AVATAR_SIZE) {
  const img = await loadImage(file)
  const { sx, sy, side } = squareCrop(img.naturalWidth, img.naturalHeight)
  const out = Math.min(size, side)
  const canvas = document.createElement('canvas')
  canvas.width = out
  canvas.height = out
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out)
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not process that photo.'))), 'image/jpeg', 0.86)
  })
}

// Delete every file in the user's folder except `keepPath`. Best-effort.
async function cleanUpOldPhotos(userId, keepPath = null) {
  const { data, error } = await supabase.storage.from(AVATAR_BUCKET).list(userId)
  if (error || !data) return
  const stale = data.map(f => `${userId}/${f.name}`).filter(p => p !== keepPath)
  if (stale.length) await supabase.storage.from(AVATAR_BUCKET).remove(stale)
}

// Save the URL on the account + profiles row. The profiles write is best-effort
// (the account copy is what the signed-in UI reads).
async function saveAvatarUrl(userId, url) {
  const { error } = await supabase.auth.updateUser({ data: { avatar_url: url } })
  if (error) throw error
  const { error: profErr } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId)
  if (profErr) console.warn('[avatar] profiles.avatar_url not saved:', profErr.message)
}

// Upload a picked file as the user's photo. Returns the public URL.
export async function uploadAvatar(userId, file) {
  if (!userId) throw new Error('Not signed in.')
  if (!file || !/^image\//.test(file.type || 'image/')) throw new Error('Pick a photo file.')
  const blob = await shrinkToSquareJpeg(file)
  const path = avatarPath(userId)
  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
  if (error) throw new Error(/bucket/i.test(error.message || '') ? 'Photo storage isn’t set up yet.' : (error.message || 'Upload failed.'))
  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path)
  await saveAvatarUrl(userId, data.publicUrl)
  cleanUpOldPhotos(userId, path)
  return data.publicUrl
}

// Remove the user's photo (back to initials).
export async function removeAvatar(userId) {
  if (!userId) throw new Error('Not signed in.')
  await saveAvatarUrl(userId, null)
  await cleanUpOldPhotos(userId)
}
