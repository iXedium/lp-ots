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
import { INTRO_TIMELINE }              from './introTimeline'
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
import { StateMachine, STATES }        from './StateMachine'
import { sceneAPI }                    from './sceneAPI'
import { IS_DEV }                      from './isDev'
import { CameraManager }              from './CameraManager'
import { PinManager }                 from './PinManager'
import { Vector3 }                    from '@babylonjs/core/Maths/math.vector'

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

// ── Splash logo probe ─────────────────────────────────────────
// Tries web formats in priority order (.webp → .png → .jpg).
// KTX2 cannot be decoded by <img> natively; if only KTX2 exists, exports a
// .webp or .png alongside it and the probe will find it automatically.
;(async function probeSplashLogo() {
  const imgEl = document.getElementById('splash-logo')
  if (!imgEl) return
  const stem = `${base}textures/0-2_splash-screen`
  for (const ext of ['.webp', '.png', '.jpg', '.jpeg']) {
    try {
      const r  = await fetch(stem + ext, { method: 'HEAD', cache: 'no-store' })
      const ct = r.headers.get('content-type') || ''
      if (r.ok && !ct.includes('text/html')) {
        imgEl.src = stem + ext
        imgEl.style.visibility = 'visible'
        return
      }
    } catch { /* try next format */ }
  }
  // Check if only KTX2 exists
  try {
    const r = await fetch(stem + '.ktx2', { method: 'HEAD', cache: 'no-store' })
    if (r.ok && !(r.headers.get('content-type') || '').includes('text/html')) {
      console.info('[Splash] Splash logo exists as KTX2 only — export a .webp/.png alongside it to display it.')
    }
  } catch { /* ignore */ }
})()

// ── Scene modules ────────────────────────────────────────────
const camera   = setupCamera(scene, canvas)
const skybox   = setupSky(scene)
setupFog(scene)
const lights = setupLighting(scene)
setupPostProcessing(scene, camera)
const waterMat = createWaterMaterial(scene)

// Match clear color to sky horizon for seamless splash→scene transition
import { Color4 } from '@babylonjs/core/Maths/math.color'
const hz = SETTINGS.sky.horizonColor
scene.clearColor = new Color4(hz.r, hz.g, hz.b, 1.0)

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

// ── State Machine & Scene API ────────────────────────────────
const stateMachine = new StateMachine()
sceneAPI._init(stateMachine)

// ── Camera Manager ───────────────────────────────────────────
const cameraManager = new CameraManager(camera, canvas)

// ── Pin Manager ──────────────────────────────────────────────
const pinManager = new PinManager(scene, camera, engine)

// Expose for dev console
if (IS_DEV) {
  window.__stateMachine = stateMachine
  window.__cameraManager = cameraManager
  window.__pinManager = pinManager
}

// ── Action button (corner UI for transitions) ────────────────
const actionBtn = document.createElement('button')
actionBtn.id = 'action-btn'
actionBtn.style.cssText = `
  position: fixed; bottom: 32px; right: 32px; z-index: 50;
  padding: 14px 32px; border: none; border-radius: 8px;
  background: rgba(232, 118, 74, 0.95); color: #fff;
  font: 600 16px/1 system-ui, -apple-system, sans-serif;
  cursor: pointer; display: none; backdrop-filter: blur(4px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.3);
  transition: opacity 0.3s, transform 0.3s;
`
actionBtn.addEventListener('pointerenter', () => { actionBtn.style.transform = 'scale(1.05)' })
actionBtn.addEventListener('pointerleave', () => { actionBtn.style.transform = 'scale(1)' })
document.body.appendChild(actionBtn)

let _actionBtnHandler = null

function showActionButton(label, handler) {
  actionBtn.textContent = label
  if (_actionBtnHandler) actionBtn.removeEventListener('click', _actionBtnHandler)
  _actionBtnHandler = handler
  actionBtn.addEventListener('click', handler)
  actionBtn.style.display = 'block'
  actionBtn.style.opacity = '0'
  actionBtn.style.transform = 'translateY(10px)'
  requestAnimationFrame(() => {
    actionBtn.style.opacity = '1'
    actionBtn.style.transform = 'translateY(0)'
  })
}

