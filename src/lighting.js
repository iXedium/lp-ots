import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator'
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { SETTINGS } from './constants'

export function setupLighting(scene) {
  if (!SETTINGS.lighting.enabled) return null

  const l = SETTINGS.lighting
  const hemi = new HemisphericLight('hemiLight', new Vector3(0, 1, 0), scene)
  hemi.intensity = l.ambientIntensity

  const sunDir = new Vector3(l.sunDirection.x, l.sunDirection.y, l.sunDirection.z)
  const sun = new DirectionalLight('sunLight', sunDir.normalize(), scene)
  sun.position = new Vector3(l.sunPosition.x, l.sunPosition.y, l.sunPosition.z)
  sun.intensity = l.sunIntensity

  const shadowGen = new ShadowGenerator(l.shadowMapSize, sun)
  shadowGen.usePercentageCloserFiltering = true
  shadowGen.filteringQuality = ShadowGenerator.QUALITY_HIGH
  shadowGen.bias = l.shadowBias
  shadowGen.normalBias = l.normalBias
  shadowGen.darkness = l.darkness

  return { hemi, sun, shadowGen }
}

export function applyShadows(modelData, shadowGen) {
  if (!modelData || !shadowGen) return

  for (const data of Object.values(modelData)) {
    if (!data?.shadowCasters) continue
    for (const mesh of data.shadowCasters) {
      if (!mesh) continue
      mesh.receiveShadows = true

      const mat = mesh.material
      const isTransparent = !!(
        mat && (
          (typeof mat.alpha === 'number' && mat.alpha < 0.98)
          || (mat.needAlphaBlendingForMesh && mat.needAlphaBlendingForMesh(mesh))
        )
      )
      if (!isTransparent) shadowGen.addShadowCaster(mesh)
    }
  }
}
