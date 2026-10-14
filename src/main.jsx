import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { registerServiceWorker } from './lib/push'
import { applyTeamColorVars } from './lib/teamColors'

// Publish team colours (--team-1 … --team-6) before first paint so stylesheet rules
// paint team-coloured elements from the single palette in lib/teamColors.js.
applyTeamColorVars()

// Register the push-only service worker (no caching/fetch handler — see public/sw.js).
// Harmless on load: it does NOT prompt for notifications (that's requested
// contextually later) and does nothing on browsers without SW support.
registerServiceWorker()

const bootMsg = document.getElementById('boot-msg')

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Fatal: no #root element in index.html')

createRoot(rootEl).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)

if (bootMsg) bootMsg.style.display = 'none'
