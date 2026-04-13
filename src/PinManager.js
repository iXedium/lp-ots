import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { Matrix, Viewport } from '@babylonjs/core/Maths/math'
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader'
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import '@babylonjs/loaders/glTF'
import { SETTINGS } from './constants'
import { IS_DEV } from './isDev'
import { worldPosToArcParams } from './CameraManager'

/**
 * Pin statuses and their visual properties.
 *
 * | Status     | Meaning                        | Clickable |
 * |------------|--------------------------------|-----------|
 * | invisible  | Hidden entirely                | no        |
 * | disabled   | Shown but greyed, not tappable | no        |
 * | locked     | Visible but locked             | no (dev: yes) |
 * | normal     | Available / open               | yes       |
 * | active     | Currently open in React        | no        |
 * | completed  | Finished, revisitable          | yes       |
 */
export const PIN_STATUSES = ['invisible', 'disabled', 'locked', 'normal', 'active', 'completed']

/** Default status colors — read from SETTINGS, can be overridden at runtime via setStatusColor */
const STATUS_COLORS = {}
const STATUS_EMISSIVE_SCALE = {}

/** Initialize colors from SETTINGS (called lazily to ensure SETTINGS is loaded) */
function _initColors() {
  if (STATUS_COLORS.normal) return // already initialized
  const cfg = SETTINGS.pins
  for (const [status, c] of Object.entries(cfg.statusColors || {})) {
    STATUS_COLORS[status] = new Color3(c.r, c.g, c.b)
  }
  Object.assign(STATUS_EMISSIVE_SCALE, cfg.statusEmissiveScale || {})
}

/** Statuses that allow click interaction in release mode */
const CLICKABLE_STATUSES = new Set(['normal', 'completed'])

/**
 * PinManager — loads pins.glb containing:
 *   - pin-1 … pin-7 meshes (positions used as world placement)
 *   - Cam-0-1, Cam-0-2, Cam-0-3 (intro/overview cameras)
 *   - Cam-pin-N[-W] cameras per pin (multi-waypoint paths)
 *   - light-dir spotlight → directional light with pin-only shadows
 *
 * Also handles bobbing animation and mobile-first tap detection.
 */
export class PinManager {
  /**
   * @param {import('@babylonjs/core/scene').Scene} scene
   * @param {import('@babylonjs/core/Cameras/arcRotateCamera').ArcRotateCamera} camera
   * @param {import('@babylonjs/core/Engines/engine').Engine} engine
   */
  constructor(scene, camera, engine) {
    this.scene = scene
    this.camera = camera
    this.engine = engine

    /** @type {Array<object>} pin data objects */
    this.pins = []
    /** @type {Map<string, Mesh>} pinId → root mesh */
    this.meshes = new Map()
    /** @type {Map<string, object>} pinId → pin data */
    this.pinDataMap = new Map()

    /** @type {Map<string, Mesh>} pinId → hit-box mesh for click detection */
    this.hitMeshes = new Map()

    /**
     * Camera shots extracted from GLB cameras.
     * Keys: 'intro-1', 'intro-2', 'intro-3' (Cam-0-1/2/3)
     *        'pin-1', 'pin-2', … (final shot for each pin)
     *        'pin-1-waypoints' → [{shot}, …] (intermediate waypoints)
     * Each shot: { alpha, beta, radius, target: {x,y,z} }
     */
    this.cameraShots = {}

    /** Directional light created from light-dir in GLB */
    this.pinLight = null

    this._startTime = performance.now()
    this._bobbingObserver = null
    this._templateMeshes = []

    /** Whether pin interaction is enabled */
    this.interactionEnabled = false

    /** Optional filter: only these pin IDs are clickable (null = all visible) */
    this.clickableFilter = null

    _initColors()
  }

