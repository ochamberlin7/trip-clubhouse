import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[supabase] Missing env vars — check .env.local')
}

export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder',
  {
    auth: {
      // Keep PWA users logged in indefinitely: the session is persisted in
      // localStorage under a stable storageKey so it survives tab closes and phone
      // restarts, and autoRefreshToken silently refreshes the access token. Users stay
      // signed in until they explicitly sign out or clear browser storage.
      //
      // DASHBOARD CONFIG (Authentication → Sessions) required for true "stay logged
      // in until sign out":
      //   • Access token (JWT) expiry      → 3600 s (1 hr; short-lived by design)
      //   • Time-box user sessions         → OFF / 0  (no maximum session length)
      //   • Inactivity timeout             → OFF / 0  (don't expire idle sessions)
      //   • Refresh token rotation         → ENABLED
      //   • Refresh token reuse interval   → 10 s (keep ≥10; 0 causes multi-tab races)
      // The rotating refresh token then keeps issuing new access tokens forever.
      // AuthContext also calls refreshSession() if getSession() returns null while a
      // refresh token is still on disk, so a transient null never logs the user out.
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storageKey: 'trip-clubhouse-auth',
    },
  }
)
