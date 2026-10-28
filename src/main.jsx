import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { registerServiceWorker } from './lib/push'
import { applyTeamColorVars } from './lib/teamColors'

// Publish team colours (--team-1 … --team-6) before first paint so stylesheet rules
// paint team-coloured elements from the single palette in lib/teamColors.js.
applyTeamColorVars()

// Register the service worker (push notifications + a copy of the app so it opens
// with no signal — network-first for the page, see public/sw.js). It does NOT prompt
// for notifications (that's requested contextually later) and does nothing on
// browsers without SW support.
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
