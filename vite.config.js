import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Dev-only middleware that mirrors the Netlify golf-course-proxy function, so
// `npm run dev` can serve course search without needing `netlify dev`. In
// production the real Netlify function at the same path handles these calls.
function golfProxyDevPlugin(apiKey) {
  const BASE = 'https://api.golfcourseapi.com'
  return {
    name: 'golf-proxy-dev',
    configureServer(server) {
      server.middlewares.use('/.netlify/functions/golf-course-proxy', async (req, res) => {
        try {
          const url = new URL(req.url, 'http://localhost')
          const endpoint = url.searchParams.get('endpoint')
          let target
          if (endpoint === 'search') {
            target = `${BASE}/v1/search?search_query=${encodeURIComponent(url.searchParams.get('search_query') || '')}`
          } else if (endpoint === 'course') {
            target = `${BASE}/v1/courses/${encodeURIComponent(url.searchParams.get('id') || '')}`
          } else {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Unknown endpoint' }))
            return
          }
          if (!apiKey) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'GOLF_API_KEY not set in .env.local' }))
            return
          }
          const r = await fetch(target, { headers: { Authorization: `Key ${apiKey}` } })
          const body = await r.text()
          res.statusCode = r.status
          res.setHeader('Content-Type', 'application/json')
          res.end(body)
        } catch {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Proxy request failed' }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // Load all env (including non-VITE_ vars like GOLF_API_KEY) for the dev proxy.
  const env = loadEnv(mode, process.cwd(), '')
  const golfKey = env.GOLF_API_KEY || env.VITE_GOLF_API_KEY

  return {
    plugins: [react(), golfProxyDevPlugin(golfKey)],
    server: {
      port: 5173,
      strictPort: true,
      // hmr:false is the only way to skip Fast Refresh in @vitejs/plugin-react v6.
      // Without it the plugin injects a self-import on every HMR cycle whose
      // timestamp differs from the cached module, causing the ESM loader to report
      // "does not provide an export named 'useAuth'" on every page load.
      hmr: false,
      watch: {
        ignored: ['**/package.json', '**/package-lock.json'],
      },
    },
  }
})
