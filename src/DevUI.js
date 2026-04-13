import { STATES } from './StateMachine'
import { PIN_STATUSES, PinManager } from './PinManager'
import { Color3 } from '@babylonjs/core/Maths/math.color'

/**
 * DevUI — floating developer overlay panel.
 * Only instantiated when IS_DEV is true (tree-shaken out of production builds).
 */
export class DevUI {
  /**
   * @param {import('./CameraManager').CameraManager} cameraManager
   * @param {import('./PinManager').PinManager} pinManager
   * @param {import('./StateMachine').StateMachine} stateMachine
   * @param {import('./sceneAPI').sceneAPI} sceneAPI
   */
  constructor(cameraManager, pinManager, stateMachine, sceneAPI) {
    this.cm = cameraManager
    this.pm = pinManager
    this.sm = stateMachine
    this.api = sceneAPI

    this.visible = false
    this._panel = null
    this._readoutEls = {}

    this._build()
    this._bindKeys()
    this._startLiveUpdate()
    this._showToggleHint()
  }

  /** Show a small persistent hint so devs know how to open the panel */
  _showToggleHint() {
    const hint = document.createElement('div')
    hint.id = 'dev-ui-hint'
    hint.textContent = 'DEV: press ` to toggle HUD'
    hint.style.cssText = `
      position: fixed; top: 4px; left: 50%; transform: translateX(-50%);
      z-index: 10000; background: rgba(122,162,247,0.85); color: #fff;
      font: bold 11px/1 system-ui, sans-serif; padding: 4px 12px;
      border-radius: 0 0 6px 6px; pointer-events: none;
      opacity: 0.9; transition: opacity 2s;
    `
    document.body.appendChild(hint)
    // Fade out after 5 seconds
    setTimeout(() => { hint.style.opacity = '0' }, 5000)
    setTimeout(() => hint.remove(), 7500)
  }

