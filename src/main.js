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
import { applyFoamToWater }                    from './shorelineFoam'
import { setupLighting, applyShadows } from './lighting'
import { loadAllModels }               from './modelLoader'
import { createHUD }                   from './hud'
import { createWaterTweaker }          from './waterTweaker'

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
    window.__requestRender?.()
  }
})

// ── HUD ──────────────────────────────────────────────────────
const hud = createHUD(engine, scene, MODEL_NAMES)
hud.update()

// ── Splash screen ────────────────────────────────────────────
import { LOADING_MESSAGES } from './loadingMessages'

const splash     = document.getElementById('splash')
const splashBar  = document.getElementById('splash-bar')
const splashText = document.getElementById('splash-text')
const totalModels = MODEL_NAMES.length
let   loadedCount = 0

// Shuffle messages fresh each time the splash is shown
let shuffled = [...LOADING_MESSAGES].sort(() => Math.random() - 0.5)
let msgIndex = 0

// Rotate fun messages on a timer (starts immediately)
const msgInterval = setInterval(() => {
  if (splashText) splashText.textContent = shuffled[msgIndex % shuffled.length]
  msgIndex++
}, SETTINGS.splash.messageIntervalMs)

// Show first message right away
if (splashText) splashText.textContent = shuffled[0]
msgIndex = 1

function updateSplashProgress() {
  loadedCount++
  const pct = Math.round((loadedCount / totalModels) * 100)
  if (splashBar) splashBar.style.width = pct + '%'
}

function dismissSplash() {
  if (!splash) return
  clearInterval(msgInterval)
  splash.classList.add('fade-out')
  setTimeout(() => splash.remove(), 700)
}

// ── Load models ──────────────────────────────────────────────
loadAllModels(scene, base, MODEL_NAMES, {
  skipMakeLit: [
    ...(SETTINGS.water.enabled ? [SETTINGS.water.modelName] : []),
    ...(SETTINGS.shorelineFoam.enabled ? [SETTINGS.shorelineFoam.modelName] : []),
  ],
  onProgress(name, data) {
    updateSplashProgress()
    hud.update(engine.getFps(), data, false)
  },
}).then(({ modelData, globalMin, globalMax }) => {
  frameCamera(camera, globalMin, globalMax)

  if (lights?.shadowGen) applyShadows(modelData, lights.shadowGen)

  // Apply water material to pool-water meshes
  const waterModel = modelData[SETTINGS.water.modelName]
  if (waterMat && waterModel) applyWater(waterMat, waterModel.refs, skybox)

  // Apply shoreline foam to ocean mesh
  const foamModel = modelData[SETTINGS.shorelineFoam.modelName]
  if (foamModel) {
    applyFoamToWater(scene, camera, foamModel.refs)
    createWaterTweaker()
  }

  hud.update(engine.getFps(), modelData, true)
  window.__requestRender?.()
  console.log('All models loaded.')

  // Keep splash visible until water shader has compiled (avoids a flash on first render)
  const doFinish = () => { modelsLoaded = true; dismissSplash() }
  if (!waterMat) {
    scene.onAfterRenderObservable.addOnce(doFinish)
  } else {
    const checkReady = scene.onAfterRenderObservable.add(() => {
      if (waterMat.isReady()) {
        scene.onAfterRenderObservable.remove(checkReady)
        doFinish()
      }
    })
  }
})

// ── Render-on-demand ─────────────────────────────────────────
// Only render when the user interacts or the scene needs an update.
// Always render continuously until models finish loading.
let modelsLoaded = false
let needsRender = true
let lastInteraction = 0
const ROD = SETTINGS.renderOnDemand
window.__rodEnabled = true
window.__setRodEnabled = (v) => { window.__rodEnabled = v; window.__requestRender?.() }

/** Call from anywhere to force a re-render (e.g. HUD toggle, material change) */
window.__requestRender = () => { needsRender = true; lastInteraction = performance.now() }

// Track user interaction on the canvas to wake up the render loop
const wakeRender = () => { needsRender = true; lastInteraction = performance.now() }
canvas.addEventListener('pointerdown', wakeRender)
canvas.addEventListener('pointermove', (e) => { if (e.buttons) wakeRender() })
canvas.addEventListener('pointerup', wakeRender)
canvas.addEventListener('wheel', wakeRender)
canvas.addEventListener('keydown', (e) => {
  if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return
  wakeRender()
})

let tick = 0
engine.runRenderLoop(() => {
  const elapsed = performance.now() - lastInteraction
  const active = !modelsLoaded || !window.__rodEnabled || needsRender || elapsed < ROD.cooldownMs

  if (active) {
    scene.render()
    needsRender = false
  }
  window.__isRenderIdle = !active && modelsLoaded
  if (++tick % 30 === 0) hud.update(engine.getFps())
})
window.addEventListener('resize', () => engine.resize())

// ── HMR ──────────────────────────────────────────────────────
if (import.meta.hot) {
  import.meta.hot.dispose(() => engine.dispose())
}
