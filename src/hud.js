import { SETTINGS } from './constants'

function fmtK(n) { return n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n) }

/**
 * Collapsible performance overlay.
 * A small FPS button is always visible (top-right). Tap to expand the full panel.
 */
export function createHUD(engine, scene, modelNames) {
  if (!SETTINGS.hud.enabled) return { update() {} }

  let expanded = !SETTINGS.hud.collapsedByDefault
  let currentModelData = {}
  let allLoaded = false

  // ── FPS toggle button (always visible) ──────────────────────
  const btn = document.createElement('button')
  btn.id = 'hud-toggle'
  btn.style.cssText = [
    'position:fixed', 'top:10px', 'right:10px', 'z-index:101',
    'background:rgba(0,0,0,0.55)', 'color:#fff',
    'font:bold 14px/1 monospace',
    'border:1px solid rgba(255,255,255,0.15)', 'border-radius:8px',
    'padding:10px 16px', 'cursor:pointer', 'min-width:80px',
    'min-height:40px',                      // touch-friendly
    'text-align:center', 'backdrop-filter:blur(8px)',
    'user-select:none', '-webkit-user-select:none',
    'touch-action:manipulation',
  ].join(';')
  btn.textContent = '… FPS'
  document.body.appendChild(btn)

  // ── Detail panel ────────────────────────────────────────────
  const panel = document.createElement('div')
  panel.id = 'hud-panel'
  panel.style.cssText = [
    'position:fixed', 'top:58px', 'right:10px', 'z-index:100',
    'background:rgba(0,0,0,0.72)', 'color:#fff',
    'font:13px/1.6 monospace',
    'border-radius:8px', 'padding:10px 14px', 'min-width:250px',
    'max-height:80vh', 'overflow-y:auto', 'user-select:none',
    'box-shadow:0 2px 12px rgba(0,0,0,0.5)',
  ].join(';')
  panel.style.display = expanded ? '' : 'none'
  document.body.appendChild(panel)

  btn.addEventListener('click', () => {
    expanded = !expanded
    panel.style.display = expanded ? '' : 'none'
  })

  // ── Render panel contents ───────────────────────────────────
  function update(fps, data, loaded) {
    if (data) Object.assign(currentModelData, data)
    if (loaded !== undefined) allLoaded = loaded

    // Button always shows live FPS
    const fpsVal = fps !== undefined ? Math.round(fps) : null
    btn.textContent = (fpsVal !== null && isFinite(fpsVal)) ? `${fpsVal} FPS` : '… FPS'

    if (!expanded) return

    const activeMeshes = scene.getActiveMeshes().length
    let html = `<div style="color:#aaa;font-size:11px">active meshes: ${activeMeshes}</div>`
    html += `<hr style="border:none;border-top:1px solid #444;margin:6px 0">`

    if (!allLoaded) {
      const done = Object.keys(currentModelData).length
      html += `<div style="color:#aaa">Loading… ${done}/${modelNames.length}</div>`
      for (const name of modelNames) {
        const d = currentModelData[name]
        html += `<div>${!d ? '⏳' : d.error ? '❌' : '✔'} ${name}</div>`
      }
    } else {
      let totalTris = 0, totalMeshes = 0
      const maxTri = Math.max(1, ...modelNames.map(n => currentModelData[n]?.triCount || 0))

      for (const name of modelNames) {
        const d = currentModelData[name]
        if (!d || d.error) { html += `<div style="color:#f66">❌ ${name}</div>`; continue }
        if (d.visible) { totalTris += d.triCount; totalMeshes += d.meshCount }

        const barW   = Math.round((d.triCount / maxTri) * 60)
        const barCSS = `height:3px;width:${barW}px;background:#4af;margin:1px 0 3px`
        const vis    = d.visible
        const bStyle = `cursor:pointer;padding:2px 8px;font-size:11px;min-height:28px;`
          + `background:${vis ? '#1a4a1a' : '#333'};color:${vis ? '#6f6' : '#aaa'};`
          + `border:1px solid ${vis ? '#3a8a3a' : '#555'};border-radius:4px`

        html += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">`
          + `<button data-m="${name}" style="${bStyle}">${vis ? 'ON' : 'OFF'}</button>`
          + `<div><b>${name}</b><br>`
          + `<span style="color:#aaa;font-size:11px">${d.meshCount} meshes · ${fmtK(d.triCount)} tris</span>`
          + `<div style="${barCSS}"></div></div></div>`
      }

      html += `<hr style="border:none;border-top:1px solid #444;margin:6px 0">`
      html += `<div style="color:#aaa;font-size:11px">visible: ${totalMeshes} meshes · ${fmtK(totalTris)} tris</div>`
    }

    panel.innerHTML = html

    panel.querySelectorAll('button[data-m]').forEach(b => {
      b.addEventListener('click', () => {
        const d = currentModelData[b.dataset.m]
        if (!d) return
        d.visible = !d.visible
        d.refs.forEach(m => m.setEnabled(d.visible))
        update(engine.getFps(), null)
      })
    })
  }

  return { update }
}