  _build() {
    const panel = document.createElement('div')
    panel.id = 'dev-ui'
    panel.innerHTML = `
      <style>
        #dev-ui {
          position: fixed; top: 10px; right: 10px; z-index: 9999;
          width: 320px; max-height: 90vh; overflow-y: auto;
          background: rgba(15,15,25,0.92); color: #e0e0e0;
          font: 11px/1.5 'Consolas', 'Monaco', monospace;
          border: 1px solid rgba(255,255,255,0.15); border-radius: 6px;
          padding: 10px; display: none;
          backdrop-filter: blur(8px);
          user-select: text;
        }
        #dev-ui.visible { display: block; }
        #dev-ui h3 {
          margin: 8px 0 4px; font-size: 11px; text-transform: uppercase;
          color: #7aa2f7; letter-spacing: 0.08em; border-bottom: 1px solid rgba(255,255,255,0.1);
          padding-bottom: 2px;
        }
        #dev-ui h3:first-child { margin-top: 0; }
        #dev-ui .row { display: flex; justify-content: space-between; padding: 1px 0; }
        #dev-ui .lbl { color: #888; }
        #dev-ui .val { color: #9ece6a; font-variant-numeric: tabular-nums; }
        #dev-ui button {
          background: rgba(255,255,255,0.08); color: #c0c0c0; border: 1px solid rgba(255,255,255,0.15);
          border-radius: 3px; padding: 3px 8px; margin: 2px 2px; cursor: pointer; font: inherit;
        }
        #dev-ui button:hover { background: rgba(255,255,255,0.15); color: #fff; }
        #dev-ui button.accent { background: rgba(122,162,247,0.2); border-color: rgba(122,162,247,0.4); }
        #dev-ui .pin-row { display: flex; align-items: center; gap: 4px; padding: 2px 0; flex-wrap: wrap; }
        #dev-ui .pin-id { color: #e0af68; min-width: 80px; }
        #dev-ui .pin-card {
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 4px; padding: 6px; margin: 4px 0;
        }
        #dev-ui .pin-header { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
        #dev-ui .pin-id { color: #e0af68; font-weight: bold; }
        #dev-ui .pin-pos-row { display: flex; align-items: center; gap: 3px; margin-bottom: 4px; }
        #dev-ui .pin-pos-row input[type="number"] {
          width: 52px; background: rgba(0,0,0,0.3); color: #9ece6a;
          border: 1px solid rgba(255,255,255,0.12); border-radius: 3px;
          padding: 1px 3px; font: inherit; text-align: right;
        }
        #dev-ui .pin-pos-row input[type="number"]::-webkit-inner-spin-button { opacity: 0.5; }
        #dev-ui .pin-actions { display: flex; flex-wrap: wrap; gap: 3px; }
        #dev-ui select {
          background: rgba(255,255,255,0.08); color: #c0c0c0; border: 1px solid rgba(255,255,255,0.15);
          border-radius: 3px; padding: 1px 3px; font: inherit;
        }
        #dev-ui .state-badge {
          display: inline-block; background: rgba(158,206,106,0.2); color: #9ece6a;
          padding: 2px 8px; border-radius: 3px; font-weight: bold; margin: 4px 0;
        }
      </style>

      <h3>Camera</h3>
      <div class="row"><span class="lbl">alpha</span><span class="val" id="dev-cam-alpha">—</span></div>
      <div class="row"><span class="lbl">beta</span><span class="val" id="dev-cam-beta">—</span></div>
      <div class="row"><span class="lbl">radius</span><span class="val" id="dev-cam-radius">—</span></div>
      <div class="row"><span class="lbl">target.x</span><span class="val" id="dev-cam-tx">—</span></div>
      <div class="row"><span class="lbl">target.y</span><span class="val" id="dev-cam-ty">—</span></div>
      <div class="row"><span class="lbl">target.z</span><span class="val" id="dev-cam-tz">—</span></div>
      <div>
        <button id="dev-copy-shot">Copy as JSON</button>
      </div>

      <h3>State Machine</h3>
      <div class="state-badge" id="dev-state">—</div>
      <div id="dev-state-buttons"></div>
      <div style="margin-top:4px">
        <button class="accent" id="dev-fly-island">flyToIsland()</button>
        <button class="accent" id="dev-return-pin">returnFromPin()</button>
        <button id="dev-back-orbit">Back to orbit</button>
      </div>

      <h3>Pins</h3>
      <div id="dev-pins-list"></div>
      <div style="margin-top:4px">
        <button id="dev-export-pins">Export pins data</button>
        <button id="dev-read-glb" class="accent" title="Re-read positions and cameras from pins.glb">🔄 Read from GLB</button>
        <button id="dev-save-json" class="accent" title="Save current pin data to public/json/pins.json">💾 Save to pins.json</button>
      </div>

      <h3>Pin Status Colors</h3>
      <div id="dev-pin-colors"></div>

      <h3>GLB Cameras</h3>
      <div id="dev-glb-cameras"></div>
    `
    document.body.appendChild(panel)
    this._panel = panel

    // Cache readout elements
    this._readoutEls = {
      alpha: panel.querySelector('#dev-cam-alpha'),
      beta: panel.querySelector('#dev-cam-beta'),
      radius: panel.querySelector('#dev-cam-radius'),
      tx: panel.querySelector('#dev-cam-tx'),
      ty: panel.querySelector('#dev-cam-ty'),
      tz: panel.querySelector('#dev-cam-tz'),
      state: panel.querySelector('#dev-state'),
    }

    // State machine buttons
    const stateContainer = panel.querySelector('#dev-state-buttons')
    for (const state of Object.values(STATES)) {
      const btn = document.createElement('button')
      btn.textContent = state
      btn.style.fontSize = '9px'
      btn.addEventListener('click', () => this.sm.transitionTo(state, true))
      stateContainer.appendChild(btn)
    }

    // State change listener
    this.sm.onChange(() => this._updateState())
    this._updateState()

    // Action buttons
    panel.querySelector('#dev-copy-shot').addEventListener('click', () => this._copyShot())
    panel.querySelector('#dev-fly-island').addEventListener('click', () => this.api.flyToIsland())
    panel.querySelector('#dev-return-pin').addEventListener('click', () => this.api.returnFromPin())
    panel.querySelector('#dev-back-orbit').addEventListener('click', () => {
      this.sm.transitionTo(STATES.FLY_BACK_ORBIT, true)
      this.cm.flyToOrbit().then(() => {
        this.sm.transitionTo(STATES.ORBIT_FREE, true)
        this.pm.showAll()
        this.pm.interactionEnabled = true
      })
    })
    panel.querySelector('#dev-export-pins').addEventListener('click', () => this._exportPins())
    panel.querySelector('#dev-read-glb').addEventListener('click', () => this._readFromGLB())
    panel.querySelector('#dev-save-json').addEventListener('click', () => this._saveToJSON())

    // Build pin rows (deferred until pins are loaded)
    this._buildPinRows()
  }

