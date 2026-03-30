import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline'
import { ColorCurves } from '@babylonjs/core/Materials/colorCurves'
import { SETTINGS }    from './constants'

/**
 * DefaultRenderingPipeline: bloom + ACES tone mapping + saturation + FXAA + sharpen.
 * Bloom picks up the bright sun spot from SkyMaterial → cinematic sun glow / lens flare.
 */
export function setupPostProcessing(scene, camera) {
  if (!SETTINGS.postProcessing.enabled) return null

  const pp = SETTINGS.postProcessing
  const pipeline = new DefaultRenderingPipeline('default', true, scene, [camera])

  // ── Bloom (creates natural sun lens-flare from HDR bright spots) ──
  pipeline.bloomEnabled   = pp.bloom.enabled
  pipeline.bloomThreshold = pp.bloom.threshold
  pipeline.bloomWeight    = pp.bloom.weight
  pipeline.bloomKernel    = pp.bloom.kernel
  pipeline.bloomScale     = pp.bloom.scale

  // ── Image processing ──
  const ip = pp.imageProcessing
  pipeline.imageProcessingEnabled            = true
  pipeline.imageProcessing.contrast          = ip.contrast
  pipeline.imageProcessing.exposure          = ip.exposure
  pipeline.imageProcessing.toneMappingEnabled = ip.toneMappingEnabled
  pipeline.imageProcessing.toneMappingType   = ip.toneMappingType

  // Saturation boost via ColorCurves
  if (ip.saturationBoost) {
    pipeline.imageProcessing.colorCurvesEnabled = true
    const curves = new ColorCurves()
    curves.globalSaturation = ip.saturationBoost
    curves.midtonesHue = 0.2 // slight hue shift towards blue/cyan to enhance sky colors
    pipeline.imageProcessing.colorCurves = curves
  }

  // ── FXAA ──
  pipeline.fxaaEnabled = !!pp.fxaa

  // ── Sharpen ──
  if (pp.sharpen?.enabled) {
    pipeline.sharpenEnabled           = true
    pipeline.sharpen.edgeAmount       = pp.sharpen.edgeAmount
  }

  return pipeline
}
