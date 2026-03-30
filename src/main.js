import './style.css'

import { Engine }          from '@babylonjs/core/Engines/engine'
import { Scene }           from '@babylonjs/core/scene'
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { Vector3 }         from '@babylonjs/core/Maths/math.vector'
import { Color4 }          from '@babylonjs/core/Maths/math.color'
import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader'

import '@babylonjs/loaders/glTF'
import '@babylonjs/core/Debug/debugLayer'

const base = import.meta.env.BASE_URL

// ── Inspector (F8) ───────────────────────────────────────────────
let inspectorReady = false
import('@babylonjs/inspector').then(() => {
  inspectorReady = true
  console.log('Inspector ready — press F8 to toggle')
})

// ── Canvas & Engine ──────────────────────────────────────────────
const canvas = document.getElementById('renderCanvas')
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, true)

// ── Scene ────────────────────────────────────────────────────────
const scene = new Scene(engine)
scene.clearColor = new Color4(0.53, 0.81, 0.92, 1.0)

// ── Camera ──────────────────────────────────────────────────────
const camera = new ArcRotateCamera('cam', -Math.PI / 2, Math.PI / 3, 100, Vector3.Zero(), scene)
camera.attachControl(canvas, true)
camera.lowerRadiusLimit   = 2
camera.upperRadiusLimit   = 800
camera.wheelPrecision     = 10
camera.pinchPrecision     = 20
camera.panningSensibility = 100
camera.minZ = 0.1

window.__scene = scene
window.addEventListener('keydown', (e) => {
  if (e.key === 'F8' && inspectorReady) {
    if (scene.debugLayer.isVisible()) {
      scene.debugLayer.hide()
    } else {
      scene.debugLayer.show({ embedMode: true, showExplorer: true, showInspector: true })
    }
  }
})

// ── Make a material unlit — keeps all textures, skips all lighting ─
function makeUnlit(mat) {
  if (!mat) return
  if ('unlit' in mat) { mat.unlit = true; return }          // PBRMaterial (all GLB/glTF)
  if ('disableLighting' in mat) mat.disableLighting = true   // StandardMaterial fallback
}

// ── Models ───────────────────────────────────────────────────────
const MODEL_NAMES = ['buildings', 'curbs', 'extra', 'pool-water', 'props', 'under-water', 'water']

// ── Performance HUD ─────────────────────────────────────────────
const hud = document.createElement('div')
hud.style.cssText = [
  'position:fixed', 'top:10px', 'right:10px', 'z-index:100',
  'background:rgba(0,0,0,0.72)', 'color:#fff', 'font:13px/1.6 monospace',
  'border-radius:8px', 'padding:10px 14px', 'min-width:250px',
  'max-height:90vh', 'overflow-y:auto', 'user-select:none',
  'box-shadow:0 2px 12px rgba(0,0,0,0.5)',
].join(';')
document.body.appendChild(hud)

// name → { refs: Mesh[], triCount: number, meshCount: number, visible: boolean }
const modelData = {}
let allLoaded = false

function fmtK(n) { return n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n) }

