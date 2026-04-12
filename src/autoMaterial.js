/**
 * autoMaterial.js — Auto-discover PBR textures for a GLB by filename suffix.
 *
 * Discovery convention:  textures/{glbName}_{SUFFIX}.{ext}
 * Extension probe order: .ktx2  >  .webp  >  .png  >  .jpg
 *
 * All recognised suffixes are defined in mapTypes.js.
 * Slot priority: 'orm'  supersedes standalone 'roughness', 'metallic', 'ao'.
 *
 * ORM channel convention (Substance Painter / Unreal / BabylonJS-compatible):
 *   R = Ambient Occlusion   useAmbientOcclusionFromMetallicTextureRed  = true
 *   G = Roughness           useRoughnessFromMetallicTextureGreen        = true
 *   B = Metallic            useMetallnessFromMetallicTextureBlue        = true
 *
 * Metallic workflow is always used: mat.metallic / mat.roughness = 1 when
 * texture-driven so the full 0-1 range is preserved.
 */

import { PBRMaterial }  from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { Color3 }       from '@babylonjs/core/Maths/math.color'
import { Texture }      from '@babylonjs/core/Materials/Textures/texture'
import '@babylonjs/core/Materials/Textures/Loaders/ktxTextureLoader'

import { SETTINGS }        from './constants'
import { ALL_SUFFIXES, SUFFIX_TO_SLOT } from './mapTypes'

const EXTENSIONS = ['.ktx2', '.webp', '.png', '.jpg']

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Probe for a texture file, trying extensions in priority order.
 * @returns {Promise<string|null>}  first URL that exists, or null
 */
async function probeTexture(basePath) {
  for (const ext of EXTENSIONS) {
    const url = basePath + ext
    try {
      const res = await fetch(url, { method: 'HEAD', cache: 'no-store' })
      if (!res.ok) continue
      const ct = (res.headers.get('content-type') || '').toLowerCase()
      if (ct.includes('text/html')) continue   // Vite SPA fallback
      return url
    } catch { /* next ext */ }
  }
  return null
}

/**
 * Load a Texture from URL.
 * invertY is always false: GLTF UV V=0 = top of texture, and KTX2 compressed
 * data ignores UNPACK_FLIP_Y_WEBGL anyway.  Using false for PNG ensures the
 * same top-down orientation as KTX2 so swapping formats produces identical results.
 * noMipmap=false ensures trilinear filtering and uses embedded mipmaps in KTX2 files.
 */
function loadTex(scene, url) {
  return new Promise((resolve, reject) => {
    const tex = new Texture(
      url, scene, false, false, Texture.TRILINEAR_SAMPLINGMODE,
      () => resolve(tex),
      (_msg, exc) => { tex.dispose(); reject(exc || new Error(_msg || 'Texture failed: ' + url)) },
    )
  })
}

// ── Discovery ─────────────────────────────────────────────────────────────────

/**
 * Probe all known map-type suffixes for a GLB and load the textures found.
 * @returns {Promise<{textures: Record<string,Texture>, maps: Record<string,string>}|null>}
 */
async function discoverTextures(scene, base, glbName) {
  const texBase = base + 'textures/' + glbName + '_'

  // Probe all suffixes in parallel; try UPPER, lower, and Title-case variants
  // (Vite enforces case-sensitive paths even on Windows, so we must match exactly)
  const probeResults = await Promise.all(
    ALL_SUFFIXES.map(async (suffix) => {
      const titleCase = suffix[0] + suffix.slice(1).toLowerCase()
      for (const variant of [suffix, suffix.toLowerCase(), titleCase]) {
        const url = await probeTexture(texBase + variant)
        if (url) return { suffix, url }
      }
      return null
    }),
  )

  // Map to slots: first discovered URL per slot wins
  const found = Object.create(null)          // slot → url
  for (const r of probeResults) {
    if (!r) continue
    const slot = SUFFIX_TO_SLOT[r.suffix]
    if (slot && !found[slot]) found[slot] = r.url
  }

  if (Object.keys(found).length === 0) return null

  console.log('[AutoMat] ' + glbName + ': discovered ' +
    Object.entries(found).map(([s, u]) => s + '→' + u.split('/').pop()).join('  '))

  // Load all found textures in parallel
  const textures = Object.create(null)
  await Promise.all(
    Object.entries(found).map(async ([slot, url]) => {
      try {
        textures[slot] = await loadTex(scene, url)
      } catch (e) {
        console.warn('[AutoMat] Failed loading ' + slot + ' for ' + glbName, e)
      }
    }),
  )
  if (Object.keys(textures).length === 0) return null

  return { textures, maps: found }
}

/**
 * Fill empty texture slots on a PBRMaterial from a textures dict.
 * Only writes a slot if the material's property is currently null/undefined.
 * @param {object} [opts]
 * @param {boolean} [opts.hasUV2=true]  Whether the target mesh(es) have TEXCOORD_1 (UV2).
 *   false → lightmap falls back to coordinatesIndex=0 (UV1).
 */
