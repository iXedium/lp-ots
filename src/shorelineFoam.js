/**
 * shorelineFoam.js — Depth-based stylized water shader.
 * Based on BabylonJS playground #UNGKGD#8:
 * Compares scene depth with water surface depth to mix shallow→deep colors.
 */
import { ShaderMaterial }   from '@babylonjs/core/Materials/shaderMaterial'
import { Effect }           from '@babylonjs/core/Materials/effect'
import { DepthRenderer }    from '@babylonjs/core/Rendering/depthRenderer'
import { Color4 }           from '@babylonjs/core/Maths/math.color'
import { Vector4 }          from '@babylonjs/core/Maths/math.vector'
import { SETTINGS }         from './constants'

// ── GLSL — matches the playground approach exactly ───────────
const vertSrc = /* glsl */ `
precision highp float;

attribute vec3 position;
attribute vec2 uv;

uniform mat4 worldViewProjection;

varying vec2 vUV;
varying vec4 vClipSpace;

void main() {
  gl_Position = worldViewProjection * vec4(position, 1.0);
  vUV = uv;
  vClipSpace = gl_Position;
}
`

const fragSrc = /* glsl */ `
precision highp float;

varying vec2 vUV;
varying vec4 vClipSpace;

uniform sampler2D depthTex;
uniform float camMinZ;
uniform float camMaxZ;
uniform float maxDepth;
uniform float shorePower;       // >1 = tighter gradient near shore
uniform float foamEdgeWidth;    // world-unit width of bright foam line at waterline
uniform vec4 wDeepColor;
uniform vec4 wShallowColor;
uniform vec4 wFoamColor;

void main() {
  // Screen-space coords from clip space → NDC (0..1)
  vec2 ndc = (vClipSpace.xy / vClipSpace.w) / 2.0 + 0.5;

  // Depth of scene geometry behind this water fragment
  float depthOfObjectBehindWater = texture2D(depthTex, vec2(ndc.x, ndc.y)).r;

  // Depth of the water surface itself (normalized)
  float linearWaterDepth = (vClipSpace.z + camMinZ) / (camMaxZ + camMinZ);

  // Water depth = how far below the surface the scene is
  float waterDepth = camMaxZ * (depthOfObjectBehindWater - linearWaterDepth);

  // Normalized 0..1 depth ratio, shaped by power curve
  float wdepth = clamp(waterDepth / maxDepth, 0.0, 1.0);
  wdepth = pow(wdepth, 1.0 / shorePower);  // shorePower>1 pushes gradient toward shore

  // Mix shallow → deep based on depth
  vec4 waterCol = mix(wShallowColor, wDeepColor, wdepth);

  // Foam edge: bright line right at the waterline
  float foamEdge = 1.0 - smoothstep(0.0, foamEdgeWidth, waterDepth);
  vec4 col = mix(waterCol, wFoamColor, foamEdge);

  gl_FragColor = col;
}
`

// ── Material factory ─────────────────────────────────────────
let depthRenderer = null

export function createFoamMaterial(scene, camera) {
  const f = SETTINGS.shorelineFoam

  // Linear depth renderer (matches playground: enableDepthRenderer(camera, false))
  if (!depthRenderer) {
    depthRenderer = scene.enableDepthRenderer(camera, false)
  }

  // Register shader inline
  Effect.ShadersStore['shorelineFoamVertexShader'] = vertSrc
  Effect.ShadersStore['shorelineFoamFragmentShader'] = fragSrc

  const mat = new ShaderMaterial('shorelineFoam', scene, {
    vertex: 'shorelineFoam',
    fragment: 'shorelineFoam',
  }, {
    attributes: ['position', 'normal', 'uv'],
    uniforms: [
      'worldViewProjection',
      'camMinZ', 'camMaxZ', 'maxDepth',
      'shorePower', 'foamEdgeWidth',
      'wDeepColor', 'wShallowColor', 'wFoamColor',
    ],
    samplers: ['depthTex'],
    needAlphaBlending: true,
  })

  mat.backFaceCulling = false
  mat.alphaMode = 2  // ALPHA_COMBINE

  // Set uniforms (static — updated once + depth texture each frame)
  mat.setTexture('depthTex', depthRenderer.getDepthMap())
  mat.setFloat('camMinZ', camera.minZ)
  mat.setFloat('camMaxZ', camera.maxZ)
  mat.setFloat('maxDepth', f.maxDepth)
  mat.setFloat('shorePower', f.shorePower)
  mat.setFloat('foamEdgeWidth', f.foamEdgeWidth)
  mat.setVector4('wDeepColor',    new Vector4(f.deepColor.r, f.deepColor.g, f.deepColor.b, f.deepColor.a))
  mat.setVector4('wShallowColor', new Vector4(f.shallowColor.r, f.shallowColor.g, f.shallowColor.b, f.shallowColor.a))
  mat.setVector4('wFoamColor',    new Vector4(f.foamColor.r, f.foamColor.g, f.foamColor.b, f.foamColor.a))

  return mat
}

/**
 * Apply foam material to water.glb meshes.
 */
export function applyFoamToWater(scene, camera, meshes) {
  if (!SETTINGS.shorelineFoam.enabled) return

  const mat = createFoamMaterial(scene, camera)
  const waterIds = new Set()

  for (const mesh of meshes) {
    if (mesh.getTotalVertices?.() > 0) {
      mesh.material = mat
      waterIds.add(mesh.uniqueId)
    }
  }

  // Build depth render list excluding water meshes
  const depthMap = depthRenderer.getDepthMap()
  depthMap.renderList = []
  for (const m of scene.meshes) {
    if (!waterIds.has(m.uniqueId) && m.isEnabled() && m.getTotalVertices?.() > 0) {
      depthMap.renderList.push(m)
    }
  }

  // Keep render loop alive for depth updates
  scene.onBeforeRenderObservable.add(() => {
    window.__requestRender?.()
  })

  console.log('[Foam] Water shader applied to', meshes.length, 'water meshes')
}
