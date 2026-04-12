/**
 * shorelineFoam.js — Depth-based stylized water shader.
 * Based on BabylonJS playground #UNGKGD#8:
 * Compares scene depth with water surface depth to mix shallow→deep colors.
 */
import { ShaderMaterial }   from '@babylonjs/core/Materials/shaderMaterial'
import { Effect }           from '@babylonjs/core/Materials/effect'
import { DepthRenderer }    from '@babylonjs/core/Rendering/depthRenderer'
import { Color4 }           from '@babylonjs/core/Maths/math.color'
import { SETTINGS }         from './constants'

// ── GLSL — matches the playground approach exactly ───────────
const vertSrc = /* glsl */ `
precision highp float;

attribute vec3 position;
attribute vec2 uv;

uniform mat4 world;
uniform mat4 worldViewProjection;

varying vec2 vUV;
varying vec4 vClipSpace;
varying float vFogDist;

void main() {
  gl_Position = worldViewProjection * vec4(position, 1.0);
  vUV = uv;
  vClipSpace = gl_Position;
  // Distance from camera for EXP2 fog (length of world-space position works for
  // a flat water plane because camera.position is at (0,0,0) in view space)
  vec4 wp = world * vec4(position, 1.0);
  vFogDist = gl_Position.z;  // view-space depth
}
`

const fragSrc = /* glsl */ `
precision highp float;

varying vec2 vUV;
varying vec4 vClipSpace;
varying float vFogDist;

uniform sampler2D depthTex;
uniform float camMinZ;
uniform float camMaxZ;
uniform float maxDepth;
uniform float shorePower;       // >1 = tighter gradient near shore
uniform float foamEdgeWidth;    // world-unit width of bright foam line at waterline
uniform vec4 wDeepColor;
uniform vec4 wShallowColor;
uniform vec4 wFoamColor;

// Fog
uniform float fogDensity;
uniform vec3  fogColor;

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

  // EXP2 fog — matches BabylonJS Scene.FOGMODE_EXP2
  float fogAmount = 1.0 - clamp(exp(-pow(fogDensity * vFogDist, 2.0)), 0.0, 1.0);
  col.rgb = mix(col.rgb, fogColor, fogAmount);

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
      'world', 'worldViewProjection',
      'camMinZ', 'camMaxZ', 'maxDepth',
      'shorePower', 'foamEdgeWidth',
      'wDeepColor', 'wShallowColor', 'wFoamColor',
      'fogDensity', 'fogColor',
    ],
    samplers: ['depthTex'],
    needAlphaBlending: true,
  })

  mat.backFaceCulling = false
  mat.alphaMode = 2  // ALPHA_COMBINE

  // Re-read SETTINGS every frame so the tweaker UI works in real-time
  mat.onBind = () => {
    const effect = mat.getEffect()
    if (!effect) return
    const s = SETTINGS.shorelineFoam
    effect.setTexture('depthTex', depthRenderer.getDepthMap())
    effect.setFloat('camMinZ', camera.minZ)
    effect.setFloat('camMaxZ', camera.maxZ)
    effect.setFloat('maxDepth', s.maxDepth)
    effect.setFloat('shorePower', s.shorePower)
    effect.setFloat('foamEdgeWidth', s.foamEdgeWidth)
    effect.setDirectColor4('wDeepColor',    new Color4(s.deepColor.r, s.deepColor.g, s.deepColor.b, s.deepColor.a))
    effect.setDirectColor4('wShallowColor', new Color4(s.shallowColor.r, s.shallowColor.g, s.shallowColor.b, s.shallowColor.a))
    effect.setDirectColor4('wFoamColor',    new Color4(s.foamColor.r, s.foamColor.g, s.foamColor.b, s.foamColor.a))

    // Fog — read straight from scene state so it stays in sync with fog.js
    const fogOn = scene.fogMode !== 0 // Scene.FOGMODE_NONE
    effect.setFloat('fogDensity', fogOn ? scene.fogDensity : 0.0)
    const fc = scene.fogColor || { r: 0, g: 0, b: 0 }
    effect.setFloat3('fogColor', fc.r, fc.g, fc.b)
  }

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

  // Use a live predicate instead of a static renderList.
  // Alpha-test / blend meshes are excluded because the depth shader can't honour
  // their transparency — recording the billboard's depth at transparent holes
  // corrupts the water colour (white foam or missing water).
  // Also dynamically handles meshes added after this point (PILMI instances, etc.).
  const depthMap = depthRenderer.getDepthMap()
  depthMap.renderList = null   // predicate takes over when renderList is null
  depthMap.renderListPredicate = (mesh) => {
    if (waterIds.has(mesh.uniqueId))          return false
    if (!mesh.isEnabled())                    return false
    if (!(mesh.getTotalVertices?.() > 0))     return false
    const mat = mesh.material
    if (mat && (mat.needAlphaBlending?.() || mat.needAlphaTesting?.())) return false
    return true
  }

  console.log('[Foam] Water shader applied to', meshes.length, 'water meshes')

  // The under-water mesh is a 3D volume whose side-faces render in the opaque pass
  // and write depth values closer to camera than the water surface when viewed at
  // shallow angles (shore view). This blocks the foam from rendering through
  // alpha-test leaf cutout holes.  Disabling depth writes on that mesh lets the
  // foam always win the depth test at those pixels.
  const underWaterMesh = scene.meshes.find(m => m.name === 'under-water')
  if (underWaterMesh?.material) {
    underWaterMesh.material.disableDepthWrite = true
    console.log('[Foam] Disabled depth write on under-water-mat to prevent foam occlusion')
  }
}
