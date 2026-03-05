import './style.css'

// --- Babylon.js ES-module imports ---
import { Engine }       from '@babylonjs/core/Engines/engine'
import { Scene }        from '@babylonjs/core/scene'
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { Vector3 }      from '@babylonjs/core/Maths/math.vector'
import { SceneLoader }  from '@babylonjs/core/Loading/sceneLoader'
import { Texture }      from '@babylonjs/core/Materials/Textures/texture'

// Side-effect: register the glTF / GLB loader plugin
import '@babylonjs/loaders/glTF'

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

// ── NO lights — baked lightmap only ──────────────────────────────

// ── Base URL (works in dev "/" and on GitHub Pages "/lp-ots/") ───
const base = import.meta.env.BASE_URL

// ── Load GLB & apply lightmap to UV2 ─────────────────────────────
SceneLoader.ImportMeshAsync(null, `${base}models/`, 'hotel-01.glb', scene).then((result) => {
  // Frame the camera on the loaded model
  const root = result.meshes[0]
  scene.createDefaultCamera(false)       // don't replace our camera, just use for framing reference

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

  // Create lightmap texture once, share across materials
  const lightmap = new Texture(`${base}models/LightMap-backed.png`, scene)
  lightmap.coordinatesIndex = 1          // UV2  (glTF TEXCOORD_1)

  // Apply lightmap to every material in the scene
  for (const mesh of result.meshes) {
    if (!mesh.material) continue
    mesh.material.lightmapTexture = lightmap
    mesh.material.useLightmapAsShadowmap = true
  }

  console.log(`✔ Model loaded — ${result.meshes.length} meshes, lightmap on UV2 applied`)
}).catch((err) => {
  console.error('Failed to load model:', err)
})

// ── Render loop & resize ─────────────────────────────────────────
engine.runRenderLoop(() => scene.render())
window.addEventListener('resize', () => engine.resize())
