import { defineConfig } from 'vite'

export default defineConfig({
  base: '/lp-ots/',
  server: {
    hmr: {
      // Override the WebSocket path so it doesn't inherit the base path
      path: 'hmr',
    },
  },
})
