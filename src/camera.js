import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { SETTINGS } from './constants'

export function setupCamera(scene, canvas) {
  const c = SETTINGS.camera
  const camera = new ArcRotateCamera(
    'cam', c.initialAlpha, c.initialBeta, c.initialRadius,
    Vector3.Zero(), scene,
  )
  camera.attachControl(canvas, true)
  camera.lowerBetaLimit    = c.lowerBetaLimit
  camera.upperBetaLimit    = c.upperBetaLimit
  camera.lowerRadiusLimit  = c.lowerRadiusLimit
  camera.upperRadiusLimit  = c.upperRadiusLimit
  camera.wheelPrecision    = c.wheelPrecision
  camera.pinchPrecision    = c.pinchPrecision
  camera.panningSensibility = c.panningSensibility
  camera.minZ              = c.minZ
  return camera
}

/** Re-frame after all models are loaded */
export function frameCamera(camera, min, max) {
  const c = SETTINGS.camera
  camera.setTarget(Vector3.Center(min, max))
  const span = Vector3.Distance(min, max)
  camera.radius = Math.min(span * 0.45, c.upperRadiusLimit)
  camera.upperRadiusLimit = Math.max(span * 2, c.upperRadiusLimit)
  camera.alpha = c.initialAlpha
  camera.beta  = c.initialBeta
}