  /**
   * Load pins.glb, extract positions/cameras/light, then create pin instances.
   * @param {string} baseUrl
   */
  async load(baseUrl) {
    const result = await SceneLoader.ImportMeshAsync(
      '', `${baseUrl}models/extra/`, 'pins.glb', this.scene,
    )

    // Unified list: meshes + transform nodes
    const allNodes = [
      ...result.meshes,
      ...(result.transformNodes || []),
    ]

    if (IS_DEV) {
      console.log('[Pins] pins.glb loaded — meshes:',
        result.meshes.map(m => m.name).join(', '))
      console.log('[Pins] pins.glb loaded — transforms:',
        (result.transformNodes || []).map(n => n.name).join(', '))
    }

    // ── Extract pin geometry template ──────────────────────
    this._extractTemplate(allNodes)

    // ── Extract pin positions from GLB transforms ──────────
    this._extractPinPositions(allNodes)

    // ── Extract camera shots from GLB cameras ──────────────
    this._extractCameras(result, allNodes)

    // ── Extract directional light ──────────────────────────
    this._extractLight(result, allNodes)

    // ── Hide all GLB source meshes ─────────────────────────
    for (const m of result.meshes) {
      m.isVisible = false
      m.isPickable = false
      m.setEnabled(false)
    }

    // ── Create pin instances ───────────────────────────────
    this._createMeshes()
    this._startBobbing()

    if (IS_DEV) {
      console.log(`[Pins] Created ${this.pins.length} pins`)
      console.log('[Pins] Camera shots:', Object.keys(this.cameraShots))
    }
  }

  // ── GLB extraction ────────────────────────────────────────

  /** Find pin mesh children as geometry template */
  _extractTemplate(allNodes) {
    // Strategy 1: find pin-1 root and use its children with geometry
    const pin1Root = allNodes.find(m => m.name === 'pin-1')
    if (pin1Root) {
      const children = pin1Root.getChildMeshes(false).filter(m => m.getTotalVertices?.() > 0)
      if (children.length > 0) {
        this._templateMeshes = children
        if (IS_DEV) console.log(`[Pins] Template from pin-1 children: ${children.map(m => m.name).join(', ')}`)
        return
      }
    }

    // Strategy 2: any mesh whose name matches pin-1* with geometry
    const pin1Meshes = allNodes.filter(m =>
      m.name.match(/^pin-1/) && m.getTotalVertices?.() > 0,
    )
    if (pin1Meshes.length > 0) {
      this._templateMeshes = pin1Meshes
      if (IS_DEV) console.log(`[Pins] Template from pin-1* meshes: ${pin1Meshes.map(m => m.name).join(', ')}`)
      return
    }

    // Strategy 3: any pin mesh with geometry
    const anyPin = allNodes.filter(m =>
      m.name.startsWith('pin-') && m.getTotalVertices?.() > 0,
    )
    if (anyPin.length > 0) {
      this._templateMeshes = anyPin.slice(0, 3)
      if (IS_DEV) console.log(`[Pins] Template from pin-* meshes: ${this._templateMeshes.map(m => m.name).join(', ')}`)
      return
    }

    // Strategy 4 (pin.glb): ANY mesh with geometry (excluding __root__)
    const anyMesh = allNodes.filter(m =>
      m.name !== '__root__' && m.getTotalVertices?.() > 0,
    )
    this._templateMeshes = anyMesh
    if (IS_DEV) {
      console.log(`[Pins] Template fallback (any geometry): ${this._templateMeshes.map(m => m.name).join(', ') || 'NONE FOUND'}`)
    }
  }

  /** Extract pin-1 through pin-7 world positions */
  _extractPinPositions(allNodes) {
    // Find all pin root transforms (pin-1, pin-2, ... pin-7)
    const pinRoots = allNodes.filter(m => /^pin-\d+$/.test(m.name))
    pinRoots.sort((a, b) => {
      const na = parseInt(a.name.split('-')[1])
      const nb = parseInt(b.name.split('-')[1])
      return na - nb
    })

    for (const root of pinRoots) {
      root.computeWorldMatrix(true)
      const num = parseInt(root.name.split('-')[1])
      const pos = root.getAbsolutePosition()

      this.pins.push({
        id: `pin-${num}`,
        label: `Pin ${num}`,
        num,
        status: num === 1 ? 'normal' : 'invisible',
        visible: num === 1,
        position: { x: pos.x, y: pos.y, z: pos.z },
        hitScreenRadius: SETTINGS.pins.defaultHitScreenRadius,
      })
    }

    for (const pin of this.pins) {
      this.pinDataMap.set(pin.id, pin)
    }

    if (IS_DEV) {
      console.log(`[Pins] Extracted ${this.pins.length} pin positions:`,
        this.pins.map(p => `${p.id} @ (${p.position.x.toFixed(1)}, ${p.position.y.toFixed(1)}, ${p.position.z.toFixed(1)})`))
    }
  }

