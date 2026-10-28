import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { getQueue, subscribeQueue, flushQueue } from './scoreQueue'

// Offline score sync.
//   useScoreSyncEngine() — mounted ONCE for the signed-in app (AppShell): sends
//     queued scores on reconnect, on returning to the app, and every 15s while
//     anything is waiting — whatever screen is open.
//   useScoreSync() — read-only { pending, online } for the live dot / No signal tab.
// Listeners passed via setScoreSyncHandlers get each sent / rejected entry (the
// Score tab uses them to broadcast to other viewers).
const handlers = { onSynced: null, onRejected: null }
export function setScoreSyncHandlers(h) { Object.assign(handlers, h) }

export function syncScoresNow() {
  return flushQueue(supabase, {
    onSynced: x => handlers.onSynced?.(x),
    onRejected: (x, e) => handlers.onRejected?.(x, e),
  })
}

const isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false)

export function useScoreSync() {
  const [pending, setPending] = useState(() => getQueue().length)
  const [online, setOnline] = useState(isOnline)
  useEffect(() => subscribeQueue(list => setPending(list.length)), [])
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return { pending, online }
}

export function useScoreSyncEngine() {
  const { pending } = useScoreSync()
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') syncScoresNow() }
    window.addEventListener('online', syncScoresNow)
    document.addEventListener('visibilitychange', onVisible)
    syncScoresNow() // anything left over from last time
    return () => {
      window.removeEventListener('online', syncScoresNow)
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
}
