// Roster changes — the ONE place a player is removed from a trip.
// Only allowed before the trip starts (see isRosterLocked in scoring.js); callers
// check that, and removeTripPlayer refuses a locked roster too.
//
// Remove → the player's row is cleared into an empty placeholder spot. The spot
// keeps its pairings and tee picks; the person's name, handicap, contact, team
// (→ Unassigned), account link, captain flag and flight details are wiped. The commissioner then
// fills the spot in with the normal edit form and shares the invite link — the
// new person is matched to the spot by email, phone or name (JoinTrip.jsx).
// An empty spot (no name, email or phone) can never be matched by mistake.
//
// Chat history is safe: messages store their own sender_name.
// Takes the Supabase client as an argument so it stays testable in Node.

// The trip_players update that turns a player into an empty spot.
export const PLACEHOLDER_PATCH = Object.freeze({
  first_name: null,
  last_name: null,
  guest_name: null,
  team_id: null,
  handicap_index: null,
  email: null,
  phone: null,
  user_id: null,
  claimed_user_id: null,
  is_claimed: false,
  is_captain: false,
  // The new person starts fresh on the app's getting-started prompts and drink count.
  onboarding_completed: false,
  getting_started_opted_out: false,
  manual_drinks: 0,
})

const BLANK_FLIGHT = {
  is_driving: false,
  arrive_date: null, arrive_time: null, arrive_airport: null, flight_number_in: null,
  depart_date: null, depart_time: null, depart_airport: null, flight_number_out: null,
}

// What an empty spot is called everywhere it shows.
export const PLACEHOLDER_LABEL = 'Player TBD'

// An empty spot: nobody's name, email or phone on it yet.
export function isPlaceholderPlayer(p) {
  return !!p && !p.is_claimed
    && ![p.first_name, p.last_name, p.guest_name, p.email, p.phone].some(v => (v || '').trim())
}

// Plain-language reason a commissioner can't remove this player, or null if they can.
export function rosterChangeBlockReason({ player, rosterLocked }) {
  if (rosterLocked) return 'The roster is set once the trip starts.'
  if (player?.is_commissioner) return "The commissioner can't be removed."
  return null
}

// The old person's account, if they had one (the account that claimed or owns the row).
function accountOf(player) {
  return player?.claimed_user_id || player?.user_id || null
}

// After a person loses their spot, drop their group membership so the trip leaves
// their trip list — but only a plain 'player' membership, and only if they have no
// other spot on any trip in the same group.
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
  // Flights have no delete policy — blank them. Done FIRST: a player leaving on
  // their own can only edit their flight while the spot is still linked to them.
  await client.from('flights').update(BLANK_FLIGHT).eq('trip_player_id', player.id)
  const { error } = await client.from('trip_players').update(PLACEHOLDER_PATCH).eq('id', player.id)
  if (error) return { error }
  await releaseGroupMembership(client, { userId: accountOf(player), groupId, tripPlayerId: player.id })
  return { error: null }
}

// Plain-language reason this person can't leave the trip themselves, or null if
// they can. Same lock as removal: only before the trip starts. The commissioner
// can't leave their own trip (they can delete it instead, before it starts).
export function leaveTripBlockReason({ isCommissioner, rosterLocked }) {
  if (rosterLocked) return 'This trip has started, so nobody can leave it.'
  if (isCommissioner) return "The commissioner can't leave the trip. You can delete it from Commissioner Tools instead."
  return null
}

// A player leaves the trip: their spot becomes an empty "Player TBD" (same as a
// commissioner removing them), and the trip drops off their trip list.
export async function leaveTrip(client, { player, groupId, isCommissioner, rosterLocked }) {
  const blocked = leaveTripBlockReason({ isCommissioner, rosterLocked })
  if (blocked) return { error: new Error(blocked) }
  if (!player?.id) return { error: new Error("Couldn't find your spot on this trip.") }
  return removeTripPlayer(client, { player: { ...player, is_commissioner: false }, groupId, rosterLocked })
}
