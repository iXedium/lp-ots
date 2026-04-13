import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import gsap from 'gsap'
import { SETTINGS } from './constants'
import { IS_DEV } from './isDev'

/** Convert a shot (alpha/beta/radius/target) to world-space camera position */
function shotToWorldPos(shot) {
  const sinB = Math.sin(shot.beta)
  return new Vector3(
    shot.target.x + shot.radius * sinB * Math.cos(shot.alpha),
    shot.target.y + shot.radius * Math.cos(shot.beta),
    shot.target.z + shot.radius * sinB * Math.sin(shot.alpha),
  )
}

// ─────────────────────────────────────────────────────────────

/**
 * CameraManager — wraps the ArcRotateCamera with fly-to animations,
 * limit management, and shot recording.
 */
export class CameraManager {
  /**
   * @param {import('@babylonjs/core/Cameras/arcRotateCamera').ArcRotateCamera} camera
   * @param {HTMLCanvasElement} canvas
   */
  constructor(camera, canvas) {
    this.camera = camera
    this.canvas = canvas

    /** Last recorded orbit position (for fly-back) */
    this.lastOrbitShot = null

    /** Active GSAP timeline (null when idle) */
    this._tl = null
  }

  // ── Shot helpers ───────────────────────────────────────────

  /** Capture the camera's current arc-rotate state as a shot object */
  captureShot() {
    const c = this.camera
    return {
      alpha: c.alpha,
      beta: c.beta,
      radius: c.radius,
      target: { x: c.target.x, y: c.target.y, z: c.target.z },
    }
  }

  /** Record current position as last orbit shot (called before fly-to-pin) */
  saveOrbitPosition() {
    this.lastOrbitShot = this.captureShot()
    if (IS_DEV) console.log('[Camera] Saved orbit position:', this.lastOrbitShot)
  }

  // ── Limit management ──────────────────────────────────────

  /** Remove all limits so GSAP can drive the camera freely */
  _removeLimits() {
    const c = this.camera
    c.lowerAlphaLimit = null
    c.upperAlphaLimit = null
    c.lowerBetaLimit = null
    c.upperBetaLimit = null
    c.lowerRadiusLimit = null
    c.upperRadiusLimit = null
  }

  /** Restore orbit limits from SETTINGS (release or dev) */
  restoreOrbitLimits() {
    const c = this.camera
    const s = SETTINGS.camera
    if (IS_DEV) {
      c.lowerBetaLimit = s.dev_lowerBetaLimit
      c.upperBetaLimit = s.dev_upperBetaLimit
      c.lowerRadiusLimit = s.dev_lowerRadiusLimit
      c.upperRadiusLimit = s.dev_upperRadiusLimit
    } else {
      c.lowerBetaLimit = s.lowerBetaLimit
      c.upperBetaLimit = s.upperBetaLimit
      c.lowerRadiusLimit = s.lowerRadiusLimit
      c.upperRadiusLimit = s.upperRadiusLimit
    }
  }

  // ── User control ──────────────────────────────────────────

  detachControl() {
    this.camera.detachControl()
  }

  attachControl() {
    this.camera.attachControl(this.canvas, true)
  }

  // ── Fly-to ────────────────────────────────────────────────

