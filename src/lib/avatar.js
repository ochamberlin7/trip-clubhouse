// Profile photos: shrink on the phone, upload to the `avatars` bucket, and save
// the URL on the account (auth user_metadata.avatar_url, which updates the UI at
// once) and on profiles.avatar_url (so other screens can show it later).
// Bucket + policies: migration 20260676_profile_photos.sql.
// Pure helpers live here (unit-tested); the upload code is in avatarUpload.js.
export const AVATAR_BUCKET = 'avatars'
export const AVATAR_SIZE = 320 // px, square

// Centered square crop of a w×h image → { sx, sy, side }.
export function squareCrop(w, h) {
  const side = Math.min(w, h)
  return { sx: Math.round((w - side) / 2), sy: Math.round((h - side) / 2), side }
}

// The square to cut from a w×h image. Uses the crop window's area (natural
// pixels, from react-easy-crop) when given — squared and kept inside the image —
// otherwise a centered square. → { sx, sy, side }.
export function cropSquare(w, h, area = null) {
  if (!area || !(area.width > 0) || !(area.height > 0)) return squareCrop(w, h)
  const side = Math.max(1, Math.min(Math.round(Math.min(area.width, area.height)), w, h))
  const sx = Math.min(Math.max(0, Math.round(area.x)), w - side)
  const sy = Math.min(Math.max(0, Math.round(area.y)), h - side)
  return { sx, sy, side }
}

// Storage path inside the bucket. The first folder must be the user's id (RLS).
// A new name per upload so phones never show a cached old photo.
export function avatarPath(userId, now = Date.now()) {
  return `${userId}/${now}.jpg`
}

// The signed-in account's photo URL, or null.
export function accountAvatarUrl(user) {
  return user?.user_metadata?.avatar_url || null
}