  /** Extract cameras: Cam-0-N (intro), Cam-pin-N (final), Cam-pin-N-W (waypoints) */
  _extractCameras(result, allNodes) {
    // BJS GLTF loader creates Camera objects for GLTF cameras.
    // These have a (0, PI, 0) base rotation so their world-matrix Z column = look direction.
    // TransformNodes (empties) do NOT have this PI rotation, so their look direction = negated Z column.
    const allCameras = this.scene.cameras.filter(c => c !== this.camera)

    // Also look for transform nodes / meshes named Cam-*
    const camTransforms = allNodes.filter(n => n.name.startsWith('Cam-'))

    if (IS_DEV) {
      console.log('[Pins] Scene cameras:', allCameras.map(c => c.name))
      console.log('[Pins] Cam-* nodes:', camTransforms.map(n => n.name))
    }

    const camDataMap = new Map()

    // Helper: compute look-at target from camera position + forward direction.
    // Uses ray-ground intersection (y = GROUND_Y) so the ArcRotateCamera orbit
    // center lands on the island surface instead of floating in mid-air.
    const GROUND_Y = 0
    const computeTarget = (pos, fwd) => {
      if (fwd.y < -0.01) {
        // Camera looks downward — intersect with ground plane
        const t = Math.min(Math.max(-(pos.y - GROUND_Y) / fwd.y, 5), 200)
        return pos.add(fwd.scale(t))
      }
      // Looking up or horizontal — use fixed distance
      return pos.add(fwd.scale(20))
    }

    // Pass 1: BJS Camera objects (from GLTF cameras).
    // DO NOT use cam.target — it defaults to (0,0,0) for GLTF-loaded FreeCamera.
    // BJS GLTF cameras have internal (0, PI, 0) rotation correction, so
    // the Z column of their world matrix IS the look direction.
    for (const cam of allCameras) {
      if (!cam.name.startsWith('Cam-')) continue
      cam.computeWorldMatrix(true)
      const wd = cam.getWorldMatrix()
      const pos = new Vector3(wd.m[12], wd.m[13], wd.m[14])
      const fwd = new Vector3(wd.m[8], wd.m[9], wd.m[10]).normalize()
      const target = computeTarget(pos, fwd)

      if (IS_DEV) {
        console.log(`[Pins]   BJS Camera ${cam.name}: pos=(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}) fwd=(${fwd.x.toFixed(3)}, ${fwd.y.toFixed(3)}, ${fwd.z.toFixed(3)}) target=(${target.x.toFixed(2)}, ${target.y.toFixed(2)}, ${target.z.toFixed(2)})`)
      }
      camDataMap.set(cam.name, { position: pos, target })
    }

    // Pass 2: TransformNodes / empties named Cam-* (no PI Y pre-rotation).
    // GLTF convention: cameras look down -Z. After BJS coord conversion,
    // the node's original -Z forward = negated Z column of world matrix.
    for (const node of camTransforms) {
      if (camDataMap.has(node.name)) continue
      node.computeWorldMatrix(true)
      const wd = node.getWorldMatrix()
      const pos = new Vector3(wd.m[12], wd.m[13], wd.m[14])
      const fwd = new Vector3(-wd.m[8], -wd.m[9], -wd.m[10]).normalize()
      const target = computeTarget(pos, fwd)

      if (IS_DEV) {
        console.log(`[Pins]   Node ${node.name}: pos=(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}) fwd=(${fwd.x.toFixed(3)}, ${fwd.y.toFixed(3)}, ${fwd.z.toFixed(3)}) target=(${target.x.toFixed(2)}, ${target.y.toFixed(2)}, ${target.z.toFixed(2)})`)
      }
      camDataMap.set(node.name, { position: pos, target })
    }

    if (IS_DEV) {
      console.log('[Pins] Camera data found:', [...camDataMap.keys()])
    }

    // ── Parse into shots ───────────────────────────────────
    for (const [name, data] of camDataMap) {
      const shot = worldPosToArcParams(data.position, data.target)
      shot.target = { x: data.target.x, y: data.target.y, z: data.target.z }

      // Cam-0-1, Cam-0-2, Cam-0-3 → intro shots
      const introMatch = name.match(/^Cam-0-(\d+)$/)
      if (introMatch) {
        this.cameraShots[`intro-${introMatch[1]}`] = shot
        continue
      }

      // Cam-pin-N → final shot for pin N
      const pinFinalMatch = name.match(/^Cam-pin-(\d+)$/)
      if (pinFinalMatch) {
        this.cameraShots[`pin-${pinFinalMatch[1]}`] = shot
        continue
      }

      // Cam-pin-N-W → waypoint W for pin N
      const pinWpMatch = name.match(/^Cam-pin-(\d+)-(\d+)$/)
      if (pinWpMatch) {
        const pinKey = `pin-${pinWpMatch[1]}-waypoints`
        if (!this.cameraShots[pinKey]) this.cameraShots[pinKey] = []
        this.cameraShots[pinKey].push({ order: parseInt(pinWpMatch[2]), shot })
        continue
      }
    }

    // Sort waypoint arrays by order
    for (const key of Object.keys(this.cameraShots)) {
      if (key.endsWith('-waypoints') && Array.isArray(this.cameraShots[key])) {
        this.cameraShots[key].sort((a, b) => a.order - b.order)
        this.cameraShots[key] = this.cameraShots[key].map(w => w.shot)
      }
    }
  }

