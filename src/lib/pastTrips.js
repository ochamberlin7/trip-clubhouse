// Past trips (Owen 2026-11-06): trips played before Trip Clubhouse, brought in
// from the old trip spreadsheets — who went, each player's handicap index, the
// teams and the result. There are no scores, so they count toward trips played,
// the handicap chart and trips won, and nothing that needs a scorecard.
//
// Stored in past_trips / past_trip_players (migration 20260684), NOT in trips, so
// they never show up in the trip switcher, Home's trip list or anywhere a real
// trip opens. pastTripRows turns them into the same per-trip shape loadCareerData
// returns, with a `past` field; buildCareer, buildCareerDetail, the finish
// helpers and buildGroupStats check `t.past` and use the recorded result instead
// of scores.
//
// past_trips row:        { id, group_id, name, start_date, end_date, location,
//                          format_label, rounds, courses: [text],
//                          result_kind: 'team' | 'player',
//                          teams: [{ index, name, points, rank }] }
// past_trip_players row: { past_trip_id, user_id, name, handicap_index,
//                          team_index, rank }  (rank: individual trips only)
// A player with no account (user_id null) is listed on the trip but gets no
// stats of their own (Owen: ignore the guys without logins for now).

const splitName = name => {
  const parts = String(name || '').trim().split(/\s+/)
  return { first: parts[0] || '', last: parts.slice(1).join(' ') }
}

export function pastTripRows(trips = [], players = []) {
  return trips.map(t => {
    const team = (t.result_kind || 'team') === 'team'
    const teamId = i => `${t.id}:team${i}`
    const ps = players.filter(p => p.past_trip_id === t.id)
    const tripPlayers = ps.map((p, i) => {
      const { first, last } = splitName(p.name)
      return {
        id: `${t.id}:p${i}`,
        trip_id: t.id,
        user_id: p.user_id || null,
        claimed_user_id: null,
        handicap_index: p.handicap_index ?? null,
        team_id: team && p.team_index != null ? teamId(p.team_index) : null,
        first_name: first,
        last_name: last,
        guest_name: null,
        // No account: shown on the trip, left out of member stats.
        pastGuest: !p.user_id,
        pastRank: p.rank ?? null,
      }
    })
    const teamRows = team ? (t.teams || []).map(tm => ({ id: teamId(tm.index), trip_id: t.id, name: tm.name || null, team_index: tm.index })) : []
    return {
      tripId: t.id,
      tripName: t.name,
      trip: { id: t.id, name: t.name, start_date: t.start_date || null, end_date: t.end_date || t.start_date || null, format: null, team_mode: team },
      allowance: 100,
      rounds: [], scores: [], pairings: [], pairingPlayers: [], playerRounds: [], drinks: [],
      tripPlayers,
      teams: teamRows,
      past: {
        kind: team ? 'team' : 'player',
        formatLabel: t.format_label || null,
        rounds: t.rounds ?? null,
        courses: t.courses || [],
        location: t.location || null,
        teams: (t.teams || []).map(tm => ({ id: teamId(tm.index), index: tm.index, name: tm.name || null, points: tm.points ?? null, rank: tm.rank ?? null })),
      },
    }
  })
}

const ordinal = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th'}`

// A player's finish on a past trip, worded like a real trip's: "Champion",
// "Co-champion", "2nd place" (teams) or "Winner" / "Tied for 1st" (individual).
// null when the sheet didn't record one.
export function pastFinish(t, me) {
  if (!t?.past || !me) return null
  if (t.past.kind === 'team') {
    const mine = t.past.teams.find(tm => tm.id === me.team_id)
    if (!mine || mine.rank == null) return null
    const tied = t.past.teams.filter(tm => tm.rank === mine.rank).length > 1
    if (mine.rank === 1) return tied ? 'Co-champion' : 'Champion'
    return tied ? `Tied for ${ordinal(mine.rank)}` : `${ordinal(mine.rank)} place`
  }
  if (me.pastRank == null) return null
  const tied = t.tripPlayers.filter(p => p.pastRank === me.pastRank).length > 1
  if (me.pastRank === 1) return tied ? 'Tied for 1st' : 'Winner'
  return tied ? `Tied for ${ordinal(me.pastRank)}` : ordinal(me.pastRank)
}

// The recorded result in groupStats' tripResult shape: { standings, winner, race }.
export function pastResult(t, playerName) {
  const p = t.past
  const people = t.tripPlayers
  if (p.kind === 'team') {
    const ranked = p.teams.filter(tm => tm.rank != null).sort((a, b) => a.rank - b.rank)
    if (!ranked.length) return { standings: null, winner: null, race: null }
    const label = tm => tm.name || `Team ${tm.index}`
    const rows = ranked.map(tm => ({ id: tm.id, name: label(tm), total: tm.points, rank: tm.rank, players: people.filter(x => x.team_id === tm.id).map(playerName) }))
    const top = rows.filter(r => r.rank === 1)
    return {
      standings: { kind: 'team', lowWins: false, unit: 'points', rows },
      winner: { kind: 'team', tied: top.length > 1, label: top.length > 1 ? `Tied: ${top.map(r => r.name).join(' & ')}` : top[0].name, players: top.flatMap(r => r.players) },
      race: null,
    }
  }
  const top = people.filter(x => x.pastRank === 1)
  if (!top.length) return { standings: null, winner: null, race: null }
  const names = top.map(playerName)
  return {
    standings: null,
    winner: { kind: 'player', tied: top.length > 1, label: top.length > 1 ? `Tied: ${names.join(' & ')}` : names[0], players: names },
    race: null,
  }
}

// Loaders. Both return [] if the tables aren't there yet (migration not run) or
// the request fails, so the pages still work without past trips (with a console
// warning, so a failure is visible).
const warn = (what, error) => { console.warn(`Past trips: couldn't load ${what}`, error?.code || '', error?.message || error) }
async function rowsFor(client, trips) {
  if (!trips?.length) return []
  const { data: players, error } = await client.from('past_trip_players')
    .select('past_trip_id, user_id, name, handicap_index, team_index, rank')
    .in('past_trip_id', trips.map(t => t.id))
  if (error) { warn('players', error); return [] }
  return pastTripRows(trips, players || [])
}

const TRIP_COLS = 'id, group_id, name, start_date, end_date, location, format_label, rounds, courses, result_kind, teams'

// Every past trip of one group (Group stats page).
export async function loadGroupPastTrips(client, groupId) {
  if (!groupId) return []
  const { data, error } = await client.from('past_trips').select(TRIP_COLS).eq('group_id', groupId)
  if (error) { warn('group trips', error); return [] }
  return rowsFor(client, data)
}

// The past trips one player was on (Career page, Home's totals).
export async function loadMyPastTrips(client, userId) {
  if (!userId) return []
  const { data: mine, error } = await client.from('past_trip_players').select('past_trip_id').eq('user_id', userId)
  if (error) { warn('your trips', error); return [] }
  if (!mine?.length) return []
  const { data, error: tErr } = await client.from('past_trips').select(TRIP_COLS).in('id', [...new Set(mine.map(m => m.past_trip_id))])
  if (tErr) { warn('trips', tErr); return [] }
  return rowsFor(client, data)
}
