import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase, uniqueChannelName } from '../lib/supabase'
import { useResumeRefetch } from '../lib/useResumeRefetch'
import { playerName, firstName } from '../lib/scoring'
import { computePlayerStats } from '../lib/playerStats'
import { rankRows } from '../lib/statRanks'
import { shortNameResolver } from '../lib/playerNames'

// ── Trip Stats ────────────────────────────────────────────────────
// All scoring reuses src/lib/scoring.js — no duplicate/divergent logic:
//   • Card 1 (mode-independent): the per-hole best-ball net point calc
//     (matchPlayPointsByPlayer) drives BOTH tournament types — only the label
//     differs (Standard Match Play → "Holes Won", Point Match Play →
//     "Points Won"). On each hole the winning side's best-net player(s) score
//     (both when tied for low); it's net-based by definition and never reads the
//     Gross/Net toggle.
//   • Gross/Net cards (eagles/birdies/…/best-worst round): each player's diff vs
//     par per hole, tracked INDEPENDENTLY for gross (raw − par) and net (net −
//     par). Net uses the SAME match-play shots as the scorecard dots — strokes
//     off the pairing's low player — so "net birdies" here agree with the dots
//     shown on the card (not each player's full playing handicap).
//   • Best/Worst round: 18-hole totals for complete 18-hole rounds only, tracked
//     independently per mode (best gross round ≠ best net round in general).

// Per-player stat math lives in src/lib/playerStats.js (shared with the Home
// Daily Leaders card) — see computePlayerStats there.

// Category tabs (Drinks last). Each tab shows a 2-col grid of stat tiles.
const STAT_TABS = ['Scoring', 'Fire', 'Rounds', 'Drinks']

// Title colour says what kind of stat it is (same as Daily Leaders): green =
// bragging rights, red = the roast, gold = drinks. Titles sit on a light navy bar.
const TONE = { good: '#0F6E56', bad: '#A32D2D', drinks: '#92600A' }
const ME_BG = '#EEF2F7' // the viewer's own row in "See all"

function StatHeaderBar({ title, tone = 'good', onClose }) {
  return (
    <div className="stat-tile-header" style={{ color: TONE[tone] }}>
      <span className="stat-tile-title">{title}</span>
      {onClose && <button className="stat-modal-close" aria-label="Close" onClick={onClose}>✕</button>}
    </div>
  )
}

function TopRow({ row, short }) {
  return (
    <div className="stat-tile-row">
      <span className="stat-tile-rank">{row.rank ?? '–'}</span>
      <span className="stat-tile-name">{short(row.item.name)}</span>
      <span className="stat-tile-val">{row.v == null ? '—' : row.v}</span>
    </div>
  )
}