  /** Extract light-dir spotlight → directional light with shadows for pins */
  _extractLight(result, allNodes) {
    // Look for light-dir in lights, transform nodes, or meshes
    const lightNode = [
      ...(result.lights || []),
      ...allNodes,
    ].find(n => n.name === 'light-dir')

    if (!lightNode) {
      if (IS_DEV) console.warn('[Pins] No light-dir found in pins.glb')
      return
    }

    // Extract direction from the node's transform
    let direction
    if (lightNode.direction) {
      direction = lightNode.direction.clone()
    } else {
      const world = lightNode.getWorldMatrix()
      // Negative Z is forward in GLTF
      direction = new Vector3(-world.m[8], -world.m[9], -world.m[10]).normalize()
    }

    const pos = lightNode.getAbsolutePosition?.() || Vector3.Zero()

    // Create directional light
    const light = new DirectionalLight('pinDirLight', direction, this.scene)
    light.position = pos.clone()
    light.intensity = SETTINGS.pins.lightIntensity ?? 1.5
    light.diffuse = new Color3(1, 0.95, 0.85)
    light.specular = new Color3(0.5, 0.5, 0.5)

    this.pinLight = light

    // Dispose the original GLB light if it's a BJS light (to avoid doubling)
    if (lightNode.dispose && lightNode !== light) {
      lightNode.setEnabled(false)
    }

    if (IS_DEV) {
      console.log(`[Pins] Pin light created: dir=(${direction.x.toFixed(2)}, ${direction.y.toFixed(2)}, ${direction.z.toFixed(2)})`)
    }
  }

  /** Create directional light + shadows from hardcoded SETTINGS (no GLB needed) */
  _createLightFromSettings() {
    const cfg = SETTINGS.pins
    const dir = cfg.lightDirection
    const pos = cfg.lightPosition
    if (!dir) {
      if (IS_DEV) console.warn('[Pins] No lightDirection in SETTINGS.pins')
      return
    }

    const direction = new Vector3(dir.x, dir.y, dir.z)
    const light = new DirectionalLight('pinDirLight', direction, this.scene)
    light.position = new Vector3(pos?.x ?? 0, pos?.y ?? 30, pos?.z ?? 0)
    light.intensity = cfg.lightIntensity ?? 1.5
    light.diffuse = new Color3(1, 0.95, 0.85)
    light.specular = new Color3(0.5, 0.5, 0.5)

    this.pinLight = light

    if (IS_DEV) {
      console.log(`[Pins] Pin light from settings: dir=(${dir.x.toFixed(2)}, ${dir.y.toFixed(2)}, ${dir.z.toFixed(2)})`)
    }
  }

  /** Create invisible hit-box meshes from JSON hitBox data for each pin */
  _createHitBoxes() {
    const defaultSize = SETTINGS.pins.defaultHitBoxSize || { x: 3, y: 6, z: 3 }
    for (const pin of this.pins) {
      const hb = pin.hitBox || {}
      const size = hb.size || defaultSize
      const offset = hb.offset || { x: 0, y: 0, z: 0 }

      const box = MeshBuilder.CreateBox(`hitbox_${pin.id}`, {
        width: size.x, height: size.y, depth: size.z,
      }, this.scene)
      box.position = new Vector3(
        pin.position.x + offset.x,
        pin.position.y + offset.y,
        pin.position.z + offset.z,
      )
      box.isVisible = false
      box.isPickable = true
      this.hitMeshes.set(pin.id, box)
    }
    if (IS_DEV) console.log(`[Pins] Created ${this.hitMeshes.size} hit boxes from JSON`)
  }