function _applyTexturesToPBR(mat, textures, { hasUV2 = true } = {}) {
  // Albedo
  if (!mat.albedoTexture && textures.albedo)
    mat.albedoTexture = textures.albedo

  // Normal / bump (tangent-space RGB normal map)
  if (!mat.bumpTexture && textures.normal) {
    mat.bumpTexture              = textures.normal
    mat.bumpTexture.level        = SETTINGS.materials.normalMapStrength
    mat.invertNormalMapY         = SETTINGS.materials.normalMapInvertY
    mat.invertNormalMapX         = SETTINGS.materials.normalMapInvertX
  }

  // ORM — first priority for the metallic/roughness/AO slots
  if (!mat.metallicTexture && textures.orm) {
    mat.metallicTexture = textures.orm
    mat.useRoughnessFromMetallicTextureAlpha = false  // G channel is roughness
    mat.useRoughnessFromMetallicTextureGreen = true   // G = roughness
    mat.useMetallnessFromMetallicTextureBlue = true   // B = metallic
    mat.useAmbientOcclusionFromMetallicTextureRed = true  // R = AO
    mat.metallic  = 1   // ORM B channel scales this — keep 1 so B drives the full range
    mat.roughness = 1   // ORM G channel drives this
  } else if (!mat.metallicTexture) {
    // Standalone metallic / roughness
    const hasMet = !!textures.metallic
    const hasRgh = !!textures.roughness
    if (hasMet || hasRgh) {
      mat.metallicTexture = textures.metallic || textures.roughness
      mat.useRoughnessFromMetallicTextureAlpha = false
      mat.useRoughnessFromMetallicTextureGreen = hasRgh
      mat.useMetallnessFromMetallicTextureBlue = hasMet
      mat.useAmbientOcclusionFromMetallicTextureRed = true
      // metallic=1 only if a metallic texture is present; roughness-only = dielectric (0)
      mat.metallic  = hasMet ? 1 : 0
      mat.roughness = 1
    }
    // Standalone AO
    if (!mat.ambientTexture && textures.ao) {
      mat.ambientTexture         = textures.ao
      mat.ambientTextureStrength = 1
    }
  }

  // Emissive
  if (!mat.emissiveTexture && textures.emissive) {
    mat.emissiveTexture   = textures.emissive
    mat.emissiveColor     = new Color3(1, 1, 1)
    mat.emissiveIntensity = SETTINGS.materials.emissiveIntensity
  }

  // Opacity
  if (!mat.opacityTexture && textures.opacity)
    mat.opacityTexture = textures.opacity

  // Lightmap (full-colour Blender RGB bake):
  // Use as additive lightmapTexture. The lightmap provides ALL the baked diffuse lighting;
  // IBL irradiance is turned off per-material so both don't double-contribute.
  // ambientTexture (from the 'ao' slot) still works independently for AO on top.
  if (!mat.lightmapTexture && textures.lightmap) {
    mat.lightmapTexture                  = textures.lightmap
    mat.lightmapTexture.level            = SETTINGS.materials.lightmapStrength
    mat.lightmapTexture.coordinatesIndex = hasUV2 ? 1 : 0
    mat.useLightmapAsShadowmap           = false
    // Disable IBL for this material so the baked lightmap is the sole diffuse source.
    mat.environmentIntensity = SETTINGS.materials.lightmapEnvironmentIntensity
  }

  // Specular / glossiness (legacy)
  if (!mat.reflectivityTexture && textures.specular)
    mat.reflectivityTexture = textures.specular
}

/**
 * Probe, load and build a brand-new PBRMaterial for a GLB.
 * @returns {Promise<{mat: PBRMaterial, maps: Record<string,string>, textures: Record<string,Texture>}|null>}
 */
export async function discoverAndCreateMaterial(scene, base, glbName) {
  const result = await discoverTextures(scene, base, glbName)
  if (!result) return null
  const { textures, maps } = result
  const mat = new PBRMaterial('auto_' + glbName, scene)
  mat.metallic  = 0
  mat.roughness = 1
  _applyTexturesToPBR(mat, textures)
  return { mat, maps, textures }
}

// ── Apply to loaded GLB ───────────────────────────────────────────────────────

/**
 * Discover and apply auto-material textures to all meshes in a loaded GLB.
 *
 * Strategy:
 *  - Mesh with no material  → assign a freshly built full auto-PBR material.
 *  - Mesh with PBRMaterial  → augment it: fill only the slots that are empty
 *    (e.g. GLB has albedo+metallic embedded but no lightmap/normal → we add those).
 *
 * Shared material objects are augmented only once (tracked via a Set).
 */
