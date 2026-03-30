import { defineConfig } from 'vite'
import { readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)

// Virtual module: exports an array of .glb filenames found in public/models/
// Usage in JS:  import modelFiles from 'virtual:model-list'
const VIRTUAL_ID  = 'virtual:model-list'
const RESOLVED_ID = '\0' + VIRTUAL_ID

function modelListPlugin() {
  return {
    name: 'model-list',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
    },
    load(id) {
      if (id !== RESOLVED_ID) return null
      const dir = resolve(__dirname, 'public/models')
      let files = []
      try { files = readdirSync(dir).filter(f => /\.glb$/i.test(f)) } catch {}
      return `export default ${JSON.stringify(files)}`
    },
    configureServer(server) {
      // Full-page reload when a new .glb is dropped into public/models
      server.watcher.add(resolve(__dirname, 'public/models'))
      server.watcher.on('add', (file) => {
        if (/\.glb$/i.test(file)) {
          const mod = server.moduleGraph.getModuleById(RESOLVED_ID)
          if (mod) server.moduleGraph.invalidateModule(mod)
          server.ws.send({ type: 'full-reload' })
        }
      })
    },
  }
}

export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/' : '/lp-ots/',
  optimizeDeps: {
    include: ['@babylonjs/inspector'],
  },
  plugins: [modelListPlugin()],
}))
