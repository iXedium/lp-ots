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

// ── Texture-manifest virtual module ──────────────────────────────────────────
// Exports a Set of filenames in public/textures/ so autoMaterial can do O(1)
// lookups instead of firing hundreds of HEAD requests at runtime.
const TEX_VIRTUAL_ID  = 'virtual:texture-manifest'
const TEX_RESOLVED_ID = '\0' + TEX_VIRTUAL_ID

function textureManifestPlugin() {
  let serverRef
  const texDir = resolve(__dirname, 'public/textures')
  const scan = () => {
    try { return readdirSync(texDir).filter(f => /\.(ktx2|webp|png|jpg|jpeg)$/i.test(f)) }
    catch { return [] }
  }
  const refresh = (file) => {
    if (!serverRef || !/\.(ktx2|webp|png|jpg|jpeg)$/i.test(file)) return
    const mod = serverRef.moduleGraph.getModuleById(TEX_RESOLVED_ID)
    if (mod) serverRef.moduleGraph.invalidateModule(mod)
    serverRef.ws.send({ type: 'full-reload' })
  }
  return {
    name: 'texture-manifest',
    resolveId(id) { if (id === TEX_VIRTUAL_ID) return TEX_RESOLVED_ID },
    load(id) {
      if (id !== TEX_RESOLVED_ID) return null
      return `export default new Set(${JSON.stringify(scan())})`
    },
    configureServer(server) {
      serverRef = server
      server.watcher.add(texDir)
      server.watcher.on('add', refresh)
      server.watcher.on('unlink', refresh)
    },
  }
}

function modelListPlugin() {
  let serverRef
  const refreshModelList = (file) => {
    if (!serverRef || !/\.glb$/i.test(file)) return
    const mod = serverRef.moduleGraph.getModuleById(RESOLVED_ID)
    if (mod) serverRef.moduleGraph.invalidateModule(mod)
    serverRef.ws.send({ type: 'full-reload' })
  }

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
      serverRef = server
      // Full-page reload when a new .glb is dropped into public/models
      server.watcher.add(resolve(__dirname, 'public/models'))
      server.watcher.on('add', refreshModelList)
      server.watcher.on('change', refreshModelList)
      server.watcher.on('unlink', refreshModelList)
    },
  }
}

export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/' : '/lp-ots/',
  optimizeDeps: {
    include: [
      '@babylonjs/inspector',
      '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent',
      '@babylonjs/materials/custom/pbrCustomMaterial',
      '@babylonjs/core/Materials/Textures/Loaders/ktxTextureLoader',
    ],
  },
  server: {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
    watch: {
      // Watch public dir for texture/model changes
      usePolling: false,
    },
  },
  // Disable dep pre-bundle caching — forces fresh builds every dev start
  cacheDir: '.vite_cache',
  plugins: [
    modelListPlugin(),
    textureManifestPlugin(),
    // Force no-cache on every response (including static/public assets)
    // Wraps writeHead to override any cache headers set by Vite's sirv
    {
      name: 'no-cache',
      configureServer(server) {
        server.middlewares.use((_req, res, next) => {
          const origWriteHead = res.writeHead.bind(res)
          res.writeHead = function (statusCode, ...args) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
            res.setHeader('Pragma', 'no-cache')
            res.setHeader('Expires', '0')
            return origWriteHead(statusCode, ...args)
          }
          next()
        })
      },
    },
  ],
}))
