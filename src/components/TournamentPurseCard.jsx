import { useEffect, useState } from 'react'
import { supabase, uniqueChannelName } from '../lib/supabase'
import { loadPurseStandings, computePurse, formatMoney } from '../lib/purse'

// Tournament Purse — Home-screen widget. Shows who owes the purse based on
// match-play standings. Only appears when the commissioner has toggled
// "Show on Home". Three states: a rule blurb before any round is complete;
// standings-only when no amount is set; the full per-player breakdown once set.
// After the trip ends it stays only if an amount was ever set.

function todayIsoLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const NAVY = '#1B3F6E'
const GREY = '#8a96a3'
const RED = '#C0392B'
const styles = {
  card: { background: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '16px', overflow: 'hidden' },
  header: { background: NAVY, color: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  headerTitle: { fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' },
  headerAmount: { fontSize: '14px', fontWeight: 800 },
  body: { padding: '16px' },
  rule: { fontSize: '13px', color: GREY, lineHeight: 1.5 },
  status: { fontSize: '13px', fontWeight: 600 },
  holes: { fontSize: '12px', color: GREY, marginTop: '4px' },
  note: { fontSize: '11px', color: '#b0b8c1', fontStyle: 'italic', marginTop: '10px' },
  playerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderTop: '1px solid #f0f3f7' },
  playerName: { fontSize: '13px', fontWeight: 600, color: NAVY },
  playerShare: { fontSize: '13px', fontWeight: 600, color: RED },
  teamLabel: { fontSize: '11px', color: GREY, fontStyle: 'italic', padding: '10px 16px', borderTop: '1px solid #f0f3f7' },
}

export default function TournamentPurseCard({ tripId, endDate, allowance = 100 }) {
  const [st, setSt] = useState({ status: 'loading' })
  const [tick, setTick] = useState(0)

  // Live: recompute on score / trip (amount + toggle) / handicap changes.
  useEffect(() => {
    let t = null
    const bump = () => { if (t) clearTimeout(t); t = setTimeout(() => setTick(x => x + 1), 400) }
    const ch = supabase.channel(uniqueChannelName(`purse-${tripId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips', filter: `id=eq.${tripId}` }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_players', filter: `trip_id=eq.${tripId}` }, bump)
      .subscribe()
    return () => { if (t) clearTimeout(t); supabase.removeChannel(ch) }
  }, [tripId])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: trip } = await supabase
        .from('trips').select('purse_amount, show_purse_on_home').eq('id', tripId).single()
      const showOnHome = !!trip?.show_purse_on_home
      const amount = Number(trip?.purse_amount) || 0
      if (!showOnHome) { if (!cancelled) setSt({ status: 'hidden' }); return }

      const standings = await loadPurseStandings(supabase, tripId, allowance)
      const purse = computePurse({ ...standings, amount })
      if (cancelled) return
      setSt({ status: 'ready', showOnHome, amount, hasStandings: standings.hasStandings, purse })
    }
    load()
    return () => { cancelled = true }
  }, [tripId, allowance, tick])

  if (st.status !== 'ready') return null

  const { amount, hasStandings, purse } = st
  const amountSet = amount > 0
  const tripOver = !!endDate && todayIsoLocal() > endDate

  // Home visibility: hidden if toggled off; after the trip, only kept if an
  // amount was ever set (otherwise the Trip Summary takes over).
  if (!st.showOnHome) return null
  if (tripOver && !amountSet) return null
  if (!purse.valid) return null // needs the app's two-team setup

  const headerAmount = `$${formatMoney(amount)}` // defaults to "$0" when unset

  // State 1 — before any round is complete: static rule blurb.
  if (!hasStandings) {
    return (
      <div style={styles.card}>
        <div style={styles.header}>
          <span style={styles.headerTitle}>Tournament Purse</span>
          <span style={styles.headerAmount}>{headerAmount}</span>
        </div>
        <div style={styles.body}>
          <div style={styles.rule}>The losing team pays the purse.</div>
        </div>
      </div>
    )
  }

  const { perShare } = purse

  // State 2 — standings exist, no amount set yet: prompt the commissioner.
  if (!amountSet) {
    return (
      <div style={styles.card}>
        <div style={styles.header}>
          <span style={styles.headerTitle}>Tournament Purse</span>
          <span style={styles.headerAmount}>{headerAmount}</span>
        </div>
        <div style={styles.body}>
          <div style={styles.note}>Commissioner: set the purse amount to show each player's share.</div>
        </div>
      </div>
    )
  }

  // State 3 — amount set: each owing player's share as a red negative amount.
  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>Tournament Purse</span>
        <span style={styles.headerAmount}>{headerAmount}</span>
      </div>
      {purse.splitPlayers.map(p => (
        <div key={p.id} style={styles.playerRow}>
          <span style={styles.playerName}>{p.name}</span>
          <span style={styles.playerShare}>-${formatMoney(perShare)}</span>
        </div>
      ))}
    </div>
  )
}
