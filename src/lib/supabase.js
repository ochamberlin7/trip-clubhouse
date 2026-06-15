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
      // DASHBOARD CONFIG (Auth → Settings) required for true "never expires":
      //   • JWT expiry  → 604800 (7 days, the maximum)
      //   • Refresh token rotation → enabled
      // The refresh token then keeps issuing new access tokens past the JWT expiry.
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storageKey: 'trip-clubhouse-auth',
    },
  }
)