  _buildPinRows() {
    const container = this._panel.querySelector('#dev-pins-list')
    if (!this.pm.pins.length) {
      setTimeout(() => this._buildPinRows(), 500)
      return
    }
    container.innerHTML = ''

    for (const pin of this.pm.pins) {
      const card = document.createElement('div')
      card.className = 'pin-card'
      card.innerHTML = `
        <div class="pin-header">
          <span class="pin-id">${pin.id}</span>
          <select class="pin-status"></select>
        </div>
        <div class="pin-pos-row">
          <span class="lbl">pos</span>
          <input type="number" step="0.5" class="pin-x" title="X" />
          <input type="number" step="0.5" class="pin-y" title="Y" />
          <input type="number" step="0.5" class="pin-z" title="Z" />
        </div>
        <div class="pin-actions">
          <button class="pin-fly" title="Fly to pin's camera path">📷 Fly</button>
          <button class="pin-complete" title="Complete pin & unlock next">✅ Complete</button>
          <button class="pin-move-here" title="Move pin to camera target">⬇ Move here</button>
        </div>
      `

      // Status dropdown
      const select = card.querySelector('.pin-status')
      for (const status of PIN_STATUSES) {
        const opt = document.createElement('option')
        opt.value = status
        opt.textContent = status
        if (status === pin.status) opt.selected = true
        select.appendChild(opt)
      }
      select.addEventListener('change', () => {
        this.pm.setStatus(pin.id, select.value)
        console.log(`[DevUI] ${pin.id} status → ${select.value}`)
      })

      // Position inputs
      const xIn = card.querySelector('.pin-x')
      const yIn = card.querySelector('.pin-y')
      const zIn = card.querySelector('.pin-z')
      xIn.value = pin.position.x.toFixed(1)
      yIn.value = pin.position.y.toFixed(1)
      zIn.value = pin.position.z.toFixed(1)

      const onPosChange = () => {
        const x = parseFloat(xIn.value) || 0
        const y = parseFloat(yIn.value) || 0
        const z = parseFloat(zIn.value) || 0
        this.pm.movePin(pin.id, x, y, z)
      }
      xIn.addEventListener('change', onPosChange)
      yIn.addEventListener('change', onPosChange)
      zIn.addEventListener('change', onPosChange)

      // Fly to camera path
      card.querySelector('.pin-fly').addEventListener('click', () => {
        const path = this.pm.getCameraPath(pin.id)
        if (path) {
          this.cm.flyToPath(path.waypoints, path.finalShot, {
            reattach: true,
          })
        } else {
          console.warn(`[DevUI] ${pin.id} has no camera path`)
        }
      })

      // Complete pin
      card.querySelector('.pin-complete').addEventListener('click', () => {
        this.pm.completePin(pin.id)
        // Refresh dropdown
        select.value = pin.status
        console.log(`[DevUI] ${pin.id} completed, next unlocked`)
      })

      // Move pin to camera target
      card.querySelector('.pin-move-here').addEventListener('click', () => {
        const t = this.cm.camera.target
        const x = parseFloat(t.x.toFixed(2))
        const y = parseFloat((t.y + 1).toFixed(2))
        const z = parseFloat(t.z.toFixed(2))
        this.pm.movePin(pin.id, x, y, z)
        xIn.value = x
        yIn.value = y
        zIn.value = z
      })

      container.appendChild(card)
    }

    // Build color editors
    this._buildColorEditors()

    // Build GLB camera list
    this._buildGlbCameras()
  }

  _buildColorEditors() {
    const container = this._panel.querySelector('#dev-pin-colors')
    container.innerHTML = ''

    for (const status of PIN_STATUSES) {
      const color = PinManager.getStatusColor(status)
      if (!color) continue
      const row = document.createElement('div')
      row.className = 'row'
      row.style.alignItems = 'center'
      const hex = '#' + color.toHexString().slice(1)
      row.innerHTML = `
        <span class="lbl">${status}</span>
        <input type="color" value="${hex}" style="width:36px;height:20px;border:none;background:none;cursor:pointer;" />
      `
      const input = row.querySelector('input')
      input.addEventListener('input', () => {
        const c3 = Color3.FromHexString(input.value)
        PinManager.setStatusColor(status, c3)
        // Refresh all pins with this status
        for (const pin of this.pm.pins) {
          if (pin.status === status) this.pm.setStatus(pin.id, status)
        }
      })
      container.appendChild(row)
    }
  }

  _buildGlbCameras() {
    const container = this._panel.querySelector('#dev-glb-cameras')
    container.innerHTML = ''

    const shots = this.pm.cameraShots
    for (const key of Object.keys(shots)) {
      if (key.endsWith('-waypoints')) continue // skip arrays, show main shots only
      const btn = document.createElement('button')
      btn.textContent = key
      btn.style.fontSize = '9px'
      btn.addEventListener('click', () => {
        this.cm.flyTo(shots[key], { reattach: true })
      })
      container.appendChild(btn)
    }

    // Show waypoint paths
    for (const key of Object.keys(shots)) {
      if (!key.endsWith('-waypoints')) continue
      const pinNum = key.replace('-waypoints', '')
      const finalShot = shots[pinNum]
      if (!finalShot) continue
      const btn = document.createElement('button')
      btn.textContent = `${pinNum} path (${shots[key].length}wp)`
      btn.style.fontSize = '9px'
      btn.className = 'accent'
      btn.addEventListener('click', () => {
        this.cm.flyToPath(shots[key], finalShot, { reattach: true })
      })
      container.appendChild(btn)
    }
  }

