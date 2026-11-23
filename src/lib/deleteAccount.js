// Deleting your own account. The database does the real work in one transaction
// (RPC delete_my_account, migration 20260686): the login, profile, memberships,
// commissioner rows, push subscriptions and chat messages go; trips that haven't
// started get an empty Player TBD spot; trips that have started keep the player's
// name, handicap and scores so everyone else's standings and stats don't change.
// Takes the Supabase client as an argument so it stays testable in Node.

import { AVATAR_BUCKET } from './avatar.js'

// What the person types to confirm. Plain word, no punctuation.
export const DELETE_CONFIRM_WORD = 'DELETE'

export function isDeleteConfirmed(typed) {
  return (typed || '').trim().toUpperCase() === DELETE_CONFIRM_WORD
}

// Turn the RPC's error into a sentence that says what happened and what to do.
export function deleteAccountErrorMessage(error) {
  const msg = error?.message || ''
  const sole = msg.match(/SOLE_COMMISSIONER:(.*)$/)
  if (sole) {
    const trip = sole[1].trim() || 'a trip'
    return `You're the only commissioner of ${trip}. Make another player commissioner from Menu, Players and teams, or delete the trip, then try again.`
  }
  if (msg.includes('ACCOUNT_IN_USE')) {
    return "Your account is still linked to group data we can't unlink automatically. Nothing was deleted. Send us a note from Menu, Support and we'll take care of it."
  }
  if (msg.includes('delete_my_account') || error?.code === 'PGRST202') {
    return "Account deletion isn't set up yet. Nothing was deleted. Please try again later."
  }
  return "Couldn't delete your account. Nothing was deleted. Check your connection and try again."
}

export async function deleteMyAccount(client, userId) {
  const { error } = await client.rpc('delete_my_account')
  if (error) return { error: deleteAccountErrorMessage(error) }
  // Profile photos live in Storage, which SQL can't delete. Removed only after the
  // account is gone (so a refused deletion never leaves a broken photo); the
  // session token still names the user's own folder. Best-effort.
  if (userId) {
    try {
      const { data } = await client.storage.from(AVATAR_BUCKET).list(userId)
      const paths = (data || []).map(f => `${userId}/${f.name}`)
      if (paths.length) await client.storage.from(AVATAR_BUCKET).remove(paths)
    } catch { /* photo cleanup never blocks the deletion */ }
  }
  // The auth user is gone; clear the local session too.
  try { await client.auth.signOut() } catch { /* already signed out server-side */ }
  return { error: null }
}
