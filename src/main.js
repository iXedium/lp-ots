import './style.css'

// --- Babylon.js ES-module imports ---
import { Engine }       from '@babylonjs/core/Engines/engine'
import { Scene }        from '@babylonjs/core/scene'
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { Vector3 }      from '@babylonjs/core/Maths/math.vector'
import { SceneLoader }  from '@babylonjs/core/Loading/sceneLoader'
import { Texture }      from '@babylonjs/core/Materials/Textures/texture'

// Side-effect: extend Scene.prototype with createDefaultEnvironment
import '@babylonjs/core/Helpers/sceneHelpers'

// Side-effect: register the glTF / GLB loader plugin
import '@babylonjs/loaders/glTF'

// Inspector (lazy-loaded, dev only — excluded from production bundle)
if (import.meta.env.DEV) {
  import('@babylonjs/inspector')
}

// ── Canvas & Engine ──────────────────────────────────────────────
const canvas = document.getElementById('renderCanvas')
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, true)

// ── Scene ────────────────────────────────────────────────────────
const scene = new Scene(engine)
scene.clearColor.set(0.05, 0.05, 0.08, 1)   // near-black background

// ── Camera (mobile touch: pinch-zoom, one-finger rotate, two-finger pan) ──
const camera = new ArcRotateCamera('cam', -Math.PI / 2, Math.PI / 3, 25, Vector3.Zero(), scene)
camera.attachControl(canvas, true)
camera.lowerRadiusLimit  = 2
camera.upperRadiusLimit  = 80
camera.wheelPrecision    = 20          // slower mouse-wheel zoom
camera.pinchPrecision    = 40          // slower pinch-zoom on mobile
camera.panningSensibility = 200        // two-finger pan speed
camera.minZ = 0.1                     // near clip

// ── Minimal env light for PBR (no ground/skybox — baked lightmap does the rest)
scene.createDefaultEnvironment({ createGround: false, createSkybox: false })

// ── Inspector — open with Shift+Ctrl+Alt+I or uncomment next line ────────────
// scene.debugLayer.show();

// ── Base URL (works in dev "/" and on GitHub Pages "/lp-ots/") ───
const base = import.meta.env.BASE_URL

// ── Load GLB & apply lightmap to UV2 ─────────────────────────────
SceneLoader.ImportMeshAsync(null, `${base}models/`, 'hotel-01.glb', scene).then((result) => {
  // Adjust camera target to centre of bounding box
  let min = new Vector3(Infinity, Infinity, Infinity)
  let max = new Vector3(-Infinity, -Infinity, -Infinity)
  for (const mesh of result.meshes) {
    if (!mesh.getBoundingInfo) continue
    const bi = mesh.getBoundingInfo()
    min = Vector3.Minimize(min, bi.boundingBox.minimumWorld)
    max = Vector3.Maximize(max, bi.boundingBox.maximumWorld)
  }
  const centre = Vector3.Center(min, max)
  const diag   = Vector3.Distance(min, max)
  camera.target = centre
  camera.radius = diag * 0.75

  // Create lightmap texture once, share across materials.
  // noMipmap=false, invertY=false — GLB baked textures must NOT be Y-flipped.
  // WebGL's default is to invert Y on load; we disable that here so the baked
  // shadows/AO align with the geometry correctly.
  const lightmap = new Texture(`${base}models/LightMap-baked.png`, scene, false, false)
  // coordinatesIndex = 1 → UV2 (TEXCOORD_1 in glTF) — not the base texture UV
  lightmap.coordinatesIndex = 1

  // Apply lightmap to every mesh that has a PBR material
  for (const mesh of result.meshes) {
    if (!mesh.material) continue
    mesh.material.lightmapTexture = lightmap
    mesh.material.useLightmapAsShadowmap = true
    mesh.material.lightmapTexture.level = 1.0   // shadow intensity (0 = none, 1 = full)
  }

  console.log(`✔ Model loaded — ${result.meshes.length} meshes, lightmap on UV2 applied`)
}).catch((err) => {
  console.error('Failed to load model:', err)
})

// ── Render loop & resize ─────────────────────────────────────────
engine.runRenderLoop(() => scene.render())
window.addEventListener('resize', () => engine.resize())