  /**
   * Animate camera to a target shot.
   * @param {object} shot - { alpha, beta, radius, target: {x,y,z} }
   * @param {object} [opts]
   * @param {number}  [opts.duration]    - seconds (default auto-scaled)
   * @param {string}  [opts.easing]      - GSAP ease string
   * @param {boolean} [opts.arc]         - radius bell-curve swell (default false)
   * @param {boolean} [opts.worldSpace]  - lerp world pos+target instead of arc params (default false)
   * @param {boolean} [opts.detach]      - detach user control (default true)
   * @param {boolean} [opts.reattach]    - re-attach on complete (default false)
   * @returns {Promise<void>}
   */
  flyTo(shot, opts = {}) {
    const cfg = SETTINGS.flyTo
    const easing = opts.easing ?? cfg.easing
    const useArc = opts.arc === true
    const useWorld = opts.worldSpace === true
    const shouldDetach = opts.detach !== false
    const shouldReattach = opts.reattach === true

    // Auto-scale duration
    let duration = opts.duration ?? cfg.defaultDuration
    if (opts.duration == null) {
      const cam = this.camera
      const dAlpha = Math.abs(shot.alpha - cam.alpha)
      const dBeta = Math.abs(shot.beta - cam.beta)
      const dRadius = Math.abs(shot.radius - cam.radius)
      const angularDelta = Math.sqrt(dAlpha * dAlpha + dBeta * dBeta)
      const scaledDur = cfg.defaultDuration + angularDelta * 0.15 + dRadius * 0.005
      duration = Math.min(Math.max(scaledDur, cfg.defaultDuration), cfg.defaultDuration * 2)
    }

    if (this._tl) { this._tl.kill(); this._tl = null }
    if (shouldDetach) this.detachControl()
    this._removeLimits()
    window.__requestRender?.()

    const cam = this.camera
    const tl = gsap.timeline()
    this._tl = tl

    if (useWorld) {
      // ── World-space interpolation ───────────────────────────
      // Lerp camera world position + target directly.
      const startShot = this.captureShot()
      const startPos = shotToWorldPos(startShot)
      const endPos = shotToWorldPos(shot)
      const startTarget = cam.target.clone()
      const endTarget = new Vector3(shot.target.x, shot.target.y, shot.target.z)

      const proxy = { t: 0 }
      tl.to(proxy, {
        t: 1,
        duration,
        ease: easing,
        onUpdate: () => {
          const p = proxy.t
          const pos = Vector3.Lerp(startPos, endPos, p)
          const target = Vector3.Lerp(startTarget, endTarget, p)
          cam.target.copyFrom(target)
          const params = worldPosToArcParams(pos, target)
          cam.alpha = params.alpha
          cam.beta = params.beta
          cam.radius = params.radius
          window.__requestRender?.()
        },
      })
    } else {
      // ── Arc-rotate parameter interpolation ──────────────────

      // Normalise target alpha to the shortest angular path (avoid 360° sweep)
      let targetAlpha = shot.alpha
      let deltaAlpha = targetAlpha - cam.alpha
      deltaAlpha -= Math.round(deltaAlpha / (2 * Math.PI)) * 2 * Math.PI
      targetAlpha = cam.alpha + deltaAlpha

      const dAlpha = targetAlpha - cam.alpha
      const dBeta = shot.beta - cam.beta
      const angDist = Math.sqrt(dAlpha * dAlpha + dBeta * dBeta)

      // Alpha / Beta
      tl.to(cam, {
        alpha: targetAlpha,
        beta: shot.beta,
        duration,
        ease: easing,
        onUpdate: () => window.__requestRender?.(),
      }, 0)

      // Radius (with optional arc swell)
      if (useArc && angDist > cfg.arcAngleThreshold) {
        const startR = cam.radius
        const endR = shot.radius
        const arcScale = Math.min((angDist - cfg.arcAngleThreshold) * cfg.arcSensitivity, cfg.arcMaxSwell)
        const swellMax = Math.max(startR, endR) * arcScale
        const proxy = { t: 0 }
        tl.to(proxy, {
          t: 1,
          duration,
          ease: easing,
          onUpdate: () => {
            const p = proxy.t
            const linear = startR + (endR - startR) * p
            const bell = Math.sin(p * Math.PI)
            cam.radius = linear + swellMax * bell
            window.__requestRender?.()
          },
        }, 0)
      } else {
        tl.to(cam, {
          radius: shot.radius,
          duration,
          ease: easing,
          onUpdate: () => window.__requestRender?.(),
        }, 0)
      }

      // Target
      tl.to(cam.target, {
        x: shot.target.x,
        y: shot.target.y,
        z: shot.target.z,
        duration,
        ease: easing,
        onUpdate: () => window.__requestRender?.(),
      }, 0)
    }

    return new Promise((resolve) => {
      tl.then(() => {
        this._tl = null
        if (shouldReattach) {
          this.restoreOrbitLimits()
          this.attachControl()
        }
        window.__requestRender?.()
        if (IS_DEV) console.log('[Camera] flyTo complete')
        resolve()
      })
    })
  }

  /**
   * Animate camera through waypoints to a final shot by chaining flyTo calls.
   *
   * Each waypoint and finalShot may carry per-shot overrides:
   *   { duration, easing, arc, worldSpace }
   *
   * The first segment (current → w1) uses arc-rotate param interpolation.
   * Subsequent segments (w1 → w2, etc.) default to worldSpace:true so
   * the camera travels in a straight line instead of swinging through
   * wildly different arc-rotate radii.
   *
   * @param {object[]} waypoints - intermediate shots
   * @param {object}   finalShot - destination shot
   * @param {object}   [opts]
   * @param {boolean}  [opts.detach]    - detach user control (default true)
   * @param {boolean}  [opts.reattach]  - re-attach on complete (default false)
   * @returns {Promise<void>}
   */
  async flyToPath(waypoints, finalShot, opts = {}) {
    const allShots = [...waypoints, finalShot]
    if (allShots.length === 1 && !waypoints.length) {
      return this.flyTo(finalShot, opts)
    }

    for (let i = 0; i < allShots.length; i++) {
      const shot = allShots[i]
      const isFirst = i === 0
      const isLast = i === allShots.length - 1

      await this.flyTo(shot, {
        duration: shot.duration ?? undefined,
        easing: shot.easing ?? undefined,
        arc: shot.arc ?? false,
        worldSpace: shot.worldSpace ?? !isFirst,  // default: world-space for non-first segments
        detach: true,
        reattach: isLast ? (opts.reattach === true) : false,
      })
    }
  }

  /**
   * Fly camera to the island orbit overview position.
   * @returns {Promise<void>}
   */
  flyToOrbit() {
    const shot = this.lastOrbitShot || SETTINGS.orbit
    return this.flyTo(shot, { arc: false, reattach: true })
  }

  /** Whether a fly animation is currently running */
  get isFlying() {
    return this._tl !== null && this._tl.isActive()
  }
}

// ── Utility ─────────────────────────────────────────────────

/**
 * Given a world position and look-at target, compute the ArcRotateCamera
 * alpha/beta/radius parameters.
 * @param {Vector3} position - world-space camera position
 * @param {Vector3} target - world-space look-at point
 * @returns {{ alpha: number, beta: number, radius: number }}
 */
export function worldPosToArcParams(position, target) {
  const dir = position.subtract(target)
  const radius = dir.length()
  const beta = Math.acos(dir.y / radius)
  const alpha = Math.atan2(dir.z, dir.x)
  return { alpha, beta, radius }
}
