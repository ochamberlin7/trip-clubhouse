// Offline score outbox. When a score (or a score removal) can't reach the server
// because there's no signal, it's kept here — on the phone, surviving an app close —
// and sent automatically once the connection is back. One entry per scorecard cell
// (the latest edit wins). Real errors (e.g. no permission for that pairing) are not
// queued; only connection failures are.
//
// Pure helpers (addToQueue, overlayQueue, isNetworkError) are unit-tested; the store
// (getQueue / enqueue / subscribeQueue) persists to localStorage and notifies
// listeners; flushQueue sends everything in order with the Supabase client.

const STORAGE_KEY = 'tc-score-queue:v1'

export const cellKey = (roundId, tpId, hole) => `${roundId}:${tpId}:${hole}`

// Does this error mean "couldn't reach the server" (vs. a real rejection)?
export function isNetworkError(error, online = typeof navigator !== 'undefined' ? navigator.onLine : true) {
  if (!error) return false
  if (online === false) return true
  const msg = `${error.message || ''} ${error.details || ''}`.toLowerCase()
  return /failed to fetch|load failed|network|networkerror|timeout|timed out|offline|internet connection/.test(msg)
}

// item: { op: 'save', round_id, trip_player_id, hole_number, gross_score, count }
//    or { op: 'delete', round_id, trip_player_id, hole_number }
// Returns a new list with any earlier entry for the same cell replaced (latest wins).
export function addToQueue(list = [], item) {
  const key = cellKey(item.round_id, item.trip_player_id, item.hole_number)
  return [...list.filter(x => cellKey(x.round_id, x.trip_player_id, x.hole_number) !== key), { ...item, queuedAt: item.queuedAt || Date.now() }]
}

// Apply unsynced edits on top of data fetched from the server, so a refetch never
// shows an older value over something entered while offline.
export function overlayQueue(scores = {}, drinks = {}, list = []) {
  const s = { ...scores }, d = { ...drinks }
  for (const x of list) {
    const k = cellKey(x.round_id, x.trip_player_id, x.hole_number)
    if (x.op === 'delete') { delete s[k]; delete d[k]; continue }
    s[k] = x.gross_score
    if (x.count > 0) d[k] = x.count; else delete d[k]
  }
  return { scores: s, drinks: d }
}

// ── store (localStorage + listeners) ─────────────────────────────────────────
let cache = null
const listeners = new Set()

function storage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null } catch { return null }
}
export function getQueue() {
  if (cache) return cache
  try { cache = JSON.parse(storage()?.getItem(STORAGE_KEY) || '[]') } catch { cache = [] }
  if (!Array.isArray(cache)) cache = []
  return cache
}
function setQueue(list) {
  cache = list
  try { storage()?.setItem(STORAGE_KEY, JSON.stringify(list)) } catch { /* storage full / blocked */ }
  listeners.forEach(fn => fn(list))
}
export function enqueue(item) { setQueue(addToQueue(getQueue(), item)) }
export function subscribeQueue(fn) { listeners.add(fn); return () => listeners.delete(fn) }

// ── sending ──────────────────────────────────────────────────────────────────
async function send(client, x) {
  const match = q => q.eq('round_id', x.round_id).eq('trip_player_id', x.trip_player_id).eq('hole_number', x.hole_number)
  if (x.op === 'delete') {
    const { error } = await match(client.from('scores').delete())
    if (error) return error
    await match(client.from('drinks').delete())
    return null
  }
  const { error } = await client.from('scores').upsert(
    { round_id: x.round_id, trip_player_id: x.trip_player_id, hole_number: x.hole_number, gross_score: x.gross_score },
    { onConflict: 'round_id,trip_player_id,hole_number' })
  if (error) return error
  if (x.count > 0) {
    await client.from('drinks').upsert(
      { round_id: x.round_id, trip_player_id: x.trip_player_id, hole_number: x.hole_number, count: x.count },
      { onConflict: 'round_id,trip_player_id,hole_number' })
  } else {
    await match(client.from('drinks').delete())
  }
  return null
}

let flushing = false
// Send everything in order. Stops at the first connection failure (the rest stay
// queued). A real rejection drops that entry and is reported via onRejected.
// Each sent entry is reported via onSynced (used to broadcast it to other viewers).
export async function flushQueue(client, { onSynced, onRejected } = {}) {
  if (flushing) return
  flushing = true
  try {
    for (const x of [...getQueue()]) {
      let error
      try { error = await send(client, x) } catch (e) { error = e }
      if (error && isNetworkError(error)) break
      // Sent (or rejected): remove this exact entry unless it was edited meanwhile.
      setQueue(getQueue().filter(y => y !== x && !(y.queuedAt === x.queuedAt && cellKey(y.round_id, y.trip_player_id, y.hole_number) === cellKey(x.round_id, x.trip_player_id, x.hole_number))))
      if (error) onRejected?.(x, error)
      else onSynced?.(x)
    }
  } finally {
    flushing = false
  }
}

// ── scorecard copy on the phone ──────────────────────────────────────────────
// The Score tab saves what it last showed for a trip, so opening it with no signal
// still shows the card (scores still waiting to sync are laid on top).
const snapKey = tripId => `tc-scorecard:v1:${tripId}`
export function saveScorecardSnapshot(tripId, data) {
  if (!tripId) return
  try { storage()?.setItem(snapKey(tripId), JSON.stringify({ ...data, savedAt: Date.now() })) } catch { /* storage full / blocked */ }
}
export function readScorecardSnapshot(tripId) {
  try { return JSON.parse(storage()?.getItem(snapKey(tripId)) || 'null') } catch { return null }
}
