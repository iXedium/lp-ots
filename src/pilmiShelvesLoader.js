/**
 * pilmiShelvesLoader.js — Per-Instance Lightmap Integration (PILMI).
 *
 * Handles any model whose GLB is named "pilmi-{name}.glb".  The expected
 * companion files (all under public/) are:
 *   textures/{name}_lm.ktx2  (or .png fallback)   — baked lightmap atlas
 *   textures/{name}_ao.ktx2  (or .png fallback)   — ambient-occlusion atlas
 *   json/{name}-pilmi-data.json                    — per-instance UV scale+offset
 *
 * Each instance shares geometry UV2 but occupies a unique region on the atlas.
 * The JSON provides per-instance {scale, offset} in Blender UV space; the loader
 * bakes axis-flip and UV-range normalisation into the instanced lmScaleOffset
 * attribute so the vertex shader stays a simple fused-multiply-add.
 */

import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader'
import { Texture }         from '@babylonjs/core/Materials/Textures/texture'
import { Vector4 }         from '@babylonjs/core/Maths/math.vector'
import { Mesh }            from '@babylonjs/core/Meshes/mesh'
import '@babylonjs/core/Materials/Textures/Loaders/ktxTextureLoader'
import { PBRCustomMaterial } from '@babylonjs/materials/custom/pbrCustomMaterial'
import { SETTINGS } from './constants'

// Global registry of all PILMI materials so textures can be toggled at runtime
const pilmiRegistry = []

/**
 * Toggle lightmap or AO textures on all PILMI materials.
 * @param {'lightmap'|'ao'} slot
 * @param {boolean} enabled
 */
export function setPilmiTexture(slot, enabled) {
  for (const entry of pilmiRegistry) {
    if (slot === 'lightmap') {
      entry.mat.lightmapTexture = enabled ? entry.lmTex : null
    } else if (slot === 'ao') {
      entry.mat.ambientTexture = enabled ? entry.aoTex : null
    }
  }
}

/* ── helpers ─────────────────────────────────────────────────── */

function normalizeName(fullName, jsonData) {
  if (!fullName) return null
  if (jsonData[fullName]) return fullName
  let name = fullName
  for (const sep of ['|', ':', '/', '\\']) {
    const parts = name.split(sep)
    name = parts[parts.length - 1]
  }
  if (jsonData[name]) return name
  const tokens = name.split('_')
  for (let i = 1; i < tokens.length; i++) {
    const key = tokens.slice(i).join('_')
    if (jsonData[key]) return key
  }
  return null
}

function isKtx2Data(buf) {
  if (!buf || buf.byteLength < 12) return false
  const id = new Uint8Array(buf, 0, 12)
  return (
    id[0] === 0xab && id[1] === 0x4b && id[2] === 0x54 && id[3] === 0x58 &&
    id[4] === 0x20 && id[5] === 0x32 && id[6] === 0x30 && id[7] === 0xbb &&
    id[8] === 0x0d && id[9] === 0x0a && id[10] === 0x1a && id[11] === 0x0a
  )
}

function loadTexture(scene, url, invertY) {
  return new Promise((resolve, reject) => {
    const tex = new Texture(
      url, scene, true, invertY, Texture.TRILINEAR_SAMPLINGMODE,
      () => resolve(tex),
      (_msg, exc) => { tex.dispose(); reject(exc || new Error(_msg || 'Failed: ' + url)) },
    )
  })
}

async function loadAtlasWithFallback(scene, basePathNoExt) {
  const ktx2 = basePathNoExt + '.ktx2'
  const png  = basePathNoExt + '.png'
  // Try KTX2 first — pass URL directly so BabylonJS detects extension & uses KTX2 decoder
  // KTX2 containers carry their own orientation, so invertY=false to avoid double-flip
  try {
    const res = await fetch(ktx2, { method: 'HEAD', cache: 'no-store' })
    if (res.ok) {
      const tex = await loadTexture(scene, ktx2, false)
      tex._pilmiInvertY = false
      return tex
    }
  } catch { /* fall through to PNG */ }
  // PNG needs invertY=true so V=0=bottom matches Blender convention
  const tex = await loadTexture(scene, png, true)
  tex._pilmiInvertY = true
  return tex
}

