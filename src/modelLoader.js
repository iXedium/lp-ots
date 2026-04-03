import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader'
import { Vector3 }        from '@babylonjs/core/Maths/math.vector'
import '@babylonjs/loaders/glTF'
import { PilmiShelvesLoader } from './pilmiShelvesLoader'

export function makeLit(mat) {
  if (!mat) return
  if ('unlit' in mat) mat.unlit = false
  if ('disableLighting' in mat) mat.disableLighting = false
  if ('environmentIntensity' in mat && (!mat.environmentIntensity || mat.environmentIntensity < 0.8)) {
    mat.environmentIntensity = 1.0
  }
}


function fmtK(n) { return n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n) }

/**
 * Load every GLB in parallel.
 * @param {string[]}  modelNames  basenames without .glb
 * @param {string[]}  skipMakeLit model names whose materials should NOT be forced lit
 * @param {Function}  onProgress  called after each model: (name, modelData)
 * @returns {{ modelData, globalMin, globalMax }}
 */
export async function loadAllModels(scene, base, modelNames, { skipMakeLit = [], onProgress } = {}) {
  const modelData = {}
  const globalMin = new Vector3(Infinity, Infinity, Infinity)
  const globalMax = new Vector3(-Infinity, -Infinity, -Infinity)
  const devQuery = import.meta.env.DEV ? `?v=${Date.now()}` : ''

  const loads = modelNames.map(name =>
    (name === 'deli-int-shelves'
      ? new PilmiShelvesLoader(scene, `${base}`).load()
      : ImportMeshAsync(`${base}models/${name}.glb${devQuery}`, scene))
      .then(result => {
        // Ensure materials are lit for proper metallic/roughness/glass response.
        if (!skipMakeLit.includes(name)) {
          const seen = new Set()
          for (const mesh of result.meshes) {
            const mats = mesh.material?.subMaterials ?? (mesh.material ? [mesh.material] : [])
            for (const mat of mats) {
              if (mat && !seen.has(mat)) { makeLit(mat); seen.add(mat) }
            }
          }
        }

        // Grow global AABB
        for (const mesh of result.meshes) {
          if (!mesh.getBoundingInfo) continue
          const { minimumWorld, maximumWorld } = mesh.getBoundingInfo().boundingBox
          Vector3.CheckExtends(minimumWorld, globalMin, globalMax)
          Vector3.CheckExtends(maximumWorld, globalMin, globalMax)
        }

        // Triangle count
        let triCount = 0
        for (const mesh of result.meshes) {
          triCount += mesh.getTotalIndices?.() ?? 0
        }
        triCount = Math.round(triCount / 3)

        modelData[name] = {
          refs: result.meshes,
          shadowCasters: result.meshes.filter(m => m?.isMesh && !m.isAnInstance),
          triCount,
          meshCount: result.meshes.length,
          visible: true,
        }
        console.log(`✔ ${name}: ${result.meshes.length} meshes · ${fmtK(triCount)} tris`)
        onProgress?.(name, modelData)
      })
      .catch(err => {
        console.error(`✘ ${name}:`, err)
        modelData[name] = { refs: [], triCount: 0, meshCount: 0, visible: false, error: true }
        onProgress?.(name, modelData)
      }),
  )

  await Promise.all(loads)
  return { modelData, globalMin, globalMax }
}
