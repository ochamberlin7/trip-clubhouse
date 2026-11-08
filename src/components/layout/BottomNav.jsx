// Shared bottom navigation: a flat white bar with a hairline on top, labels always
// visible, and a brass rule over the active tab. Styling lives in index.css
// (.bnav / .bnav-btn). Menu is a real tab: the dashboard marks it active while the
// Menu screen is open. `onSelect(id)` handles the switch.
import Icon from '../ui/Icon'

const ICONS = { dashboard: 'home', scores: 'flag', leaderboard: 'board', stats: 'bars', 'tee-times': 'calendar', menu: 'menu' }

// `menuDot` shows a small red dot on the Menu icon when another trip has unread
// trash talk (the top of the cross-trip unread cascade).
export default function BottomNav({ items, active, onSelect, menuDot = false }) {
  return (
    <nav className="bnav" aria-label="Trip sections">
      <div className="bnav-pill">
        {items.map(tab => {
          const isActive = active === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              className={`bnav-btn ${isActive ? 'active' : ''}`}
              onClick={() => onSelect(tab.id)}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="bnav-icon" style={{ position: 'relative' }}>
                <Icon name={ICONS[tab.id] || 'dots'} size={20} />
                {tab.id === 'menu' && menuDot && <span className="unread-dot" aria-label="Unread messages in another trip" />}
              </span>
              <span className="bnav-label">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