  // ── Instance creation ─────────────────────────────────────

  /** Create a pin mesh for each pin */
  _createMeshes() {
    for (const pin of this.pins) {
      const mesh = this._createPinInstance(pin)
      this.meshes.set(pin.id, mesh)
    }
  }

  _createPinInstance(pin) {
    const cfg = SETTINGS.pins
    const mat = new PBRMaterial(`pinMat_${pin.id}`, this.scene)
    const color = STATUS_COLORS[pin.status] || STATUS_COLORS.locked
    const emScale = STATUS_EMISSIVE_SCALE[pin.status] ?? 0.2
    mat.albedoColor = color
    mat.emissiveColor = color.scale(emScale)
    mat.metallic = cfg.metallic ?? 0.0
    mat.roughness = cfg.roughness ?? 0.6
    mat.environmentIntensity = cfg.environmentIntensity ?? 0.5
    // Ambient contribution (scene.ambientColor * mat.ambientColor)
    const amb = cfg.ambientColor || { r: 0.15, g: 0.15, b: 0.2 }
    mat.ambientColor = new Color3(amb.r, amb.g, amb.b)

    const parent = new Mesh(`pin_${pin.id}`, this.scene)
    parent.position = new Vector3(pin.position.x, pin.position.y, pin.position.z)

    const scale = cfg.meshScale ?? 1

    for (const tmpl of this._templateMeshes) {
      if (!tmpl.getTotalVertices || tmpl.getTotalVertices() === 0) continue
      // If template is an InstancedMesh (BJS GLTF auto-instancing), clone from
      // the source mesh instead — cloning an InstancedMesh creates another
      // InstancedMesh whose .material assignment is silently ignored.
      const cloneSource = tmpl.sourceMesh || tmpl
      const clone = cloneSource.clone(`pin_${pin.id}_${tmpl.name}`, parent)
      clone.setEnabled(true)    // source may be disabled — force-enable the clone
      clone.isVisible = true
      clone.isPickable = false
      clone.material = mat
      if (scale !== 1) clone.scaling.setAll(scale)
      clone.receiveShadows = false
    }

    const isVis = pin.status !== 'invisible'
    parent.isVisible = isVis
    parent.setEnabled(isVis)
    parent.isPickable = false
    parent._pinBaseY = pin.position.y

    return parent
  }

  /**
   * Make pin light illuminate ONLY pin meshes via includedOnlyMeshes.
   */
  _setupLightForPins() {
    if (!this.pinLight) return
    const pinChildMeshes = []
    for (const [, parent] of this.meshes) {
      for (const child of parent.getChildMeshes()) {
        pinChildMeshes.push(child)
      }
    }
    this.pinLight.includedOnlyMeshes = pinChildMeshes
    if (IS_DEV) console.log(`[Pins] Pin light restricted to ${pinChildMeshes.length} pin meshes`)
  }

  /** Start the bobbing + face-camera animation loop */
  _startBobbing() {
    // Restrict pin light to only illuminate pin meshes
    this._setupLightForPins()

    const cfg = SETTINGS.pins
    const animated = cfg.animatePins !== false   // default true
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    let prefersReduced = mq?.matches ?? false
    mq?.addEventListener?.('change', (e) => { prefersReduced = e.matches })

    this._bobbingObserver = this.scene.onBeforeRenderObservable.add(() => {
      const camPos = this.camera.position
      for (const [id, mesh] of this.meshes) {
        if (!mesh.isEnabled()) continue

        if (animated && !prefersReduced) {
          // Bobbing + rotation animation (triggers continuous render)
          const t = (performance.now() - this._startTime) / 1000
          mesh.position.y = mesh._pinBaseY + Math.sin(t * cfg.bobbingSpeed * Math.PI * 2) * cfg.bobbingAmplitude
          mesh.rotation.y += cfg.rotationSpeed * this.scene.getEngine().getDeltaTime() / 1000
          window.__requestRender?.()
        } else {
          // Static: billboard Y — always face camera around Y axis only
          const dx = camPos.x - mesh.position.x
          const dz = camPos.z - mesh.position.z
          mesh.rotation.y = Math.atan2(dx, dz)
        }
      }
    })
  }

