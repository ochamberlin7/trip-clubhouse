import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { getQueue, subscribeQueue, flushQueue } from './scoreQueue'

// Watches the offline score outbox and the phone's connection, and sends queued
// scores as soon as the signal is back (on reconnect, on returning to the app,
// and every 15s while anything is waiting). Mounted once by the trip screen so it
// runs whatever tab is open. Returns { pending, online } for the live dot / banner.
// Listeners passed via setScoreSyncHandlers get each sent / rejected entry.
const handlers = { onSynced: null, onRejected: null }
export function setScoreSyncHandlers(h) { Object.assign(handlers, h) }

export function syncScoresNow() {
  return flushQueue(supabase, {
    onSynced: x => handlers.onSynced?.(x),
    onRejected: (x, e) => handlers.onRejected?.(x, e),
  })
}

export function useScoreSync() {
  const [pending, setPending] = useState(() => getQueue().length)
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false))

  useEffect(() => subscribeQueue(list => setPending(list.length)), [])

  useEffect(() => {
    const goOnline = () => { setOnline(true); syncScoresNow() }
    const goOffline = () => setOnline(false)
    const onVisible = () => { if (document.visibilityState === 'visible') syncScoresNow() }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    document.addEventListener('visibilitychange', onVisible)
    syncScoresNow() // anything left over from last time
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  // While something is waiting, keep retrying (the phone's online flag isn't
  // always accurate in a weak-signal spot).
  useEffect(() => {
    if (!pending) return
    const id = setInterval(() => { syncScoresNow() }, 15000)
    return () => clearInterval(id)
  }, [pending])

  return { pending, online }
}