  _updateState() {
    this._readoutEls.state.textContent = this.sm.current
  }

  _copyShot() {
    const shot = this.cm.captureShot()
    const json = JSON.stringify(shot, null, 2)
    navigator.clipboard.writeText(json).then(
      () => console.log('[DevUI] Shot copied to clipboard'),
      () => console.warn('[DevUI] Clipboard write failed — shot:', json)
    )
  }

  _exportPins() {
    const json = this.pm.exportJSON()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'pins-data.json'
    a.click()
    URL.revokeObjectURL(url)
    console.log('[DevUI] Exported pins.json')
  }

  async _readFromGLB() {
    const btn = this._panel.querySelector('#dev-read-glb')
    btn.textContent = '⏳ Reading...'
    btn.disabled = true
    try {
      const base = import.meta.env.BASE_URL
      const data = await this.pm.readFromGLB(base)
      // Store for preview / confirmation
      this._pendingGlbData = data
      console.log('[DevUI] Read from GLB:', data.pins.length, 'pins,', Object.keys(data.cameraShots).length, 'camera shots')
      console.log('[DevUI] Camera shots:', Object.keys(data.cameraShots))

      // Separate intro cameras from pin cameras
      const introCams = {}
      const pinCams = {}
      for (const [key, val] of Object.entries(data.cameraShots)) {
        if (key.startsWith('intro-')) {
          introCams[key] = val
        } else {
          pinCams[key] = val
        }
      }
      this._pendingGlbData.cameraShots = pinCams

      // Log intro cameras for introTimeline.js
      const introMapping = { 'intro-1': 'skyCam', 'intro-2': 'beachCam', 'intro-3': 'overviewCam' }
      let introSnippet = '// Paste into introTimeline.js:\n'
      for (const [key, shot] of Object.entries(introCams)) {
        const name = introMapping[key] || key
        introSnippet += `${name}: ${JSON.stringify(shot, null, 2)},\n`
      }
      console.log('[DevUI] Intro cameras for introTimeline.js:\n' + introSnippet)

      const preview = `Read ${data.pins.length} pins and ${Object.keys(pinCams).length} pin camera shots.\n\nPins: ${data.pins.map(p => p.id).join(', ')}\nPin Cameras: ${Object.keys(pinCams).join(', ')}\nIntro Cameras: ${Object.keys(introCams).join(', ')} (logged to console for introTimeline.js)\n\nClick "Save to pins.json" to persist pin data.`
      alert(preview)
      btn.textContent = '✅ Read OK — Save to confirm'
    } catch (err) {
      console.error('[DevUI] Failed to read GLB:', err)
      alert('Failed to read GLB: ' + err.message)
    } finally {
      btn.disabled = false
      setTimeout(() => { btn.textContent = '🔄 Read from GLB' }, 3000)
    }
  }

  async _saveToJSON() {
    // Use pending GLB data if available, otherwise export current state
    const json = this._pendingGlbData
      ? JSON.stringify(this._pendingGlbData, null, 2)
      : this.pm.exportJSON()

    // Use Vite dev server to write (we POST to a custom endpoint or just download)
    // For now: download and also copy to clipboard
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'pins.json'
    a.click()
    URL.revokeObjectURL(url)

    // Also try clipboard
    try {
      await navigator.clipboard.writeText(json)
      console.log('[DevUI] pins.json data copied to clipboard — paste into public/json/pins.json')
    } catch { /* ignore */ }

    this._pendingGlbData = null
    console.log('[DevUI] Saved pins.json (downloaded + copied to clipboard)')
    alert('pins.json downloaded.\\nAlso copied to clipboard — paste into public/json/pins.json')
  }

  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.key === '`') {
        this.visible = !this.visible
        this._panel.classList.toggle('visible', this.visible)
      }
    })
  }

  _startLiveUpdate() {
    const cam = this.cm.camera
    const els = this._readoutEls
    const update = () => {
      if (this.visible) {
        els.alpha.textContent = cam.alpha.toFixed(4)
        els.beta.textContent = cam.beta.toFixed(4)
        els.radius.textContent = cam.radius.toFixed(2)
        els.tx.textContent = cam.target.x.toFixed(2)
        els.ty.textContent = cam.target.y.toFixed(2)
        els.tz.textContent = cam.target.z.toFixed(2)
      }
      requestAnimationFrame(update)
    }
    requestAnimationFrame(update)
  }

  toggle() {
    this.visible = !this.visible
    this._panel.classList.toggle('visible', this.visible)
  }
}
