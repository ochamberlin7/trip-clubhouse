import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
})