// "See all": every player in one table. Split stats show Gross and Net columns
// (value + small rank) — tap a header to sort by it. The viewer's row is highlighted.
function SeeAllModal({ title, tone, players, cols, isMe, onClose }) {
  const [sortKey, setSortKey] = useState(cols[0].key)
  const nameOf = p => p.name || ''
  const ranked = useMemo(() => {
    const byCol = {}
    for (const c of cols) {
      byCol[c.key] = new Map(rankRows(players, c.valueOf, { hi: c.hi, nameOf }).map(r => [r.item.id, r]))
    }
    const order = rankRows(players, cols.find(c => c.key === sortKey).valueOf, { hi: cols.find(c => c.key === sortKey).hi, nameOf })
    return order.map(r => ({ p: r.item, cells: cols.map(c => byCol[c.key].get(r.item.id)) }))
  }, [players, cols, sortKey])
  const multi = cols.length > 1
  return createPortal(
    <div className="stat-modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="stat-modal-sheet" onClick={e => e.stopPropagation()}>
        <StatHeaderBar title={title} tone={tone} onClose={onClose} />
        <div className="stat-modal-list">
          <table className="stat-table">
            <thead>
              <tr>
                <th>Player</th>
                {cols.map(c => (
                  <th key={c.key} className={multi && sortKey === c.key ? 'on' : undefined}>
                    {multi
                      ? <button className="stat-sort" onClick={() => setSortKey(c.key)}>{c.label}{sortKey === c.key ? ' ▾' : ''}</button>
                      : c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranked.map(({ p, cells }) => (
                <tr key={p.id} style={isMe(p) ? { background: ME_BG } : undefined}>
                  <td className="stat-table-name">{p.name}</td>
                  {cells.map((cell, i) => (
                    <td key={cols[i].key} className="stat-table-val">
                      {cell?.v == null ? '—' : cell.v}
                      {multi && cell?.rank != null && <span className="stat-table-rank">{cell.rank}</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// One stat tile. `cols` = [{ key, label, valueOf, hi }]: one column for a single
// stat (Points Won, Fire…), two (Gross, Net) for a split stat. Shows each column's
// top 3 and a "See all ›" link. `anyScore` gates it to "No data yet".
function StatTile({ title, tone, cols, players, anyScore, short, isMe }) {
  const [open, setOpen] = useState(false)
  const split = cols.length > 1
  const nameOf = p => p.name || ''
  const tops = cols.map(c => rankRows(players, c.valueOf, { hi: c.hi, nameOf }).slice(0, 3))
  return (
    <div className="stat-tile" style={split ? { gridColumn: '1 / -1' } : undefined}>
      <StatHeaderBar title={title} tone={tone} />
      {!anyScore ? (
        <div className="stat-empty">No data yet</div>
      ) : (
        <>
          <div className={split ? 'stat-split' : undefined}>
            {cols.map((c, i) => (
              <div key={c.key} className={split ? 'stat-split-col' : undefined}>
                {split && <div className="stat-split-mode">{c.label}</div>}
                {tops[i].map(row => <TopRow key={row.item.id} row={row} short={short} />)}
              </div>
            ))}
          </div>
          {players.length > 3 && (
            <button className="stat-tile-seeall" onClick={() => setOpen(true)}>See all ›</button>
          )}
        </>
      )}
      {open && <SeeAllModal title={title} tone={tone} players={players} cols={cols} isMe={isMe} onClose={() => setOpen(false)} />}
    </div>
  )
}

export default function StatsTab({ trip, rounds = [], isCommissioner, currentUserId }) {
  const [data, setData] = useState(null)
  const [openDrinkPopup, setOpenDrinkPopup] = useState(null) // trip_player_id
  const [refreshTick, setRefreshTick] = useState(0) // bumped by realtime score changes + resume to refetch
  const [tab, setTab] = useState('Scoring') // category tab (session-only)
  const tilesRef = useRef(null)             // swipe viewport → change tab
  const swipeRef = useRef({ x0: 0, y0: 0, did: false, decided: false, horiz: false })
  const panelRefs = useRef([])              // one per tab panel, for height measuring
  const [drag, setDrag] = useState(0)       // live finger offset (px) during a swipe
  const [dragging, setDragging] = useState(false) // disables the snap transition while dragging
  const [panelHeights, setPanelHeights] = useState([]) // measured px height per panel
  const allowance = trip?.handicap_allowance ?? 100

  const roundIds = rounds.map(r => r.id)
  const roundKey = roundIds.join(',')

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!trip?.id) { if (!cancelled) setData({ tripPlayers: [], profileMap: {}, scores: [], courseHoles: [], pairings: [], pairingPlayers: [], playerRounds: [], drinks: [] }); return }

      // Players load ALWAYS (the drink leaderboard is independent of scoring).
      const { data: tpData } = await supabase.from('trip_players')
        .select('id, user_id, claimed_user_id, first_name, last_name, guest_name, handicap_index, team_id, manual_drinks').eq('trip_id', trip.id)
      const tripPlayers = tpData || []
      const userIds = tripPlayers.map(p => p.user_id).filter(Boolean)
      const profileMap = {}
      if (userIds.length) {
        const { data: profs } = await supabase.from('profiles').select('id, display_name').in('id', userIds)
        if (profs) profs.forEach(p => { profileMap[p.id] = p.display_name })
      }

      // Round-scoped scoring data — empty when the trip has no rounds yet.
      let scores = [], courseHoles = [], pairings = [], pairingPlayers = [], playerRounds = [], drinks = []
      if (roundIds.length) {
        const [scoresRes, holesRes, pairingsRes, prRes, drinksRes] = await Promise.all([
          supabase.from('scores').select('round_id, hole_number, trip_player_id, gross_score').in('round_id', roundIds),
          supabase.from('course_holes').select('round_id, hole_number, par, stroke_index').in('round_id', roundIds),
          supabase.from('pairings').select('id, round_id, pairing_number, team1_id, team2_id').in('round_id', roundIds),
          supabase.from('player_rounds').select('trip_player_id, round_id, tee_name, slope, rating, par').in('round_id', roundIds),
          supabase.from('drinks').select('trip_player_id, count').in('round_id', roundIds),
        ])
        scores = scoresRes.data || []; courseHoles = holesRes.data || []
        pairings = pairingsRes.data || []; playerRounds = prRes.data || []; drinks = drinksRes.data || []
        const pairIds = pairings.map(p => p.id)
        if (pairIds.length) {
          const r = await supabase.from('pairing_players').select('id, pairing_id, trip_player_id, team_slot').in('pairing_id', pairIds)
          pairingPlayers = r.data || []
        }
      }
      if (cancelled) return
      setData({ scores, courseHoles, pairings, pairingPlayers, tripPlayers, playerRounds, drinks, profileMap })
    }
    load()
    return () => { cancelled = true }
  }, [trip?.id, roundKey, refreshTick]) // eslint-disable-line react-hooks/exhaustive-deps

  // Live updates: the 12 stat cards compute from `data.scores`, which is fetched
  // above and otherwise only refetched on trip/round change — so newly-entered
  // scores never reached them (the drink leaderboard only looked live because
  // manual_drinks updates optimistically). Subscribe to the scoring tables and
  // refetch (debounced) so the cards update as scores come in. Best Round /
  // Worst Round stay correct on their own: computePlayerStats only records them
  // for complete 18-hole rounds, so recomputing from fresh scores can't populate
  // them mid-round.
  useEffect(() => {
    if (!trip?.id || roundIds.length === 0) return
    const filter = `round_id=in.(${roundIds.join(',')})`
    let timer = null
    const bump = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => setRefreshTick(t => t + 1), 400) }
    const ch = supabase.channel(uniqueChannelName(`stats:${trip.id}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores', filter }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drinks', filter }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_rounds', filter }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pairing_players' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_players', filter: `trip_id=eq.${trip.id}` }, bump)
      .subscribe()
    return () => { if (timer) clearTimeout(timer); supabase.removeChannel(ch) }
  }, [trip?.id, roundKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Resume from background: the realtime socket may have stalled while suspended,
  // so refetch on return (covers the "switched apps and back" case).
  useResumeRefetch(() => setRefreshTick(t => t + 1))

  // Two-finger trackpad horizontal swipe over the tiles → move between category
  // tabs. Native non-passive listener so preventDefault stops the browser's
  // back/forward swipe-nav. Re-bound when `data` first renders the tiles.
  useEffect(() => {
    const el = tilesRef.current
    if (!el) return
    let settle, acc = 0
    function onWheel(e) {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
      e.preventDefault()
      acc += e.deltaX
      clearTimeout(settle)
      settle = setTimeout(() => {
        if (Math.abs(acc) > 50) {
          setTab(prev => {
            const i = STAT_TABS.indexOf(prev)
            const next = acc < 0 ? Math.max(0, i - 1) : Math.min(STAT_TABS.length - 1, i + 1)
            return STAT_TABS[next]
          })
        }
        acc = 0
      }, 90)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => { el.removeEventListener('wheel', onWheel); clearTimeout(settle) }
  }, [data])

  // Measure each carousel panel so the viewport can size to (and animate between)
  // the active panel's height — the tabs have very different content lengths.
  useLayoutEffect(() => {
    const measure = () => {
      const hs = panelRefs.current.map(el => el ? el.scrollHeight : 0)
      setPanelHeights(prev => (prev.length === hs.length && prev.every((v, i) => v === hs[i])) ? prev : hs)
    }
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    panelRefs.current.forEach(el => el && ro?.observe(el))
    window.addEventListener('resize', measure)
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure) }
  }, [data, tab, openDrinkPopup])

  const computed = useMemo(() => {
    if (!data) return null
    return computePlayerStats({ rounds, ...data }, allowance)
  }, [data, roundKey, allowance]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <div className="empty-state">Loading stats…</div>

  const players = data.tripPlayers.map(p => ({ ...p, name: playerName(p, data.profileMap) }))
  const { stats, drinkByPlayer, anyScore } = computed

  const totalDrinks = p => (drinkByPlayer.get(p.id) || 0) + (p.manual_drinks || 0)
  // Drinks descending; ties broken alphabetically by first name.
  const drinkRows = players.slice().sort((a, b) => {
    const d = totalDrinks(b) - totalDrinks(a)
    if (d !== 0) return d
    return (firstName(a.name) || a.name).localeCompare(firstName(b.name) || b.name)
  })

  // Card 1 adapts to the tournament type: Standard Match Play tracks holes won,
  // Point Match Play tracks points earned. It's mode-independent (match-play
  // scoring is always net) so the Gross/Net toggle never changes it.
  const isStandard = trip?.format === 'standard_match_play'
  const primaryCard = { title: isStandard ? 'Holes Won' : 'Points Won', icon: '+1' }

  const canEditDrinks = p => !!isCommissioner || (!!currentUserId && (p.user_id === currentUserId || p.claimed_user_id === currentUserId))

  async function adjustManual(p, delta) {
    const next = Math.max(0, (p.manual_drinks || 0) + delta)
    setData(prev => ({ ...prev, tripPlayers: prev.tripPlayers.map(x => x.id === p.id ? { ...x, manual_drinks: next } : x) }))
    await supabase.from('trip_players').update({ manual_drinks: next }).eq('id', p.id)
  }

  if (!players.length) {
    return <div className="empty-state"><span className="empty-state-icon">📊</span>No players on this trip yet.</div>
  }

  // Accessors. Counting stats default to 0; round totals ("—" when no complete
  // 18-hole round) stay null.
  const one = key => p => stats.get(p.id)?.[key] ?? 0
  const gn = (key, dash) => [
    { key: 'gross', label: 'Gross', valueOf: p => { const v = stats.get(p.id)?.gross?.[key]; return dash ? (v ?? null) : (v ?? 0) } },
    { key: 'net', label: 'Net', valueOf: p => { const v = stats.get(p.id)?.net?.[key]; return dash ? (v ?? null) : (v ?? 0) } },
  ]
  const single = (valueOf, hi = true) => [{ key: 'v', label: 'Total', valueOf, hi }]
  const both = (key, hi = true, dash = false) => gn(key, dash).map(c => ({ ...c, hi }))

  // Tiles per tab. Single stats sit two across; Gross | Net tiles run full width.
  const scoringTiles = [
    { key: 'primary', title: primaryCard.title, tone: 'good', cols: single(one('primary')) },
    // Halved holes a player saved alone (net, like Points Won).
    { key: 'defended', title: 'Points Defended', tone: 'good', cols: single(one('defended')) },
    { key: 'eagles', title: 'Eagles', tone: 'good', cols: both('eagles') },
    { key: 'birdies', title: 'Birdies', tone: 'good', cols: both('birdies') },
    { key: 'pars', title: 'Pars', tone: 'good', cols: both('pars') },
    { key: 'parsOrBetter', title: 'Pars or Better', tone: 'good', cols: both('parsOrBetter') },
    { key: 'bogeys', title: 'Bogeys', tone: 'bad', cols: both('bogeys') },
    { key: 'doubles', title: 'Doubles', tone: 'bad', cols: both('doubles') },
    { key: 'triples', title: 'Triples or Worse', tone: 'bad', cols: both('triples') },
  ]
  const fireTiles = [
    { key: 'fireStreak', title: 'Longest Fire Streak', tone: 'good', cols: single(one('fireStreak')) },
    { key: 'fireHoles', title: 'Total Fire Holes', tone: 'good', cols: single(one('fireHolesTotal')) },
  ]
  const roundsTiles = [
    { key: 'bestRound', title: 'Best Round', tone: 'good', cols: both('bestRound', false, true) },
    { key: 'worstRound', title: 'Worst Round', tone: 'bad', cols: both('worstRound', true, true) },
  ]
  // Tiles per tab (Drinks has no podium tiles — it renders its own leaderboard).
  const tilesByTab = { Scoring: scoringTiles, Fire: fireTiles, Rounds: roundsTiles, Drinks: [] }
  const short = shortNameResolver(players.map(p => p.name))
  const isMe = p => !!currentUserId && (p.user_id === currentUserId || p.claimed_user_id === currentUserId)
  const tabIndex = STAT_TABS.indexOf(tab)

  function goTab(delta) {
    const next = Math.min(STAT_TABS.length - 1, Math.max(0, tabIndex + delta))
    if (next !== tabIndex) setTab(STAT_TABS[next])
  }

  // Finger-following carousel: all four panels sit side by side in a flex track;
  // the track translates by (-tabIndex * 100%) so switching tabs slides the page.
  // A live pointer drag moves the track with the finger, then snaps to the nearest
  // tab on release — so a swipe reads as physically dragging the page.
  function onTilesPointerDown(e) {
    swipeRef.current = { x0: e.clientX, y0: e.clientY, did: false, decided: false, horiz: false }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* older browsers */ }
  }
  function onTilesPointerMove(e) {
    const s = swipeRef.current
    if (s.x0 == null) return
    const dx = e.clientX - s.x0, dy = e.clientY - s.y0
    // Decide the gesture axis once past a small deadzone. A vertical intent bows
    // out so the page scrolls normally; a horizontal one takes over the drag.
    if (!s.decided) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      s.decided = true
      s.horiz = Math.abs(dx) > Math.abs(dy)
      if (s.horiz) setDragging(true)
    }
    if (!s.horiz) return
    // Rubber-band resistance when dragging past the first/last tab.
    const overEdge = (tabIndex === 0 && dx > 0) || (tabIndex === STAT_TABS.length - 1 && dx < 0)
    setDrag(overEdge ? dx * 0.35 : dx)
    if (Math.abs(dx) > 6) s.did = true
  }
  function endDrag(e) {
    const s = swipeRef.current
    if (s.horiz) {
      const dx = e.clientX - s.x0
      const w = tilesRef.current?.offsetWidth || 320
      // Commit to the next/prev tab past ~22% of the width (or a firm 60px flick).
      if (Math.abs(dx) > Math.min(60, w * 0.22)) goTab(dx < 0 ? 1 : -1)
    }
    setDrag(0)
    setDragging(false)
    swipeRef.current = { ...s, x0: null }
  }
  // Cancel the click that follows a horizontal swipe so it doesn't also trigger a
  // "See all" / drink-edit tap on whatever the drag started over.
  function onTilesClickCapture(e) {
    if (swipeRef.current.did) { e.stopPropagation(); e.preventDefault(); swipeRef.current.did = false }
  }

  // Content for one tab panel: optional Gross/Net toggle + the tab's tiles, plus
  // the Drink Leaderboard on the Drinks tab.
  function renderPanelInner(tabName) {
    const tiles = tilesByTab[tabName]
    return (
      <>
        <div className="stat-tiles-grid">
          {tiles.map(t => (
            <StatTile key={t.key} title={t.title} tone={t.tone} cols={t.cols} anyScore={anyScore} players={players} short={short} isMe={isMe} />
          ))}

          {tabName === 'Drinks' && (
            <div className="stat-tile" style={{ gridColumn: '1 / -1' }}>
              <StatHeaderBar title="Drink Leaderboard" tone="drinks" />
              {drinkRows.map((p, i) => {
                const editable = canEditDrinks(p)
                const open = openDrinkPopup === p.id
                return (
                  <div className="stat-tile-row" key={p.id} style={{ position: 'relative' }}>
                    <span className="stat-tile-rank">{i + 1}</span>
                    {editable ? (
                      <button
                        className="stat-tile-name"
                        style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
                        onClick={() => setOpenDrinkPopup(open ? null : p.id)}
                      >
                        {firstName(p.name) || p.name}
                      </button>
                    ) : (
                      <span className="stat-tile-name">{firstName(p.name) || p.name}</span>
                    )}
                    <span className="stat-tile-val">{totalDrinks(p)}</span>
                    {open && (
                      <>
                        {/* Tap anywhere else to close. */}
                        <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setOpenDrinkPopup(null)} />
                        <div className="drink-inline-popup open">
                          <button className="dip-btn" aria-label="Remove a drink" onClick={() => adjustManual(p, -1)}>−</button>
                          <span className="dip-val">{p.manual_drinks || 0}</span>
                          <button className="dip-btn" aria-label="Add a drink" onClick={() => adjustManual(p, +1)}>+</button>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </>
    )
  }

  // Viewport height follows the active panel; while dragging it grows to fit the
  // incoming neighbor too, so a taller tab isn't clipped mid-swipe.
  const restH = panelHeights[tabIndex] || 0
  const neighborIdx = drag < 0 ? tabIndex + 1 : tabIndex - 1
  const dragTargetH = dragging && neighborIdx >= 0 && neighborIdx < STAT_TABS.length ? (panelHeights[neighborIdx] || 0) : 0
  const viewportH = Math.max(restH, dragTargetH)

  return (
    <div>

      {/* Category tabs — ABOVE the Gross/Net selector; horizontal scroll, Drinks last. */}
      <div className="stat-tabs" role="tablist" aria-label="Stat categories">
        {STAT_TABS.map(t => (
          <button key={t} role="tab" aria-selected={tab === t} className={`stat-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {/* Swipe carousel: all four tab panels sit side by side in a flex track. The
          track translates by (-tabIndex * 100%) and follows the finger during a
          drag, so paging between tabs slides the page instead of swapping values in
          place. The viewport clips horizontally and sizes to the active panel's
          height (animated). A per-panel min-height keeps short tabs full-screen. */}
      <div
        ref={tilesRef}
        style={{ overflow: 'hidden', touchAction: 'pan-y', height: viewportH ? viewportH : undefined, transition: dragging ? 'none' : 'height 280ms cubic-bezier(.22,.61,.36,1)' }}
        onPointerDown={onTilesPointerDown}
        onPointerMove={onTilesPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onTilesClickCapture}
      >
        <div
          style={{
            display: 'flex',
            width: `${STAT_TABS.length * 100}%`,
            transform: `translateX(calc(${-tabIndex * (100 / STAT_TABS.length)}% + ${drag}px))`,
            transition: dragging ? 'none' : 'transform 300ms cubic-bezier(.22,.61,.36,1)',
            alignItems: 'flex-start',
          }}
        >
          {STAT_TABS.map((t, i) => (
            <div
              key={t}
              ref={el => { panelRefs.current[i] = el }}
              aria-hidden={t !== tab}
              style={{ flex: `0 0 ${100 / STAT_TABS.length}%`, width: `${100 / STAT_TABS.length}%`, minWidth: 0, minHeight: 'calc(100dvh - 190px)', boxSizing: 'border-box' }}
            >
              {renderPanelInner(t)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