  // ── Sequential unlock logic ───────────────────────────────

  /**
   * Get camera path for a pin: all ordered steps.
   * Generic: handles single-shot (Cam-pin-N) AND multi-step (Cam-pin-N-1, Cam-pin-N-2, …).
   *
   * Resolution order for the final shot:
   *   1. Direct `pin-N` entry (from Cam-pin-N)
   *   2. Last entry in `pin-N-waypoints` array (from Cam-pin-N-K where K is the highest step)
   *
   * Waypoints are all steps EXCEPT the final one (for multi-step paths).
   *
   * @param {string} pinId e.g. 'pin-3' or 'pin-5'
   * @returns {{ waypoints: object[], finalShot: object } | null}
   */
  getCameraPath(pinId) {
    const num = pinId.replace('pin-', '')
    const directShot = this.cameraShots[`pin-${num}`]
    const stepsArray = this.cameraShots[`pin-${num}-waypoints`] || []

    // Multi-step: stepsArray has 2+ entries → waypoints = all but last, finalShot = last
    if (stepsArray.length >= 2) {
      return {
        waypoints: stepsArray.slice(0, -1),
        finalShot: directShot || stepsArray[stepsArray.length - 1],
      }
    }

    // Single step in array + direct shot: step is waypoint, direct is final
    if (stepsArray.length === 1 && directShot) {
      return { waypoints: stepsArray, finalShot: directShot }
    }

    // Single step in array, no direct shot: the step IS the final
    if (stepsArray.length === 1) {
      return { waypoints: [], finalShot: stepsArray[0] }
    }

    // Direct shot only (simple single-position pin)
    if (directShot) {
      return { waypoints: [], finalShot: directShot }
    }

    return null
  }

  /**
   * Mark a pin as completed.
   * After the tutorial (pin-1) is completed, ALL pins 2–6 unlock at once.
   * After ALL pins 1–6 are completed, pin-7 (finale) unlocks.
   */
  completePin(pinId) {
    this.setStatus(pinId, 'completed')
    const num = parseInt(pinId.replace('pin-', ''))

    // Tutorial completion → batch-unlock pins 2–6
    if (num === 1) {
      for (let i = 2; i <= Math.min(6, this.pins.length); i++) {
        const id = `pin-${i}`
        const pin = this.pinDataMap.get(id)
        if (pin && pin.status === 'invisible') {
          this.setStatus(id, 'normal')
        }
      }
      return
    }

    // After completing a non-tutorial pin, check if 1–6 are all done → unlock 7
    const mainComplete = this.pins
      .filter(p => p.num >= 1 && p.num <= 6)
      .every(p => p.status === 'completed')
    if (mainComplete) {
      const pin7 = this.pinDataMap.get('pin-7')
      if (pin7 && pin7.status !== 'completed') {
        this.setStatus('pin-7', 'normal')
      }
    }
  }

  /**
   * Initialize the first pin as visible/normal, all others invisible.
   * Called at game start.
   */
  initProgression() {
    for (const pin of this.pins) {
      if (pin.num === 1) {
        this.setStatus(pin.id, 'normal')
      } else {
        this.setStatus(pin.id, 'invisible')
      }
    }
  }

  // ── Status & visibility ───────────────────────────────────

  /** Update a pin's status and refresh its visual */
  setStatus(pinId, status) {
    const pin = this.pinDataMap.get(pinId)
    if (!pin) return
    pin.status = status

    const mesh = this.meshes.get(pinId)
    if (!mesh) return

    const mat = mesh.getChildMeshes()[0]?.material
    if (mat) {
      const color = STATUS_COLORS[status] || STATUS_COLORS.locked
      const emScale = STATUS_EMISSIVE_SCALE[status] ?? 0.2
      mat.albedoColor = color
      mat.emissiveColor = color.scale(emScale)
    }

    const isVis = status !== 'invisible'
    mesh.setEnabled(isVis)
    for (const child of mesh.getChildMeshes()) {
      child.isVisible = isVis
    }

    window.__requestRender?.()
  }

