import { Scene }        from '@babylonjs/core/scene'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { SETTINGS }     from './constants'

export function setupFog(scene) {
  if (!SETTINGS.fog.enabled) return

  const f = SETTINGS.fog
  scene.fogMode    = Scene.FOGMODE_EXP2
  scene.fogDensity = f.density
  scene.fogColor   = new Color3(f.color.r, f.color.g, f.color.b)

  // Clear colour matches fog so the far-plane seam is invisible
  scene.clearColor = new Color4(f.color.r, f.color.g, f.color.b, 1.0)
}
