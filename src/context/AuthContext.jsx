import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

// Pull a refresh token out of the persisted auth blob (storageKey in supabase.js).
// supabase-js v2 stores the session object directly; older shapes nest it under
// `currentSession`. Used to recover a session when getSession() momentarily
// returns null but a valid refresh token is still on disk.
function storedRefreshToken() {
  try {
    const raw = localStorage.getItem('trip-clubhouse-auth')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.refresh_token || parsed?.currentSession?.refresh_token || null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    const apply = (s) => {
      if (!active) return
      setSession(s)
      setUser(s?.user ?? null)
      setLoading(false)
    }

    // Subscribe first so a TOKEN_REFRESHED emitted by refreshSession() below is
    // captured. Only an explicit SIGNED_OUT clears the user; TOKEN_REFRESHED /
    // USER_UPDATED / SIGNED_IN carry a fresh session and must never log out. A
    // non-sign-out event that somehow arrives with a null session is ignored
    // (we keep the current user) so a transient refresh blip can't sign you out.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return
      if (event === 'SIGNED_OUT') {
        setSession(null)
        setUser(null)
        setLoading(false)
        return
      }
      if (nextSession) {
        setSession(nextSession)
        setUser(nextSession.user ?? null)
      }
      setLoading(false)
    })

    ;(async () => {
      const { data: { session: current } } = await supabase.auth.getSession()
      if (current) {
        // getSession() trusts the token cached in localStorage without asking the
        // server — so a JWT for a since-deleted user (e.g. the DB was wiped) would
        // still read as "logged in" until it expires, dropping the user into the
        // app instead of login. Validate against the server: getUser() rejects a
        // stale/invalid token. On a definitive auth failure (401/403) clear the
        // stale session and route to login; on a network error keep the cached
        // session so offline/transient blips don't log a real user out.
        let stale = false
        try {
          const { data: ud, error: ue } = await supabase.auth.getUser()
          if ((ue && (ue.status === 401 || ue.status === 403)) || (!ue && !ud?.user)) stale = true
        } catch { /* network error — trust the cached session */ }
        if (!active) return
        if (stale) { await supabase.auth.signOut(); apply(null); return }
        apply(current)
        return
      }

      // getSession() returned null. If a refresh token still exists in storage,
      // try to recover the session before concluding the user is logged out —
      // this is what stops the "logged out once a day" behaviour.
      if (storedRefreshToken()) {
        const { data, error } = await supabase.auth.refreshSession()
        if (!active) return
        if (!error && data?.session) { apply(data.session); return }
      }

      apply(null)
    })()

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, session, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() { return useContext(AuthContext) }