  /** Show / hide a specific pin */
  setVisible(pinId, visible) {
    const pin = this.pinDataMap.get(pinId)
    if (pin) pin.visible = visible

    const mesh = this.meshes.get(pinId)
    if (mesh) {
      mesh.setEnabled(visible)
      for (const child of mesh.getChildMeshes()) {
        child.isVisible = visible
      }
    }
    window.__requestRender?.()
  }

  /** Show all non-invisible pins */
  showAll() {
    for (const pin of this.pins) {
      this.setVisible(pin.id, pin.status !== 'invisible')
    }
  }

  /** Move a pin to a new world position */
  movePin(pinId, x, y, z) {
    const pin = this.pinDataMap.get(pinId)
    if (pin) pin.position = { x, y, z }
    const mesh = this.meshes.get(pinId)
    if (mesh) {
      mesh.position.set(x, y, z)
      mesh._pinBaseY = y
    }
    window.__requestRender?.()
  }

  /** Update/get the runtime status color for a given status */
  static getStatusColor(status) {
    return STATUS_COLORS[status]
  }

  static setStatusColor(status, color) {
    STATUS_COLORS[status] = color instanceof Color3 ? color : new Color3(color.r, color.g, color.b)
  }

  // ── Hit detection (screen-space, mobile-first) ────────────

  hitTest(screenX, screenY) {
    if (!this.interactionEnabled) return null

    // ── Ray-based picking using hit-box meshes if available ──
    if (this.hitMeshes.size > 0) {
      // Build list of pickable hit meshes for visible, clickable pins
      const pickableMeshes = []
      const meshToPinMap = new Map()
      for (const pin of this.pins) {
        if (pin.status === 'invisible') continue
        if (this.clickableFilter && !this.clickableFilter.includes(pin.id)) continue
        if (!IS_DEV && !CLICKABLE_STATUSES.has(pin.status)) continue

        const hitMesh = this.hitMeshes.get(pin.id)
        if (!hitMesh) continue
        pickableMeshes.push(hitMesh)
        meshToPinMap.set(hitMesh, pin)
      }

      if (pickableMeshes.length) {
        // scene.pick() expects CSS canvas coordinates, not device pixels.
        // getHardwareScalingLevel() == 1/DPR when adaptToDeviceRatio=true.
        const hwScale = this.scene.getEngine().getHardwareScalingLevel?.() ?? 1
        const pickResult = this.scene.pick(screenX * hwScale, screenY * hwScale, (mesh) => pickableMeshes.includes(mesh))
        if (pickResult?.hit && pickResult.pickedMesh) {
          return meshToPinMap.get(pickResult.pickedMesh) || null
        }
        return null
      }
    }

    // ── Fallback: screen-space radius hit test ──────────────
    const engine = this.engine
    const w = engine.getRenderWidth()
    const h = engine.getRenderHeight()
    const viewport = new Viewport(0, 0, w, h)

    let closest = null
    let closestDist = Infinity

    for (const pin of this.pins) {
      if (pin.status === 'invisible') continue
      if (this.clickableFilter && !this.clickableFilter.includes(pin.id)) continue
      if (!IS_DEV && !CLICKABLE_STATUSES.has(pin.status)) continue

      const mesh = this.meshes.get(pin.id)
      if (!mesh || !mesh.isEnabled()) continue

      const worldPos = mesh.position
      const screenPos = Vector3.Project(
        worldPos,
        Matrix.Identity(),
        this.scene.getTransformMatrix(),
        viewport,
      )

      if (screenPos.z < 0 || screenPos.z > 1) continue

      const dx = screenX - screenPos.x
      const dy = screenY - screenPos.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const hitRadius = pin.hitScreenRadius || SETTINGS.pins.defaultHitScreenRadius

      if (dist <= hitRadius && dist < closestDist) {
        closest = pin
        closestDist = dist
      }
    }

    return closest
  }

  getScreenPosition(pinId) {
    const mesh = this.meshes.get(pinId)
    if (!mesh || !mesh.isEnabled()) return null

    const engine = this.engine
    const w = engine.getRenderWidth()
    const h = engine.getRenderHeight()
    const viewport = new Viewport(0, 0, w, h)

    return Vector3.Project(
      mesh.position,
      Matrix.Identity(),
      this.scene.getTransformMatrix(),
      viewport,
    )
  }

