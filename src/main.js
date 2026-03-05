import './style.css'

// --- Babylon.js ES-module imports (v8 module-level API) ---
import { Engine }          from '@babylonjs/core/Engines/engine'
import { Scene }           from '@babylonjs/core/scene'
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { Vector3 }         from '@babylonjs/core/Maths/math.vector'
import { Texture }         from '@babylonjs/core/Materials/Textures/texture'
import { ImportMeshAsync }  from '@babylonjs/core/Loading/sceneLoader'

// Side-effect: extend Scene.prototype with createDefaultEnvironment
import '@babylonjs/core/Helpers/sceneHelpers'

// Side-effect: register glTF/GLB loader plugin
import '@babylonjs/loaders/glTF'

// Side-effect: extend Scene.prototype with debugLayer (required before inspector loads)
import '@babylonjs/core/Debug/debugLayer'

// Inspector — lazy-loaded, dev only, stripped from production build
if (import.meta.env.DEV) {
  import('@babylonjs/inspector').then(() => {
    console.log('Inspector ready — press F8 to toggle, or: window.__scene.debugLayer.show()')
  })
}

// ── Canvas & Engine ──────────────────────────────────────────────
const canvas = document.getElementById('renderCanvas')
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, true)

// ── Scene ────────────────────────────────────────────────────────
const scene = new Scene(engine)
scene.clearColor.set(0.05, 0.05, 0.08, 1)

// Expose scene globally in dev for inspector & console debugging
if (import.meta.env.DEV) {
  window.__scene = scene
  window.addEventListener('keydown', (e) => {
    // F8 toggles the Babylon.js Inspector
    if (e.key === 'F8') {
      if (scene.debugLayer.isVisible()) {
        scene.debugLayer.hide()
      } else {
        scene.debugLayer.show({ embedMode: true })
      }
    }
  })
}

// ── Camera (mobile touch: pinch-zoom, one-finger rotate, two-finger pan) ──
const camera = new ArcRotateCamera('cam', -Math.PI / 2, Math.PI / 3, 25, Vector3.Zero(), scene)
camera.attachControl(canvas, true)
camera.lowerRadiusLimit   = 2
camera.upperRadiusLimit   = 80
camera.wheelPrecision     = 20
camera.pinchPrecision     = 40
camera.panningSensibility = 200
camera.minZ = 0.1

// ── Minimal env light for PBR (no ground/skybox — baked lightmap does the rest)
scene.createDefaultEnvironment({ createGround: false, createSkybox: false })

// ── Base URL (works in dev "/" and on GitHub Pages "/lp-ots/") ───
const base = import.meta.env.BASE_URL

// ── Load GLB & apply lightmap to UV2 (using v8 module-level API) ─
const modelUrl = `${base}models/hotel-01.glb`

ImportMeshAsync(modelUrl, scene).then((result) => {
  // Frame camera on bounding box
  let min = new Vector3(Infinity, Infinity, Infinity)
  let max = new Vector3(-Infinity, -Infinity, -Infinity)
  for (const mesh of result.meshes) {
    if (!mesh.getBoundingInfo) continue
    const bi = mesh.getBoundingInfo()
    min = Vector3.Minimize(min, bi.boundingBox.minimumWorld)
    max = Vector3.Maximize(max, bi.boundingBox.maximumWorld)
  }
  camera.target = Vector3.Center(min, max)
  camera.radius = Vector3.Distance(min, max) * 0.75

  // Create lightmap texture (shared across all materials)
  // invertY = false — WebGL default flips Y; we must NOT flip baked lightmaps
  const lightmap = new Texture(`${base}models/LightMap-baked.png`, scene, false, false)
  // coordinatesIndex = 1 → UV2 (glTF TEXCOORD_1) — base textures stay on UV1
  lightmap.coordinatesIndex = 1

  // Apply lightmap to every PBR material
  for (const mesh of result.meshes) {
    if (!mesh.material) continue
    mesh.material.lightmapTexture = lightmap
    mesh.material.useLightmapAsShadowmap = true
    mesh.material.lightmapTexture.level = 1.0
  }

  console.log(`✔ Model loaded — ${result.meshes.length} meshes, lightmap on UV2 applied`)
}).catch((err) => {
  console.error('Failed to load model:', err)
})

// ── Render loop & resize ─────────────────────────────────────────
engine.runRenderLoop(() => scene.render())
window.addEventListener('resize', () => engine.resize())

// ── HMR cleanup — dispose engine on hot reload to prevent black screen ───
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    engine.dispose()
  })
}
