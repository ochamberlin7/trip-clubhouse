import { useEffect, useRef } from 'react'

// Fire `onResume` whenever the app returns to the foreground — the tab becomes
// visible again (visibilitychange) or the window regains focus (focus).
//
// Why: when the OS backgrounds/suspends a PWA, the Supabase realtime websocket
// stalls silently — no CHANNEL_ERROR/CLOSED fires, so the client still believes
// it's subscribed and delivers no further updates. In-app navigation masks this
// because components remount and refetch; but after an OS background/resume with
// no navigation, data goes stale. `onResume` should refetch current data (and,
// where relevant, re-establish the subscription).
//
// The callback is kept in a ref so listeners bind once and always call the
// latest closure (no re-bind churn when the callback identity changes).
export function useResumeRefetch(onResume) {
  const cbRef = useRef(onResume)
  cbRef.current = onResume
  useEffect(() => {
    function handle() {
      // visibilitychange also fires on hide — only act when we're visible again.
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      cbRef.current?.()
    }
    document.addEventListener('visibilitychange', handle)
    window.addEventListener('focus', handle)
    return () => {
      document.removeEventListener('visibilitychange', handle)
      window.removeEventListener('focus', handle)
    }
  }, [])
}
