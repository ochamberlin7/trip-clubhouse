import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react({
      // Fast Refresh injects a self-import with a mismatched timestamp on every
      // HMR cycle, which causes the browser's ESM loader to report that named
      // exports (useAuth, useGroup, etc.) don't exist — the white screen / "does
      // not provide an export" error. Disabling it makes Vite fall back to full
      // page reloads on component changes, which is stable.
      fastRefresh: false,
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/package.json', '**/package-lock.json'],
    },
  },
})
