import './style.css'

// --- Babylon.js ES-module imports (v8 module-level API) ---
import { Engine }          from '@babylonjs/core/Engines/engine'
import { Scene }           from '@babylonjs/core/scene'
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { Vector3 }         from '@babylonjs/core/Maths/math.vector'
import { Color4 }          from '@babylonjs/core/Maths/math.color'
import { Texture }         from '@babylonjs/core/Materials/Textures/texture'
import { CubeTexture }     from '@babylonjs/core/Materials/Textures/cubeTexture'
import { ImportMeshAsync }  from '@babylonjs/core/Loading/sceneLoader'
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import { ShadowGenerator }  from '@babylonjs/core/Lights/Shadows/shadowGenerator'

// Side-effect: register ShadowGeneratorSceneComponent (required for shadows)
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent'

// Side-effect: register glTF/GLB loader plugin
import '@babylonjs/loaders/glTF'

// Side-effect: extend Scene.prototype with debugLayer
import '@babylonjs/core/Debug/debugLayer'

// ── Base URL (resolves to '/' in dev and '/lp-ots/' in production) ───
const base = import.meta.env.BASE_URL

// ── Inspector — dev only, pre-bundled by Vite (see optimizeDeps.include) ─────
let inspectorReady = true
if (import.meta.env.DEV) {
  import('@babylonjs/inspector').then(() => {
    inspectorReady = true
    console.log('Inspector ready — press F8 to toggle')
  })
}

// ── Canvas & Engine ──────────────────────────────────────────────
const canvas = document.getElementById('renderCanvas')
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, true)


// ── Scene ────────────────────────────────────────────────────────
const scene = new Scene(engine)
scene.clearColor = new Color4(0.53, 0.81, 0.92, 1.0)   // sky blue

// ── Environment texture (local — no CDN dependency, no race condition) ────
scene.environmentTexture = CubeTexture.CreateFromPrefilteredData(
  `${base}textures/environmentSpecular.env`, scene
)
scene.environmentIntensity = 1.0

// ── Directional Light & Shadows ────────────────────────────────
const dirLight = new DirectionalLight('dirLight', new Vector3(-0.49333320025636596, -0.7071067987081836, -0.5065790449135029), scene)
dirLight.intensity = 16
dirLight.autoUpdateExtends = true
dirLight.autoCalcShadowZBounds = true
dirLight.shadowEnabled = true

const shadowGen = new ShadowGenerator(2048, dirLight)
shadowGen.bias = 0.0016
shadowGen.normalBias = 0
shadowGen.darkness = 0.27
shadowGen.transparencyShadow = false
shadowGen.filter = 6 // PCSS
shadowGen.filteringQuality = 0 // Low

// ── Camera (mobile touch: pinch-zoom, one-finger rotate, two-finger pan) ──
const camera = new ArcRotateCamera('cam', -Math.PI / 2, Math.PI / 3, 25, Vector3.Zero(), scene)
camera.attachControl(canvas, true)
camera.lowerRadiusLimit   = 2
camera.upperRadiusLimit   = 80
camera.wheelPrecision     = 20
camera.pinchPrecision     = 40
camera.panningSensibility = 200
camera.minZ = 0.1

// ── Inspector toggle (F8) — dev only ─────────────────────────────
if (import.meta.env.DEV) {
  window.__scene = scene
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F8' && inspectorReady) {
      if (scene.debugLayer.isVisible()) {
        scene.debugLayer.hide()
      } else {
        scene.debugLayer.show({
          embedMode: true,
          showExplorer: true,
          showInspector: true,
        })
      }
    }
  })
}

// ── Detect if a material is transparent (smart — not name-based) ─
function isTransparentMaterial(mat) {
  if (!mat) return false
  // Alpha less than 1 means partial/full transparency
  if (mat.alpha < 1) return true
  // PBR transparency mode: 0 = opaque, 1 = alphaTest, 2 = alphaBlend, 3 = both
  if (mat.transparencyMode != null && mat.transparencyMode > 0) return true
  // Material explicitly says it needs alpha blending
  if (typeof mat.needAlphaBlending === 'function' && mat.needAlphaBlending()) return true
  // PBR sub-surface refraction (glass, water, etc.)
  if (mat.subSurface && mat.subSurface.isRefractionEnabled) return true
  // Albedo/diffuse texture has an alpha channel in use
  if (mat.albedoTexture && mat.albedoTexture.hasAlpha) return true
  return false
}

// ── Load GLB & apply lightmap to UV2 ─────────────────────────────
// const modelUrl = `${base}models/hotel-01.glb`
const modelUrl = `${base}models/island-02.glb`

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

  // Create lightmap texture (shared across all opaque materials)
  // invertY = false — baked lightmaps must NOT be Y-flipped
  const lightmap = new Texture(`${base}models/LightMap-baked.png`, scene, false, false)
  lightmap.coordinatesIndex = 1   // UV2 (glTF TEXCOORD_1)


  // Apply lightmap and enable shadows for opaque meshes
  let applied = 0
  let skipped = 0
  for (const mesh of result.meshes) {
    if (!mesh.material) continue
    if (isTransparentMaterial(mesh.material)) {
      skipped++
      console.log(`  ⊘ Skipped lightmap on transparent material: "${mesh.material.name}"`)
      continue
    }
    mesh.material.lightmapTexture = lightmap
    mesh.material.useLightmapAsShadowmap = true
    mesh.material.lightmapTexture.level = 1.0
    // Enable shadow casting/receiving
    mesh.receiveShadows = true
    shadowGen.addShadowCaster(mesh)
    applied++
  }

  console.log(`✔ Model loaded — ${result.meshes.length} meshes, lightmap on ${applied} opaque, ${skipped} transparent skipped`)
}).catch((err) => {
  console.error('Failed to load model:', err)
})

// ── Render loop & resize ─────────────────────────────────────────
engine.runRenderLoop(() => scene.render())
window.addEventListener('resize', () => engine.resize())

// ── HMR cleanup — dispose old WebGL context on hot reload ────────
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    engine.dispose()
  })
}
