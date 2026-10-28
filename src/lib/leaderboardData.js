// The Leaderboard's data, loaded in one place for both formats (Points and Standard
// Match Play), with a copy saved on the phone so the standings still show with no
// signal. Scores entered offline that haven't synced yet are laid on top by the
// caller (withUnsyncedScores) so the standings include them.
import { saveCopy, readCopy } from './offlineCache.js'
import { getQueue, overlayQueue } from './scoreQueue.js'

const copyKey = tripId => `leaderboard:${tripId}`

// Returns { data } on success (and saves a copy), or { data: savedCopyOrNull, offline: true }.
// data = { pairings, pairingPlayers, hcpByPlayer, scoresMap, teeRowMap }
export async function loadLeaderboardData(client, tripId, roundIds) {
  try {
    const [pairRes, tpRes, scoreRes, prRes] = await Promise.all([
      client.from('pairings').select('id, round_id, pairing_number, team1_id, team2_id').in('round_id', roundIds),
      client.from('trip_players').select('id, handicap_index').eq('trip_id', tripId),
      client.from('scores').select('round_id, trip_player_id, hole_number, gross_score').in('round_id', roundIds),
      client.from('player_rounds').select('trip_player_id, round_id, slope, rating, par').in('round_id', roundIds),
    ])
    if (pairRes.error || tpRes.error || scoreRes.error || prRes.error) throw pairRes.error || tpRes.error || scoreRes.error || prRes.error
    const pairs = pairRes.data || []
    const pairIds = pairs.map(p => p.id)
    let pp = []
    if (pairIds.length) {
      const { data, error } = await client.from('pairing_players').select('pairing_id, trip_player_id, team_slot').in('pairing_id', pairIds)
      if (error) throw error
      pp = data || []
    }
    const hcp = {}; (tpRes.data || []).forEach(tp => { hcp[tp.id] = tp.handicap_index })
    const sMap = {}; (scoreRes.data || []).forEach(s => { if (s.gross_score != null) sMap[`${s.round_id}:${s.trip_player_id}:${s.hole_number}`] = s.gross_score })
    const tMap = {}; (prRes.data || []).forEach(pr => { tMap[`${pr.round_id}:${pr.trip_player_id}`] = pr })
    const data = { pairings: pairs, pairingPlayers: pp, hcpByPlayer: hcp, scoresMap: sMap, teeRowMap: tMap }
    saveCopy(copyKey(tripId), data)
    return { data }
  } catch {
    return { data: readCopy(copyKey(tripId)), offline: true }
  }
}

// The leaderboard inputs with this phone's unsynced (offline) scores applied.
export function withUnsyncedScores(data, queue = getQueue()) {
  if (!data || !queue.length) return data
  return { ...data, scoresMap: overlayQueue(data.scoresMap, {}, queue).scores }
}
