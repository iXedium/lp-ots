import { WaterMaterial }  from '@babylonjs/materials/water'
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture'
import { Texture }        from '@babylonjs/core/Materials/Textures/texture'
import { Color3 }         from '@babylonjs/core/Maths/math.color'
import { Vector2 }        from '@babylonjs/core/Maths/math.vector'
import { SETTINGS }       from './constants'

/** Procedural 128×128 noise-based normal map for water ripples */
function createWaterBump(scene) {
  const size = 128
  const dt = new DynamicTexture('waterBump', { width: size, height: size }, scene)
  const ctx = dt.getContext()
  const img = ctx.createImageData(size, size)
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i]     = 128 + ((Math.random() - 0.5) * 40) | 0  // R
    img.data[i + 1] = 128 + ((Math.random() - 0.5) * 40) | 0  // G
    img.data[i + 2] = 255                                       // B (up)
    img.data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  dt.update()
  dt.wrapU = Texture.WRAP_ADDRESSMODE
  dt.wrapV = Texture.WRAP_ADDRESSMODE
  return dt
}

/** Create a WaterMaterial with animated ripples and sky reflection */
export function createWaterMaterial(scene) {
  if (!SETTINGS.water.enabled) return null

  const w = SETTINGS.water
  const rt = w.renderTargetSize
  const water = new WaterMaterial('poolWater', scene, new Vector2(rt, rt))

  water.bumpTexture    = createWaterBump(scene)
  water.bumpHeight     = w.bumpHeight
  water.waterColor     = new Color3(w.color.r, w.color.g, w.color.b)
  water.waterColor2    = new Color3(w.color.r * 0.6, w.color.g * 0.85, w.color.b * 0.9)
  water.colorBlendFactor = w.colorBlendFactor
  water.windForce      = w.windForce
  water.waveHeight     = w.waveHeight
  water.waveLength     = w.waveLength
  water.backFaceCulling = true

  return water
}

/**
 * Replace the material on pool-water meshes and add the skybox
 * to the reflection/refraction render list (lightweight — no models).
 */
export function applyWater(waterMat, meshes, skybox) {
  if (!waterMat) return
  if (skybox) waterMat.addToRenderList(skybox)
  for (const mesh of meshes) {
    if (mesh.material) mesh.material = waterMat
  }
}
