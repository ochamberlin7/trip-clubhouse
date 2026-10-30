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

// Storage path inside the bucket. The first folder must be the user's id (RLS).
// A new name per upload so phones never show a cached old photo.
export function avatarPath(userId, now = Date.now()) {
  return `${userId}/${now}.jpg`
}

// The signed-in account's photo URL, or null.
export function accountAvatarUrl(user) {
  return user?.user_metadata?.avatar_url || null
}
