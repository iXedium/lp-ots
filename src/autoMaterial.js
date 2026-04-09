/**
 * autoMaterial.js — Auto-discover textures and create PBR materials for GLBs
 * that ship without embedded materials/textures.
 *
 * Texture naming convention:  textures/{glbName}_{MAPTYPE}.{ext}
 * Map types (case-insensitive): DIFFUSE, NORMAL, ROUGHNESS, METALLIC, AO, LM, EMISSIVE, OPACITY
 * Extension priority: .ktx2 > .png > .jpg
 */

import { PBRMaterial }  from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { Texture }      from '@babylonjs/core/Materials/Textures/texture'
import '@babylonjs/core/Materials/Textures/Loaders/ktxTextureLoader'

const MAP_TYPES = ['diffuse', 'normal', 'roughness', 'metallic', 'ao', 'lm', 'emissive', 'opacity']
const EXTENSIONS = ['.ktx2', '.png', '.jpg']

/**
 * Probe for a texture file, trying extensions in priority order.
 * @returns {Promise<string|null>}  URL that exists, or null
 */
async function probeTexture(basePath) {
  for (const ext of EXTENSIONS) {
    const url = basePath + ext
    try {
      const res = await fetch(url, { method: 'HEAD', cache: 'no-store' })
      if (!res.ok) continue
      // Verify content-type to avoid Vite's SPA fallback serving HTML for missing files
      const ct = (res.headers.get('content-type') || '').toLowerCase()
      if (ct.includes('text/html')) continue
      return url
    } catch { /* next */ }
  }
  return null
}

/**
 * Load a texture from URL. KTX2 uses invertY=false, raster uses invertY=true.
 */
function loadTex(scene, url) {
  const isKtx2 = url.endsWith('.ktx2')
  return new Promise((resolve, reject) => {
    const tex = new Texture(
      url, scene, true, isKtx2 ? false : true, Texture.TRILINEAR_SAMPLINGMODE,
      () => resolve(tex),
      (_msg, exc) => { tex.dispose(); reject(exc || new Error(_msg || 'Texture load failed: ' + url)) },
    )
  })
}

/**
 * Discover available textures for a GLB name and create a PBR material.
 * @param {BABYLON.Scene} scene
 * @param {string} base       BASE_URL (e.g. '/')
 * @param {string} glbName    GLB filename without extension (e.g. 'terrain')
 * @returns {Promise<{mat: PBRMaterial, maps: Record<string,string>}|null>}
 *          null if no textures found
 */
export async function discoverAndCreateMaterial(scene, base, glbName) {
  const texBase = base + 'textures/' + glbName + '_'

  // Probe all map types in parallel
  const probes = MAP_TYPES.map(async (type) => {
    // Try exact case from convention, then uppercase, then lowercase
    const variants = [type.toUpperCase(), type.toLowerCase()]
    // For mixed case (e.g. 'Diffuse') — not needed since we cover upper+lower
    for (const variant of variants) {
      const url = await probeTexture(texBase + variant)
      if (url) return { type, url }
    }
    return { type, url: null }
  })

  const results = await Promise.all(probes)
  const found = {}
  for (const r of results) {
    if (r.url) found[r.type] = r.url
  }

  if (Object.keys(found).length === 0) return null

  console.log('[AutoMat] ' + glbName + ': found ' + Object.keys(found).join(', '))

  // Load all discovered textures in parallel
  const texLoads = {}
  for (const [type, url] of Object.entries(found)) {
    texLoads[type] = loadTex(scene, url)
  }
  const textures = {}
  for (const [type, promise] of Object.entries(texLoads)) {
    try { textures[type] = await promise }
    catch (e) { console.warn('[AutoMat] Failed to load ' + type + ' for ' + glbName, e) }
  }

  // Create PBR material
  const mat = new PBRMaterial('auto_' + glbName, scene)
  mat.metallic  = 0
  mat.roughness = 1

  if (textures.diffuse) {
    mat.albedoTexture = textures.diffuse
  }
  if (textures.normal) {
    mat.bumpTexture = textures.normal
  }
  if (textures.roughness && !textures.metallic) {
    // Standalone roughness map (not ORM): feed it as metallicTexture
    // BJS PBR reads G channel for roughness by default
    mat.metallicTexture = textures.roughness
    mat.useRoughnessFromMetallicTextureGreen = true
    mat.useRoughnessFromMetallicTextureAlpha = false
    mat.useMetallnessFromMetallicTextureBlue = false
  }
  if (textures.metallic) {
    // ORM or standalone metallic map
    mat.metallicTexture = textures.metallic
    mat.useMetallnessFromMetallicTextureBlue = true
    mat.useRoughnessFromMetallicTextureGreen = true
  }
  if (textures.ao) {
    mat.ambientTexture = textures.ao
  }
  if (textures.lm) {
    mat.lightmapTexture = textures.lm
    mat.useLightmapAsShadowmap = true
  }
  if (textures.emissive) {
    mat.emissiveTexture = textures.emissive
  }
  if (textures.opacity) {
    mat.opacityTexture = textures.opacity
  }

  return { mat, maps: found }
}

/**
 * Apply auto-discovered material to all meshes in a loaded GLB result
 * that have no material or no textures on their material.
 * @param {BABYLON.Scene} scene
 * @param {string} base
 * @param {string} glbName
 * @param {{meshes: BABYLON.AbstractMesh[]}} result
 */
export async function applyAutoMaterial(scene, base, glbName, result) {
  // Check if any mesh needs a material
  const needsMaterial = result.meshes.some(m =>
    m.getTotalVertices?.() > 0 && (!m.material || !m.material.albedoTexture)
  )
  if (!needsMaterial) return

  const discovered = await discoverAndCreateMaterial(scene, base, glbName)
  if (!discovered) return

  for (const mesh of result.meshes) {
    if (mesh.getTotalVertices?.() > 0 && (!mesh.material || !mesh.material.albedoTexture)) {
      console.log('[AutoMat] Applying to mesh "' + mesh.name + '" (verts=' + mesh.getTotalVertices() + ', hasMat=' + !!mesh.material + ')')
      mesh.material = discovered.mat
    }
  }
  console.log('[AutoMat] Applied auto material to ' + glbName)
}