/* ── material factory ─────────────────────────────────────── */

function createPilmiMaterial(scene, original, lmTex, aoTex) {
  const mat = new PBRCustomMaterial('pilmi_' + original.name, scene)

  // Copy key PBR surface properties from the original GLB material
  mat.albedoTexture   = original.albedoTexture   || null
  mat.albedoColor     = original.albedoColor ? original.albedoColor.clone() : mat.albedoColor
  mat.metallic        = original.metallic        != null ? original.metallic : 0
  mat.roughness       = original.roughness       != null ? original.roughness : 1
  mat.metallicTexture = original.metallicTexture || null
  mat.bumpTexture     = original.bumpTexture     || null
  mat.emissiveTexture = original.emissiveTexture || null
  mat.emissiveColor   = original.emissiveColor ? original.emissiveColor.clone() : mat.emissiveColor
  mat.backFaceCulling = original.backFaceCulling != null ? original.backFaceCulling : true
  mat.sideOrientation = original.sideOrientation
  mat.alpha           = original.alpha           != null ? original.alpha : 1
  mat.useRoughnessFromMetallicTextureAlpha = !!original.useRoughnessFromMetallicTextureAlpha
  mat.useRoughnessFromMetallicTextureGreen = !!original.useRoughnessFromMetallicTextureGreen
  mat.useMetallnessFromMetallicTextureBlue = !!original.useMetallnessFromMetallicTextureBlue

  // Standard PBR lightmap & AO (visible in inspector, applied by BJS pipeline)
  mat.lightmapTexture        = lmTex
  mat.useLightmapAsShadowmap = true   // multiply into output
  mat.ambientTexture         = aoTex

  // ── Per-instance UV transform (instanced attribute) ───────
  mat.AddAttribute('lmScaleOffset')

  mat.Vertex_Definitions('attribute vec4 lmScaleOffset;')

  // Override UV2-based varyings at end of main() so that the per-instance
  // scale/offset reaches both the lightmap and AO samplers.
  // vMainUV2 covers the DIRECTUV path; vLightmapUV / vAmbientUV cover the
  // matrix-transform path.
  mat.Vertex_MainEnd([
    '#ifdef MAINUV2',
    '  vMainUV2 = uv2 * lmScaleOffset.xy + lmScaleOffset.zw;',
    '#endif',
  ].join('\n'))

  return mat
}

/* ── instance conversion ──────────────────────────────────── */

function convertDuplicatesToInstances(meshes) {
  const groups = new Map()
  for (const m of meshes) {
    if (m.isAnInstance || !m.geometry || m.skeleton) continue
    const key = m.geometry.uniqueId + '|' + (m.material ? m.material.uniqueId : '-')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(m)
  }

  const created = []
  for (const grp of groups.values()) {
    if (grp.length < 2) continue
    const master = grp[0]
    if (!master.instancedBuffers || !master.instancedBuffers.lmScaleOffset) {
      master.registerInstancedBuffer('lmScaleOffset', 4)
      master.instancedBuffers.lmScaleOffset = new Vector4(1, 1, 0, 0)
    }
    for (let i = 1; i < grp.length; i++) {
      const src = grp[i]
      const inst = master.createInstance(src.name)
      inst.position.copyFrom(src.position)
      if (src.rotationQuaternion) inst.rotationQuaternion = src.rotationQuaternion.clone()
      else inst.rotation.copyFrom(src.rotation)
      inst.scaling.copyFrom(src.scaling)
      inst.setEnabled(src.isEnabled())
      inst.parent = src.parent
      src.dispose(false, true)
      created.push(inst)
    }
  }
  return created
}

/* ── loader ───────────────────────────────────────────────── */

