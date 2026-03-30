import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial'
import { Effect }         from '@babylonjs/core/Materials/effect'
import { CreateBox }      from '@babylonjs/core/Meshes/Builders/boxBuilder'
import { Vector3 }        from '@babylonjs/core/Maths/math.vector'
import { Color3 }         from '@babylonjs/core/Maths/math.color'
import { SETTINGS }       from './constants'

/* ── Inline sky gradient shaders ─────────────────────────────── */

Effect.ShadersStore['skyGradientVertexShader'] = `
  precision highp float;
  attribute vec3 position;
  uniform mat4 worldViewProjection;
  varying vec3 vDir;
  void main() {
    gl_Position = worldViewProjection * vec4(position, 1.0);
    vDir = normalize(position);
  }
`

Effect.ShadersStore['skyGradientFragmentShader'] = `
  precision highp float;
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform vec3 sunDirection;
  uniform vec3 sunColor;
  uniform float sunIntensity;
  uniform float sunSize;
  uniform float exponent;
  varying vec3 vDir;
  void main() {
    // Gradient: horizon → zenith
    float h = max(0.0, vDir.y);
    float t = pow(h, exponent);
    vec3 sky = mix(horizonColor, topColor, t);

    // Sun glow (HDR bright spot that bloom picks up)
    float sundot = max(0.0, dot(vDir, sunDirection));
    sky += sunColor * sunIntensity * pow(sundot, sunSize);

    gl_FragColor = vec4(sky, 1.0);
  }
`

/* ── Setup ───────────────────────────────────────────────────── */

export function setupSky(scene) {
  if (!SETTINGS.sky.enabled) return null

  const s = SETTINGS.sky

  const sunDir = new Vector3(s.sunPosition.x, s.sunPosition.y, s.sunPosition.z).normalize()

  const skyMat = new ShaderMaterial('sky', scene, 'skyGradient', {
    attributes: ['position'],
    uniforms:   ['worldViewProjection', 'topColor', 'horizonColor',
                 'sunDirection', 'sunColor', 'sunIntensity', 'sunSize', 'exponent'],
  })
  skyMat.backFaceCulling = false
  skyMat.setColor3('topColor',     new Color3(s.topColor.r, s.topColor.g, s.topColor.b))
  skyMat.setColor3('horizonColor', new Color3(s.horizonColor.r, s.horizonColor.g, s.horizonColor.b))
  skyMat.setVector3('sunDirection', sunDir)
  skyMat.setColor3('sunColor',     new Color3(s.sunColor.r, s.sunColor.g, s.sunColor.b))
  skyMat.setFloat('sunIntensity',  s.sunIntensity)
  skyMat.setFloat('sunSize',       s.sunSize)
  skyMat.setFloat('exponent',      s.exponent)
  skyMat.fogEnabled = false

  const skybox = CreateBox('skyBox', { size: s.skyboxSize }, scene)
  skybox.material         = skyMat
  skybox.isPickable       = false
  skybox.infiniteDistance  = true
  skybox.renderingGroupId = 0

  return skybox
}

export function getSunPosition() {
  const s = SETTINGS.sky.sunPosition
  return new Vector3(s.x, s.y, s.z)
}
