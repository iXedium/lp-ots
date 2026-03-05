import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  // '/' in dev so HMR WebSocket works at root; '/lp-ots/' in build for GH Pages
  base: command === 'serve' ? '/' : '/lp-ots/',
  optimizeDeps: {
    // Pre-bundle inspector so dynamic import() doesn't trigger dep reoptimization
    include: ['@babylonjs/inspector'],
  },
}))
