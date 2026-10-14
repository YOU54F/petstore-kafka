import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// `npm start` serves the UI on :3000 and proxies the APIs to the Caddy gateway (`npm run gateway`) on :4000.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:4000',
      '/websocket': { target: 'ws://localhost:4000', ws: true },
    },
  },
  build: { outDir: 'build' },
  test: {
    // The pact test talks to Pact's mock server over real HTTP, so it runs in Node rather than jsdom.
    environment: 'node',
    globals: true,
    testTimeout: 30000,
  },
})
