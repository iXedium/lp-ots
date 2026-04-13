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

  // Mobile-friendly: increase angular sensitivity so small finger jitter
  // doesn't trigger orbit rotation (higher value = slower rotation response).
  // Defaults are ~1000; increase for touch-friendly behaviour.
  camera.angularSensibilityX = c.angularSensibilityX ?? 1000
  camera.angularSensibilityY = c.angularSensibilityY ?? 1000

  return camera
}

/** Adjust limits after all models are loaded (no snap, no target change) */
export function frameCamera(camera, min, max) {
  const c = SETTINGS.camera
  const span = Vector3.Distance(min, max)
  camera.upperRadiusLimit = Math.max(span * 2, c.upperRadiusLimit)
}
