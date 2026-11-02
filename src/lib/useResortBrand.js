// React hooks for resort (white-label) branding. See brand.js and
// migration 20260680_resorts.sql. Everything degrades to plain Trip Clubhouse
// branding when the migration isn't applied or the trip has no resort.
import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { brandThemeVars } from './brand'

// The resort a trip is linked to (trips.resort_id), or null.
export function useTripResort(trip) {
  const resortId = trip?.resort_id || null
  const [loaded, setLoaded] = useState({ id: null, resort: null })
  useEffect(() => {
    if (!resortId) return
    let cancelled = false
    supabase.from('resorts').select('*').eq('id', resortId).maybeSingle()
      .then(({ data }) => { if (!cancelled) setLoaded({ id: resortId, resort: data || null }) })
    return () => { cancelled = true }
  }, [resortId])
  return resortId && loaded.id === resortId ? loaded.resort : null
}

// Branding for an invite link, readable before sign-in. Resolves to
// { trip_name, resort_name, tagline, logo_url, primary_color, accent_color } or null.
export function useInviteResort(inviteToken) {
  const [loaded, setLoaded] = useState({ token: null, brand: null })
  useEffect(() => {
    if (!inviteToken) return
    let cancelled = false
    supabase.rpc('resort_branding_for_invite', { p_invite_token: inviteToken })
      .then(({ data }) => {
        if (cancelled) return
        const row = Array.isArray(data) ? data[0] : null
        setLoaded({ token: inviteToken, brand: row ? { ...row, name: row.resort_name } : null })
      })
    return () => { cancelled = true }
  }, [inviteToken])
  return inviteToken && loaded.token === inviteToken ? loaded.brand : null
}

// Re-theme the app for a resort (club) while the calling screen is mounted;
// on unmount the app-brand colors from index.css (:root) take over again.
export function useApplyResortTheme(resort) {
  const primary = resort?.primary_color
  const accent = resort?.accent_color
  useEffect(() => {
    const vars = brandThemeVars({ primary_color: primary, accent_color: accent })
    const keys = Object.keys(vars)
    if (!keys.length) return
    const root = document.documentElement
    keys.forEach(k => root.style.setProperty(k, vars[k]))
    return () => { keys.forEach(k => root.style.removeProperty(k)) }
  }, [primary, accent])
}