function hideActionButton() {
  actionBtn.style.opacity = '0'
  setTimeout(() => { actionBtn.style.display = 'none' }, 300)
  if (_actionBtnHandler) {
    actionBtn.removeEventListener('click', _actionBtnHandler)
    _actionBtnHandler = null
  }
}

// ── Pointer / tap detection for pins ─────────────────────────
let _pointerDownPos = null
let _pointerDownTime = 0
const TAP_MOVE_THRESHOLD = 8   // px
const TAP_TIME_THRESHOLD = 400 // ms

canvas.addEventListener('pointerdown', (e) => {
  _pointerDownPos = { x: e.clientX, y: e.clientY }
  _pointerDownTime = performance.now()
})

canvas.addEventListener('pointerup', (e) => {
  if (!_pointerDownPos) return
  const dx = e.clientX - _pointerDownPos.x
  const dy = e.clientY - _pointerDownPos.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const elapsed = performance.now() - _pointerDownTime
  _pointerDownPos = null

  if (dist > TAP_MOVE_THRESHOLD || elapsed > TAP_TIME_THRESHOLD) return
  if (cameraManager.isFlying) return

  // Screen-space hit test
  const rect = canvas.getBoundingClientRect()
  const scaleX = engine.getRenderWidth() / rect.width
  const scaleY = engine.getRenderHeight() / rect.height
  const sx = (e.clientX - rect.left) * scaleX
  const sy = (e.clientY - rect.top) * scaleY

  const hitPin = pinManager.hitTest(sx, sy)
  if (hitPin) {
    if (IS_DEV) console.log(`[Tap] Hit pin: ${hitPin.id}`)
    handlePinTap(hitPin)
  }
})

// Desktop hover cursor
canvas.addEventListener('pointermove', (e) => {
  if (!pinManager.interactionEnabled || e.buttons) return
  const rect = canvas.getBoundingClientRect()
  const scaleX = engine.getRenderWidth() / rect.width
  const scaleY = engine.getRenderHeight() / rect.height
  const sx = (e.clientX - rect.left) * scaleX
  const sy = (e.clientY - rect.top) * scaleY
  const hit = pinManager.hitTest(sx, sy)
  canvas.style.cursor = hit ? 'pointer' : ''
})

/** Handle a pin tap — fly camera through waypoints to the pin's shot */
function handlePinTap(pin) {
  const state = stateMachine.current
  if (state !== STATES.ORBIT_TUTORIAL && state !== STATES.ORBIT_FREE) return

  // Save current orbit position
  cameraManager.saveOrbitPosition()

  // Fire event before camera moves
  sceneAPI.emitPinClicked(pin.id)

  // Transition
  stateMachine.transitionTo(STATES.FLY_TO_PIN)
  pinManager.interactionEnabled = false

  // Get camera path from GLB
  const cameraPath = pinManager.getCameraPath(pin.id)
  if (!cameraPath) {
    if (IS_DEV) console.warn(`[Tap] No camera path for ${pin.id}`)
    return
  }

  // Fly through waypoints → final shot
  cameraManager.flyToPath(cameraPath.waypoints, cameraPath.finalShot, { reattach: false }).then(() => {
    stateMachine.transitionTo(STATES.REACT_CONTENT)
    sceneAPI.emitShotArrived(pin.id)

    // Set pin as active
    pinManager.setStatus(pin.id, 'active')

    // Show "Back" button
    showActionButton(INTRO_TIMELINE.returnButton.label, () => {
      hideActionButton()
      sceneAPI.returnFromPin()
    })
  })
}

// ── sceneAPI command handlers ────────────────────────────────