export class PilmiLoader {
  /**
   * @param {BABYLON.Scene} scene
   * @param {string}        base       BASE_URL from import.meta.env
   * @param {string}        pilmiName  the part after "pilmi-" in the GLB filename
   */
  constructor(scene, base, pilmiName) {
    this.scene     = scene
    this.base      = base
    this.pilmiName = pilmiName
  }

  async load() {
    const q    = import.meta.env.DEV ? '?v=' + Date.now() : ''
    const name = this.pilmiName

    // JSON convention: public/json/{name}-pilmi-data.json
    const jsonUrl = this.base + 'json/' + name + '-pilmi-data.json' + q
    const fetchJson = (url) =>
      fetch(url, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null)

    const [result, lmTex, aoTex, lmData] = await Promise.all([
      ImportMeshAsync(this.base + 'models/pilmi-' + name + '.glb' + q, this.scene),
      loadAtlasWithFallback(this.scene, this.base + 'textures/' + name + '_lm'),
      loadAtlasWithFallback(this.scene, this.base + 'textures/' + name + '_ao'),
      fetchJson(jsonUrl).then(d => d ?? {}),
    ])

    // Configure texture UV channel (coordinatesIndex 1 = uv2 / TEXCOORD_1)
    // Track invertY state for V-axis formula (KTX2 vs PNG have different orientations)
    var texInvertY = lmTex._pilmiInvertY !== undefined ? lmTex._pilmiInvertY : lmTex.invertY
    lmTex.coordinatesIndex = 1
    aoTex.coordinatesIndex = 1
    lmTex.gammaSpace = false
    aoTex.gammaSpace = false

    // Diagnostic: log available UV channels
    var renderMeshes = result.meshes.filter(function (m) {
      return m instanceof Mesh && m.getTotalVertices() > 0
    })
    if (renderMeshes.length > 0) {
      var s = renderMeshes[0]
      var hasUV  = !!(s.getVerticesData && s.getVerticesData('uv'))
      var hasUV2 = !!(s.getVerticesData && s.getVerticesData('uv2'))
      var hasUV3 = !!(s.getVerticesData && s.getVerticesData('uv3'))
      console.log('[PILMI] UV channels on "' + s.name + '": uv=' + hasUV + ', uv2=' + hasUV2 + ', uv3=' + hasUV3)
      if (!hasUV2) {
        console.warn('[PILMI] ⚠ No UV2 data found — lightmap/AO textures will have no effect.')
      }
    }

    // Compute UV2 min/range per master geometry — needed to normalise local UV into [0,1]
    // UV2 is a proportional local UV (not [0,1]).  JSON scale/offset are in Blender atlas space.
    // The relationship is:  atlas = (uv2 - uv2_min) / uv2_range * json_scale + json_offset
    // Which re-arranges to:  atlas = uv2 * (json_scale/uv2_range) + (json_offset - uv2_min*json_scale/uv2_range)
    var geoUvInfo = new Map()
    for (var gi = 0; gi < renderMeshes.length; gi++) {
      var gm = renderMeshes[gi]
      if (gm.isAnInstance || !gm.geometry) continue
      var uv2arr = gm.getVerticesData('uv2')
      if (!uv2arr || uv2arr.length < 2) continue
      var gu_min = Infinity, gu_max = -Infinity, gv_min = Infinity, gv_max = -Infinity
      for (var gj = 0; gj < uv2arr.length; gj += 2) {
        var gu = uv2arr[gj], gv = uv2arr[gj + 1]
        if (gu < gu_min) gu_min = gu; if (gu > gu_max) gu_max = gu
        if (gv < gv_min) gv_min = gv; if (gv > gv_max) gv_max = gv
      }
      geoUvInfo.set(gm.geometry.uniqueId, {
        u_min: gu_min, u_range: Math.max(gu_max - gu_min, 1e-6),
        v_min: gv_min, v_range: Math.max(gv_max - gv_min, 1e-6),
      })
      console.log('[PILMI] geo ' + gm.name + ' UV2 u=[' + gu_min.toFixed(4) + ',' + gu_max.toFixed(4) + '] v=[' + gv_min.toFixed(4) + ',' + gv_max.toFixed(4) + ']')
    }

    // Create one PBRCustomMaterial per unique original material
    var matMap = new Map()
    for (var mi = 0; mi < renderMeshes.length; mi++) {
      var mesh = renderMeshes[mi]
      if (!mesh.material || matMap.has(mesh.material)) continue
      matMap.set(mesh.material, createPilmiMaterial(this.scene, mesh.material, lmTex, aoTex))
    }

    // Assign PILMI materials + register instanced buffer
    for (var ai = 0; ai < renderMeshes.length; ai++) {
      var m = renderMeshes[ai]
      var pilmi = matMap.get(m.material)
      if (pilmi) m.material = pilmi
      if (m.geometry) {
        m.registerInstancedBuffer('lmScaleOffset', 4)
        m.instancedBuffers.lmScaleOffset = new Vector4(1, 1, 0, 0)
      }
    }

    // Convert duplicate meshes → instances (preserves transforms)
    var newInstances = convertDuplicatesToInstances(renderMeshes)

    // Map JSON UV offsets to every live PILMI mesh & instance
    var pilmiMats = new Set(matMap.values())
    var allPilmi = this.scene.meshes.filter(function (m) { return pilmiMats.has(m.material) })

    var mapped = 0, missing = 0
    for (var pi = 0; pi < allPilmi.length; pi++) {
      var pm = allPilmi[pi]
      var key = normalizeName(pm.name, lmData)
      var entry = key ? lmData[key] : null
      if (!entry) { missing++; continue }

      // Get this mesh's geometry UV2 info (instances share source mesh geometry)
      var geoId = pm.isAnInstance
        ? (pm.sourceMesh && pm.sourceMesh.geometry ? pm.sourceMesh.geometry.uniqueId : null)
        : (pm.geometry ? pm.geometry.uniqueId : null)
      var uvInfo = geoId != null ? geoUvInfo.get(geoId) : null

      if (uvInfo && pm.instancedBuffers) {
        // Bake UV2 normalisation into scale/offset so shader stays:  vMainUV2 = uv2 * xy + zw
        // U: same orientation in GLTF and Blender — positive scale from u_min
        var su = entry.scale[0] / uvInfo.u_range
        var ou = entry.offset[0] - uvInfo.u_min * su
        // V: GLTF UV2 V is flipped from Blender (gltf_v = 1 - blender_v).
        //    JSON offset/scale are in Blender V (0=bottom).
        //    v_max = uvInfo.v_min + uvInfo.v_range (top of UV island in GLTF space)
        var sv_abs = entry.scale[1] / uvInfo.v_range
        var v_max = uvInfo.v_min + uvInfo.v_range
        var sv, ov
        if (texInvertY) {
          // invertY=true (PNG): texture V=0=bottom=Blender V=0 → output in Blender V
          sv = -sv_abs
          ov = v_max * sv_abs + entry.offset[1]
        } else {
          // invertY=false (KTX2): texture V=0=top=Blender V=1 → output = 1 - blender_v
          sv = sv_abs
          ov = 1.0 - v_max * sv_abs - entry.offset[1]
        }
        pm.instancedBuffers.lmScaleOffset = new Vector4(su, sv, ou, ov)
        mapped++
      } else {
        missing++
      }
    }

    // Log material names for debugging original → PILMI mapping
    matMap.forEach(function (pilmi, orig) {
      console.log('[PILMI] Material "' + orig.name + '" → "' + pilmi.name + '"')
    })
    console.log('[PILMI] ' + matMap.size + ' materials, ' + newInstances.length + ' instances, ' + mapped + '/' + (mapped + missing) + ' JSON-mapped')

    // Register materials for runtime toggling
    matMap.forEach(function (pilmi) {
      pilmiRegistry.push({ mat: pilmi, lmTex: lmTex, aoTex: aoTex })
    })

    // Apply initial state from settings
    if (!SETTINGS.pilmi.lightmap) setPilmiTexture('lightmap', false)
    if (!SETTINGS.pilmi.ao) setPilmiTexture('ao', false)

    return { meshes: result.meshes }
  }
}
