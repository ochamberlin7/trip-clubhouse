// Roster changes — the ONE place players are removed from or replaced on a trip.
// Both are only allowed before the trip starts (see isRosterLocked in scoring.js);
// callers check that, and these functions refuse a locked roster too.
//
// Remove  → the player's row is deleted: their pairing slots open up, and their
//           tee picks, flights and drinks go with them (ON DELETE CASCADE).
// Replace → the SAME row is re-pointed at a new person (new name, handicap, contact),
//           so the team slot and every pairing carry over untouched. The old
//           person's account link is cleared; the new person claims the slot through
//           the normal invite link (email/phone match or picking the open slot).
//
// Chat history is safe either way: messages store their own sender_name.
// Takes the Supabase client as an argument so the pure helpers stay testable in Node.

const BLANK_FLIGHT = {
  is_driving: false,
  arrive_date: null, arrive_time: null, arrive_airport: null, flight_number_in: null,
  depart_date: null, depart_time: null, depart_airport: null, flight_number_out: null,
}

// Plain-language reason a commissioner can't change this player, or null if they can.
export function rosterChangeBlockReason({ player, rosterLocked }) {
  if (rosterLocked) return 'The roster is set once the trip starts.'
  if (player?.is_commissioner) return "The commissioner can't be removed or replaced."
  return null
}

// The trip_players update that turns a slot into the replacement player.
// Team, pairings and tee picks stay with the slot; identity and claim reset.
export function replacementPatch({ first_name, last_name, handicap_index, email, phone }) {
  const first = (first_name || '').trim()
  const last = (last_name || '').trim()
  if (!first) throw new Error('First name is required.')
  const hcp = handicap_index === '' || handicap_index == null ? null : Number(handicap_index)
  if (hcp != null && (!Number.isFinite(hcp) || hcp < 0 || hcp > 54)) throw new Error('Handicap must be between 0 and 54.')
  return {
    first_name: first,
    last_name: last || null,
    guest_name: null,
    handicap_index: hcp,
    email: (email || '').trim() || null,
    phone: (phone || '').trim() || null,
    user_id: null,
    claimed_user_id: null,
    is_claimed: false,
    is_captain: false,
  }
}

// The old person's account, if they had one (the account that claimed or owns the row).
function accountOf(player) {
  return player?.claimed_user_id || player?.user_id || null
}

// After a person loses their slot, drop their group membership so the trip leaves
// their trip list — but only a plain 'player' membership, and only if they have no
// other slot on any trip in the same group.
async function releaseGroupMembership(client, { userId, groupId, tripPlayerId }) {
  if (!userId || !groupId) return
  const { data: groupTrips } = await client.from('trips').select('id').eq('group_id', groupId)
  const tripIds = (groupTrips || []).map(t => t.id)
  if (tripIds.length) {
    const { data: otherSlots } = await client.from('trip_players').select('id')
      .in('trip_id', tripIds).neq('id', tripPlayerId)
      .or(`user_id.eq.${userId},claimed_user_id.eq.${userId}`).limit(1)
    if ((otherSlots || []).length) return
  }
  await client.from('group_members').delete()
    .eq('group_id', groupId).eq('user_id', userId).eq('role', 'player')
}

export async function removeTripPlayer(client, { player, groupId, rosterLocked }) {
  const blocked = rosterChangeBlockReason({ player, rosterLocked })
  if (blocked) return { error: new Error(blocked) }
  const { error: ppErr } = await client.from('pairing_players').delete().eq('trip_player_id', player.id)
  if (ppErr) return { error: ppErr }
  const { error } = await client.from('trip_players').delete().eq('id', player.id)
  if (error) return { error }
  await releaseGroupMembership(client, { userId: accountOf(player), groupId, tripPlayerId: player.id })
  return { error: null }
}

export async function replaceTripPlayer(client, { player, groupId, rosterLocked, replacement }) {
  const blocked = rosterChangeBlockReason({ player, rosterLocked })
  if (blocked) return { error: new Error(blocked) }
  let patch
  try { patch = replacementPatch(replacement) } catch (e) { return { error: e } }
  const { error } = await client.from('trip_players').update(patch).eq('id', player.id)
  if (error) return { error }
  // The old person's flight details don't belong to the new person. Blank them
  // (flights has an update policy for commissioners, but no delete policy).
  await client.from('flights').update(BLANK_FLIGHT).eq('trip_player_id', player.id)
  await releaseGroupMembership(client, { userId: accountOf(player), groupId, tripPlayerId: player.id })
  return { error: null }
}