function renderHUD(fps) {
  const fpsStr = fps !== undefined ? fps.toFixed(1) : '…'
  const activeMeshes = scene.getActiveMeshes().length

  let html = `<div style="font-size:15px;font-weight:bold">FPS: ${fpsStr}</div>`
  html += `<div style="color:#aaa;font-size:11px">active meshes: ${activeMeshes}</div>`
  html += `<hr style="border:none;border-top:1px solid #444;margin:6px 0">`

  if (!allLoaded) {
    const done = Object.keys(modelData).length
    html += `<div style="color:#aaa">Loading… ${done}/${MODEL_NAMES.length}</div>`
    for (const name of MODEL_NAMES) {
      const d = modelData[name]
      const state = !d ? '⏳' : d.error ? '❌' : '✔'
      html += `<div>${state} ${name}</div>`
    }
  } else {
    let totalTris = 0, totalMeshes = 0
    for (const name of MODEL_NAMES) {
      const d = modelData[name]
      if (!d || d.error) { html += `<div style="color:#f66">❌ ${name}</div>`; continue }
      if (d.visible) { totalTris += d.triCount; totalMeshes += d.meshCount }

      const triBar  = Math.round((d.triCount / Math.max(...MODEL_NAMES.map(n => modelData[n]?.triCount || 0))) * 60)
      const barHTML = `<div style="height:3px;width:${triBar}px;background:#4af;margin:1px 0 3px"></div>`
      const btnStyle = `cursor:pointer;padding:2px 8px;font-size:11px;min-height:28px;`
        + `background:${d.visible ? '#1a4a1a' : '#333'};color:${d.visible ? '#6f6' : '#aaa'};`
        + `border:1px solid ${d.visible ? '#3a8a3a' : '#555'};border-radius:4px`
      html += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">`
        + `<button data-m="${name}" style="${btnStyle}">${d.visible ? 'ON' : 'OFF'}</button>`
        + `<div><b>${name}</b><br><span style="color:#aaa;font-size:11px">${d.meshCount} meshes · ${fmtK(d.triCount)} tris</span>${barHTML}</div>`
        + `</div>`
    }
    html += `<hr style="border:none;border-top:1px solid #444;margin:6px 0">`
    html += `<div style="color:#aaa;font-size:11px">visible: ${totalMeshes} meshes · ${fmtK(totalTris)} tris</div>`
  }

  hud.innerHTML = html

  hud.querySelectorAll('button[data-m]').forEach(btn => {
    btn.addEventListener('click', () => {
      const d = modelData[btn.dataset.m]
      if (!d) return
      d.visible = !d.visible
      d.refs.forEach(m => m.setEnabled(d.visible))
      renderHUD(engine.getFps())
    })
  })
}

renderHUD()

// ── Load all models in parallel ──────────────────────────────────
const globalMin = new Vector3(Infinity, Infinity, Infinity)
const globalMax = new Vector3(-Infinity, -Infinity, -Infinity)

const loads = MODEL_NAMES.map(name =>
  ImportMeshAsync(`${base}models/${name}.glb`, scene)
    .then(result => {
      // Make every material unlit (handle MultiMaterial too)
      const seen = new Set()
      for (const mesh of result.meshes) {
        const mats = mesh.material?.subMaterials ?? (mesh.material ? [mesh.material] : [])
        for (const mat of mats) {
          if (mat && !seen.has(mat)) { makeUnlit(mat); seen.add(mat) }
        }
      }

      // Accumulate global bounding box
      for (const mesh of result.meshes) {
        if (!mesh.getBoundingInfo) continue
        const { minimumWorld, maximumWorld } = mesh.getBoundingInfo().boundingBox
        Vector3.CheckExtends(minimumWorld, globalMin, globalMax)
        Vector3.CheckExtends(maximumWorld, globalMin, globalMax)
      }

      // Count unique geometry (some meshes share indices)
      let triCount = 0
      for (const mesh of result.meshes) {
        triCount += mesh.getTotalIndices?.() ?? 0
      }
      triCount = Math.round(triCount / 3)

      modelData[name] = { refs: result.meshes, triCount, meshCount: result.meshes.length, visible: true }
      console.log(`✔ ${name}: ${result.meshes.length} meshes · ${fmtK(triCount)} tris`)
      renderHUD(engine.getFps())
    })
    .catch(err => {
      console.error(`✘ ${name}:`, err)
      modelData[name] = { refs: [], triCount: 0, meshCount: 0, visible: false, error: true }
      renderHUD(engine.getFps())
    })
)

Promise.all(loads).then(() => {
  allLoaded = true
  if (globalMin.x !== Infinity) {
    camera.target = Vector3.Center(globalMin, globalMax)
    const span = Vector3.Distance(globalMin, globalMax)
    camera.radius = span * 0.7
    camera.upperRadiusLimit = span * 3
  }
  renderHUD(engine.getFps())
  console.log('All models loaded.')
})

// ── Render loop & resize ─────────────────────────────────────────
let tick = 0
engine.runRenderLoop(() => {
  scene.render()
  if (++tick % 30 === 0) renderHUD(engine.getFps())
})
window.addEventListener('resize', () => engine.resize())

// ── HMR cleanup — dispose old WebGL context on hot reload ────────
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    engine.dispose()
  })
}