sceneAPI.addEventListener('_cmd:flyToIsland', () => {
  if (stateMachine.current !== STATES.AWAITING_REACT) {
    if (IS_DEV) console.warn('[sceneAPI] flyToIsland ignored — not in AWAITING_REACT')
    return
  }
  hideActionButton()
  stateMachine.transitionTo(STATES.FLY_TO_ORBIT)

  // Use overviewCam from introTimeline.js (hardcoded, no GLB dependency)
  const overviewShot = INTRO_TIMELINE.overviewCam || SETTINGS.orbit
  const b2o = INTRO_TIMELINE.beachToOverview

  cameraManager.flyTo(overviewShot, {
    duration: b2o.duration,
    easing: b2o.easing,
    arc: b2o.arc,
    reattach: true,
  }).then(() => {
    cameraManager.restoreOrbitLimits()
    stateMachine.transitionTo(STATES.ORBIT_TUTORIAL)

    // Initialize sequential pin progression: only pin-1 visible
    pinManager.initProgression()
    pinManager.interactionEnabled = true
    sceneAPI.emitOrbitReady()
  })


})

/** Track which pin was active before returning */
let _activePinId = null

sceneAPI.addEventListener('_cmd:returnFromPin', () => {
  if (stateMachine.current !== STATES.REACT_CONTENT) {
    if (IS_DEV) console.warn('[sceneAPI] returnFromPin ignored — not in REACT_CONTENT')
    return
  }
  hideActionButton()
  stateMachine.transitionTo(STATES.FLY_BACK_ORBIT)

  // Complete the active pin and unlock next
  const activePin = pinManager.pins.find(p => p.status === 'active')
  if (activePin) {
    _activePinId = activePin.id
    pinManager.completePin(activePin.id)
  }

  cameraManager.flyToOrbit().then(() => {
    // Check if all pins 1-6 are completed → go to free mode
    const mainPinsComplete = pinManager.pins
      .filter(p => p.num >= 1 && p.num <= 6)
      .every(p => p.status === 'completed')

    if (mainPinsComplete) {
      stateMachine.transitionTo(STATES.ORBIT_FREE)
    } else {
      stateMachine.transitionTo(STATES.ORBIT_TUTORIAL)
    }

    pinManager.interactionEnabled = true
    sceneAPI.emitOrbitReady()
  })
})

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
  const fadeDur = INTRO_TIMELINE.splash.fadeDuration
  splash.style.transition = `opacity ${fadeDur}ms ease-out`
  splash.classList.add('fade-out')
  setTimeout(() => splash.remove(), fadeDur + 100)
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
  const doFinish = async () => {
    modelsLoaded = true

    // Load pins — try JSON first, fall back to GLB extraction
    const pinsJsonUrl = `${base}json/pins.json`
    let pinsLoadedFromJson = false
    try {
      const resp = await fetch(pinsJsonUrl)
      if (resp.ok) {
        const ct = resp.headers.get('content-type') || ''
        if (!ct.includes('text/html')) {
          const json = await resp.json()
          if (json.pins?.length && json.cameraShots) {
            await pinManager.loadFromJSON(json, base)
            pinsLoadedFromJson = true
            if (IS_DEV) console.log('[Pins] Loaded from pins.json')
          }
        }
      }
    } catch (err) {
      console.error('[Pins] Failed to load pins.json:', err)
    }
    if (!pinsLoadedFromJson) {
      console.error('[Pins] pins.json missing or invalid — pins will not appear')
    }

    // ── Intro sequence (cameras from introTimeline.js) ───────
    const tl = INTRO_TIMELINE
    const skyCam = tl.skyCam
    const beachCam = tl.beachCam

    // 1. Position camera at sky (Cam-0-1) BEFORE splash fades
    camera.alpha = skyCam.alpha
    camera.beta = skyCam.beta
    camera.radius = skyCam.radius
    camera.target.x = skyCam.target.x
    camera.target.y = skyCam.target.y
    camera.target.z = skyCam.target.z
    camera.detachControl()
    window.__requestRender?.()

    // 2. Fade out splash — reveals sky
    dismissSplash()
    stateMachine.transitionTo(STATES.INTRO_CLOSEUP)

    // 3. After fade + settle, fly to Cam-0-2 (beach closeup)
    const fadeTime = tl.splash.fadeDuration + tl.skyToBeach.delay
    setTimeout(() => {
      cameraManager.flyTo(beachCam, {
        duration: tl.skyToBeach.duration,
        easing: tl.skyToBeach.easing,
        arc: tl.skyToBeach.arc,
        detach: true,
        reattach: false,
      }).then(() => {
        // 4. Intro complete — show "Explore" button and WAIT for user click
        stateMachine.transitionTo(STATES.AWAITING_REACT)
        sceneAPI.emitIntroComplete()

        showActionButton(tl.exploreButton.label, () => {
          hideActionButton()
          sceneAPI.flyToIsland()
        })
      })
    }, fadeTime)
  }
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

