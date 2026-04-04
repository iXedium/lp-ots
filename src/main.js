/**
 * main.js — Orchestrator only.
 * All logic lives in dedicated modules; settings in constants.js.
 */
import './style.css'
import modelFiles from 'virtual:model-list'

import { Engine }      from '@babylonjs/core/Engines/engine'
import { Scene }       from '@babylonjs/core/scene'
import { CubeTexture } from '@babylonjs/core/Materials/Textures/cubeTexture'
import '@babylonjs/core/Debug/debugLayer'

import { SETTINGS }                    from './constants'
import { setupCamera, frameCamera }    from './camera'
import { setupSky }                    from './sky'
import { setupFog }                    from './fog'
import { setupPostProcessing }         from './postprocessing'
import { createWaterMaterial, applyWater } from './water'
import { setupLighting, applyShadows } from './lighting'
import { loadAllModels }               from './modelLoader'
import { createHUD }                   from './hud'

const base       = import.meta.env.BASE_URL
const MODEL_NAMES = modelFiles.map(f => f.replace(/\.glb$/i, ''))

// ── Inspector (dynamic import, F8 toggle) ────────────────────
let inspectorReady = false
import('@babylonjs/inspector').then(() => { inspectorReady = true })

// ── Engine & Scene ───────────────────────────────────────────
const canvas = document.getElementById('renderCanvas')
const engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: true }, true)
const scene  = new Scene(engine)

// IBL env map — ignored by unlit materials, used by water PBR reflections
scene.environmentTexture = CubeTexture.CreateFromPrefilteredData(
  `${base}textures/environmentSpecular.env`, scene,
)
scene.environmentIntensity = 1.0

// ── Scene modules ────────────────────────────────────────────
const camera   = setupCamera(scene, canvas)
const skybox   = setupSky(scene)
setupFog(scene)
const lights = setupLighting(scene)
setupPostProcessing(scene, camera)
const waterMat = createWaterMaterial(scene)

// ── Inspector toggle ─────────────────────────────────────────
window.__scene = scene
window.addEventListener('keydown', e => {
  if (e.key === 'F8' && inspectorReady) {
    scene.debugLayer.isVisible()
      ? scene.debugLayer.hide()
      : scene.debugLayer.show({ embedMode: true, showExplorer: true, showInspector: true })
  }
})

// ── HUD ──────────────────────────────────────────────────────
const hud = createHUD(engine, scene, MODEL_NAMES)
hud.update()

// ── Load models ──────────────────────────────────────────────
loadAllModels(scene, base, MODEL_NAMES, {
  skipMakeLit: SETTINGS.water.enabled ? [SETTINGS.water.modelName] : [],
  onProgress(name, data) { hud.update(engine.getFps(), data, false) },
}).then(({ modelData, globalMin, globalMax }) => {
  frameCamera(camera, globalMin, globalMax)

  if (lights?.shadowGen) applyShadows(modelData, lights.shadowGen)

  // Apply water material to pool-water meshes
  const waterModel = modelData[SETTINGS.water.modelName]
  if (waterMat && waterModel) applyWater(waterMat, waterModel.refs, skybox)

  hud.update(engine.getFps(), modelData, true)
  console.log('All models loaded.')
})

// ── Render loop ──────────────────────────────────────────────
let tick = 0
engine.runRenderLoop(() => {
  scene.render()
  if (++tick % 30 === 0) hud.update(engine.getFps())
})
window.addEventListener('resize', () => engine.resize())

// ── HMR ──────────────────────────────────────────────────────
if (import.meta.hot) {
  import.meta.hot.dispose(() => engine.dispose())
}
