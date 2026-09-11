// Shared floating bottom navigation — a white pill inset from the screen edges.
// Global chrome for the dashboard (rendered once); styling lives in index.css
// (.bnav / .bnav-pill / .bnav-btn). `onSelect(id)` handles the tab switch (the
// caller decides what "menu" does). The menu item is never rendered active.

function TabIcon({ id }) {
  const svg = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (id === 'dashboard')
    return <svg {...svg}><path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1z" /><path d="M9.5 21v-7h5v7" /></svg>
  if (id === 'scores')
    return <svg {...svg}><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></svg>
  if (id === 'leaderboard')
    return <svg {...svg}><rect x="2" y="3" width="20" height="13" rx="1" /><line x1="9" y1="3" x2="9" y2="16" /><line x1="16" y1="3" x2="16" y2="16" /><line x1="2" y1="7" x2="22" y2="7" /><line x1="2" y1="10" x2="22" y2="10" /><line x1="2" y1="13" x2="22" y2="13" /><line x1="8" y1="16" x2="8" y2="21" /><line x1="16" y1="16" x2="16" y2="21" /><line x1="5" y1="21" x2="11" y2="21" /><line x1="13" y1="21" x2="19" y2="21" /></svg>
  if (id === 'stats')
    return <svg {...svg}><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
  if (id === 'tee-times')
    return <svg {...svg}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
  if (id === 'menu')
    return <svg {...svg}><path d="M4 6h16M4 12h16M4 18h16" /></svg>
  return null
}

export default function BottomNav({ items, active, onSelect }) {
  return (
    <nav className="bnav">
      <div className="bnav-pill">
        {items.map(tab => {
          const isActive = tab.id !== 'menu' && active === tab.id
          return (
            <button
              key={tab.id}
              className={`bnav-btn ${isActive ? 'active' : ''}`}
              onClick={() => onSelect(tab.id)}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="bnav-icon"><TabIcon id={tab.id} /></span>
              <span className="bnav-label">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