  /** Export current pin + camera data as JSON string (for persisting to pins.json) */
  exportJSON() {
    // Build a clean export: pin positions + camera shots
    const pinsExport = this.pins.map(p => ({
      id: p.id,
      label: p.label,
      num: p.num,
      position: p.position,
      hitScreenRadius: p.hitScreenRadius,
    }))
    return JSON.stringify({
      pins: pinsExport,
      cameraShots: this.cameraShots,
    }, null, 2)
  }

  /**
   * Load pin positions and camera shots from a pre-extracted JSON object.
   * Pin mesh geometry comes from pin.glb (single-pin shipped asset).
   * Light is created from hardcoded constants (no GLB needed).
   *
   * @param {object} json - { pins: [...], cameraShots: {...} }
   * @param {string} baseUrl - for loading the GLB template mesh
   */
  async loadFromJSON(json, baseUrl) {
    // Load pin.glb for mesh template only — NOT pins.glb
    const result = await SceneLoader.ImportMeshAsync(
      '', `${baseUrl}models/extra/`, 'pin.glb', this.scene,
    )
    const allNodes = [...result.meshes, ...(result.transformNodes || [])]
    this._extractTemplate(allNodes)

    // Hide all GLB source meshes
    for (const m of result.meshes) {
      m.isVisible = false
      m.isPickable = false
      m.setEnabled(false)
    }

    // Load pins from JSON
    for (const p of json.pins) {
      this.pins.push({
        id: p.id,
        label: p.label,
        num: p.num,
        status: p.num === 1 ? 'normal' : 'invisible',
        visible: p.num === 1,
        position: p.position,
        hitScreenRadius: p.hitScreenRadius || SETTINGS.pins.defaultHitScreenRadius,
        hitBox: p.hitBox || null,
      })
    }
    for (const pin of this.pins) {
      this.pinDataMap.set(pin.id, pin)
    }

    // Load camera shots from JSON
    this.cameraShots = json.cameraShots || {}

    // Create light from hardcoded settings (no GLB dependency)
    this._createLightFromSettings()

    // Create pin instances
    this._createMeshes()

    // Create hit-box meshes from JSON hitBox data
    this._createHitBoxes()

    this._startBobbing()

    if (IS_DEV) {
      console.log(`[Pins] Loaded ${this.pins.length} pins from JSON`)
      console.log('[Pins] Camera shots:', Object.keys(this.cameraShots))
    }
  }

  /**
   * Load from GLB and return the extracted data (for "Read from GLB" dev button).
   * Does NOT create pin meshes — call exportJSON() after to get the data.
   * @param {string} baseUrl
   * @returns {Promise<object>} the JSON-serializable pin+camera data
   */
  async readFromGLB(baseUrl) {
    const result = await SceneLoader.ImportMeshAsync(
      '', `${baseUrl}models/extra/`, 'pins.glb', this.scene,
    )
    const allNodes = [...result.meshes, ...(result.transformNodes || [])]

    // Temporarily store into fresh arrays
    const savedPins = this.pins
    const savedShots = this.cameraShots
    this.pins = []
    this.cameraShots = {}

    this._extractPinPositions(allNodes)
    this._extractCameras(result, allNodes)

    const data = {
      pins: this.pins.map(p => ({
        id: p.id, label: p.label, num: p.num,
        position: p.position,
        hitScreenRadius: p.hitScreenRadius,
      })),
      cameraShots: this.cameraShots,
    }

    // Restore previous data (don't overwrite running state)
    this.pins = savedPins
    this.cameraShots = savedShots

    // Clean up the temporary GLB import
    for (const m of result.meshes) {
      m.dispose()
    }
    for (const n of (result.transformNodes || [])) {
      n.dispose()
    }

    return data
  }

  /** Dispose all pin meshes and light */
  dispose() {
    if (this._bobbingObserver) {
      this.scene.onBeforeRenderObservable.remove(this._bobbingObserver)
    }
    for (const [, mesh] of this.meshes) {
      mesh.getChildMeshes().forEach(c => {
        c.material?.dispose()
        c.dispose()
      })
      mesh.dispose()
    }
    this.meshes.clear()
    for (const [, hitMesh] of this.hitMeshes) {
      hitMesh.dispose()
    }
    this.hitMeshes.clear()
    this.pinLight?.dispose()
    if (this._templateMeshes) {
      this._templateMeshes.forEach(m => m.dispose())
    }
  }
}