export async function applyAutoMaterial(scene, base, glbName, result) {
  const meshes = result.meshes.filter(m => m.getTotalVertices?.() > 0)
  if (!meshes.length) return

  const found = await discoverTextures(scene, base, glbName)
  if (!found) return

  const { textures } = found

  // GLBs named pbr-* use only albedo + ORM + normal.
  // If the GLB has embedded (non-default) PBR materials, swap only those 3 texture
  // slots so all other PBR setup (ambient, occlusion flags, etc.) is preserved.
  // If the GLB has no embedded materials yet (__GLTFLoader._default), create a
  // minimal fresh PBR with just the 3 slots.
  if (glbName.startsWith('pbr-')) {
    const pbrTexOnly = { albedo: textures.albedo, orm: textures.orm, normal: textures.normal }
    Object.keys(pbrTexOnly).forEach(k => { if (pbrTexOnly[k] == null) delete pbrTexOnly[k] })
    const augmented = new Set()
    let freshMat = null
    const isGltfDefault = (m) => !m || m.name?.startsWith('__GLTFLoader')

    for (const mesh of meshes) {
      const mat = mesh.material
      if (!isGltfDefault(mat) && mat instanceof PBRMaterial && !augmented.has(mat)) {
        // Embedded material — only swap texture files, preserve all PBR properties
        augmented.add(mat)
        if (pbrTexOnly.albedo) mat.albedoTexture = pbrTexOnly.albedo
        if (pbrTexOnly.orm)    {
          mat.metallicTexture = pbrTexOnly.orm
          mat.ambientTexture  = pbrTexOnly.orm
          mat.ambientTextureStrength = 1.0
        }

        if (pbrTexOnly.normal) {
          mat.bumpTexture       = pbrTexOnly.normal
          mat.bumpTexture.level = SETTINGS.materials.normalMapStrength
          mat.invertNormalMapY  = SETTINGS.materials.normalMapInvertY
          mat.invertNormalMapX  = SETTINGS.materials.normalMapInvertX
          console.log('[AutoMat] pbr- normal map settings: invertY=' + mat.invertNormalMapY + ' invertX=' + mat.invertNormalMapX) 
        }
        console.log('[AutoMat] pbr- swap "' + mat.name + '"')
      } else if (isGltfDefault(mat)) {
        // No embedded material — create a minimal fresh PBR (albedo/ORM/normal only)
        if (!freshMat) {
          freshMat = new PBRMaterial('auto_' + glbName, scene)
          freshMat.metallic  = 0
          freshMat.roughness = 1
          _applyTexturesToPBR(freshMat, pbrTexOnly, { hasUV2: false })
          // ORM R-channel occlusion doubles as an ambient-like darkening term;
          // expose it in the inspector via ambientTexture pointing at the same ORM.
          if (pbrTexOnly.orm) {
            freshMat.ambientTexture         = pbrTexOnly.orm
            freshMat.ambientTextureStrength = 1.0
          }
          console.log('[AutoMat] pbr- fresh PBR for "' + glbName + '"')
        }
        mesh.material = freshMat
      }
    }
    console.log('[AutoMat] Done: ' + glbName)
    return
  }
  const augmented = new Set()   // avoid double-augmenting shared material instances
  let   freshMat  = null        // lazy-create only when a mesh has no material at all

  // Detect UV2 once for the whole GLB.
  // Lightmap prefers UV2 (coordinatesIndex=1). Falls back to UV1 (=0) when absent.
  const hasUV2 = meshes.some(m => !!m._geometry?._vertexBuffers?.['uv2'])
  if (textures.lightmap)
    console.log('[AutoMat] ' + glbName + ': lightmap UV ' + (hasUV2 ? 'UV2 (TEXCOORD_1)' : 'UV1 fallback (no TEXCOORD_1 found)'))

  // Name the GLTF default material uses when a mesh has no material embedded.
  // We treat it like a null-material mesh so we get a fully clean PBR instead of
  // augmenting a materials whose internal GLTF-loader state may be unexpected.
  const isGltfDefault = (mat) => !mat || (mat.name && mat.name.startsWith('__GLTFLoader'))

  for (const mesh of meshes) {
    const mat = mesh.material
    if (isGltfDefault(mat)) {
      if (!freshMat) {
        freshMat = new PBRMaterial('auto_' + glbName, scene)
        freshMat.metallic  = 0
        freshMat.roughness = 1
        _applyTexturesToPBR(freshMat, textures, { hasUV2 })
      }
      mesh.material = freshMat
      console.log('[AutoMat] Full apply → "' + mesh.name + '"')
    } else if (mat instanceof PBRMaterial && !augmented.has(mat)) {
      augmented.add(mat)
      const pre = { bump: mat.bumpTexture, amb: mat.ambientTexture,
                    alb: mat.albedoTexture, met: mat.metallicTexture,
                    lm: mat.lightmapTexture }
      _applyTexturesToPBR(mat, textures, { hasUV2 })
      const added = []
      if (!pre.alb && mat.albedoTexture)      added.push('albedo')
      if (!pre.bump && mat.bumpTexture)       added.push('normal')
      if (!pre.met && mat.metallicTexture)    added.push('metallic/ORM')
      if (!pre.amb && mat.ambientTexture)     added.push('AO')
      if (!pre.lm && mat.lightmapTexture)     added.push('lightmap')
      if (added.length)
        console.log('[AutoMat] Augmented "' + mat.name + '": +' + added.join(', '))
    }
  }
  console.log('[AutoMat] Done: ' + glbName)
}
