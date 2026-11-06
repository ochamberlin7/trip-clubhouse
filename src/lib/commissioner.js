// Commissioner is per trip (trip_commissioners, migration 20260680).

// Hand the commissioner job for one trip to another player: add them, then
// remove yourself (the database keeps at least one commissioner, so the add has
// to come first). Returns { error }. The new commissioner must have joined the
// trip with an account (toUserId).
export async function transferCommissioner(client, { tripId, toUserId, fromUserId }) {
  if (!tripId || !toUserId || !fromUserId) return { error: { message: 'Missing player or trip.' } }
  if (toUserId === fromUserId) return { error: { message: "You're already the commissioner." } }
  const add = await client.from('trip_commissioners').upsert({ trip_id: tripId, user_id: toUserId }, { onConflict: 'trip_id,user_id', ignoreDuplicates: true })
  if (add.error) return { error: add.error }
  const drop = await client.from('trip_commissioners').delete().eq('trip_id', tripId).eq('user_id', fromUserId)
  return { error: drop.error || null }
}
