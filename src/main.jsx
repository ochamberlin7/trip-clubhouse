import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'

const bootMsg = document.getElementById('boot-msg')

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Fatal: no #root element in index.html')

createRoot(rootEl).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)

if (bootMsg) bootMsg.style.display = 'none'