// ── WASD + QE drone controls ─────────────────────────────────
const _droneKeys = new Set()
window.addEventListener('keydown', (e) => {
  // Don't capture when typing in inputs
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return
  const k = e.key.toLowerCase()
  if ('wasdeq'.includes(k) && k.length === 1) {
    _droneKeys.add(k)
    window.__requestRender?.()
  }
})
window.addEventListener('keyup', (e) => {
  _droneKeys.delete(e.key.toLowerCase())
})

scene.onBeforeRenderObservable.add(() => {
  if (_droneKeys.size === 0) return
  if (cameraManager.isFlying) return
  // Only allow drone controls in orbit states (user has control)
  const st = stateMachine.current
  if (st !== STATES.ORBIT_TUTORIAL && st !== STATES.ORBIT_FREE) return

  const dt = engine.getDeltaTime() / 1000
  const speed = (SETTINGS.camera.droneSpeed ?? 15) * dt

  // Forward = camera → target direction projected on XZ plane
  const forward2D = camera.target.subtract(camera.position)
  forward2D.y = 0
  if (forward2D.length() > 0.001) forward2D.normalize()

  // Right = cross(Up, Forward) in left-handed BJS
  const right2D = Vector3.Cross(Vector3.Up(), forward2D)
  if (right2D.length() > 0.001) right2D.normalize()

  const delta = Vector3.Zero()
  if (_droneKeys.has('w')) delta.addInPlace(forward2D.scale(speed))
  if (_droneKeys.has('s')) delta.addInPlace(forward2D.scale(-speed))
  if (_droneKeys.has('d')) delta.addInPlace(right2D.scale(speed))
  if (_droneKeys.has('a')) delta.addInPlace(right2D.scale(-speed))
  if (_droneKeys.has('e')) delta.y += speed
  if (_droneKeys.has('q')) delta.y -= speed

  camera.target.addInPlace(delta)
  window.__requestRender?.()
})

let tick = 0
engine.runRenderLoop(() => {
  const elapsed = performance.now() - lastInteraction
  const animating = cameraManager.isFlying
  const droning = _droneKeys.size > 0
  const active = !modelsLoaded || !window.__rodEnabled || needsRender || elapsed < ROD.cooldownMs || animating || droning

  if (active) {
    const dcBefore = engine._drawCalls?.current ?? 0
    scene.render()
    window.__dcPerFrame = (engine._drawCalls?.current ?? 0) - dcBefore
    needsRender = false
  }
  window.__isRenderIdle = !active && modelsLoaded
  if (++tick % 30 === 0) hud.update(engine.getFps())
})
window.addEventListener('resize', () => engine.resize())

// ── Dev UI (tree-shaken in production) ───────────────────────
if (IS_DEV) {
  import('./DevUI').then(({ DevUI }) => {
    const devUI = new DevUI(cameraManager, pinManager, stateMachine, sceneAPI)
    window.__devUI = devUI
  })
}

// ── HMR ──────────────────────────────────────────────────────
if (import.meta.hot) {
  import.meta.hot.dispose(() => engine.dispose())
}
