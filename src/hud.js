import { SETTINGS } from './constants'
import { setPilmiTexture, setPilmiIntensity } from './pilmiShelvesLoader'

function fmtK(n) { return n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n) }
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

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

  // Use pointerdown delegation so toggles stay reliable while panel HTML refreshes.
  panel.addEventListener('pointerdown', (e) => {
    const toggle = e.target.closest('button[data-m]')
    const pilmiBtn = e.target.closest('button[data-pilmi]')
    if (pilmiBtn) {
      e.preventDefault()
      e.stopPropagation()
      const slot = pilmiBtn.dataset.pilmi
      SETTINGS.pilmi[slot] = !SETTINGS.pilmi[slot]
      setPilmiTexture(slot, SETTINGS.pilmi[slot])
      update(engine.getFps(), null)
      window.__requestRender?.()
      return
    }
    if (!toggle) return
    e.preventDefault()
    e.stopPropagation()
    const d = currentModelData[toggle.dataset.m]
    if (!d) return
    d.visible = !d.visible
    d.refs.forEach(m => m.setEnabled(d.visible))
    update(engine.getFps(), null)
    window.__requestRender?.()
  })

  // Slider input delegation for PILMI intensity
  panel.addEventListener('input', (e) => {
    const slider = e.target.closest('input[data-pilmi-intensity]')
    if (!slider) return
    const slot = slider.dataset.pilmiIntensity
    const val = parseFloat(slider.value)
    SETTINGS.pilmi[slot + 'Intensity'] = val
    setPilmiIntensity(slot, val)
    // Update the label next to the slider
    const label = slider.parentElement.querySelector('.pilmi-val')
    if (label) label.textContent = val.toFixed(2)
    window.__requestRender?.()
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
            + `<button data-m="${esc(name)}" style="${bStyle}">${vis ? 'ON' : 'OFF'}</button>`
          + `<div><b>${esc(name)}</b><br>`
          + `<span style="color:#aaa;font-size:11px">${d.meshCount} meshes · ${fmtK(d.triCount)} tris</span>`
          + `<div style="${barCSS}"></div></div></div>`
      }

      html += `<hr style="border:none;border-top:1px solid #444;margin:6px 0">`
      html += `<div style="color:#aaa;font-size:11px">visible: ${totalMeshes} meshes · ${fmtK(totalTris)} tris</div>`

      // PILMI texture toggles + intensity sliders
      const lmOn = SETTINGS.pilmi.lightmap
      const aoOn = SETTINGS.pilmi.ao
      const lmInt = SETTINGS.pilmi.lightmapIntensity
      const aoInt = SETTINGS.pilmi.aoIntensity
      const pStyle = (on) => `cursor:pointer;padding:2px 8px;font-size:11px;min-height:28px;`
        + `background:${on ? '#1a3a5a' : '#333'};color:${on ? '#6cf' : '#aaa'};`
        + `border:1px solid ${on ? '#3a7aba' : '#555'};border-radius:4px`
      const sliderCSS = `width:100%;accent-color:#6cf;margin:2px 0`
      html += `<hr style="border:none;border-top:1px solid #444;margin:6px 0">`
      html += `<div style="color:#aaa;font-size:11px;margin-bottom:4px">PILMI textures</div>`
      html += `<div style="display:flex;gap:6px;margin-bottom:6px">`
        + `<button data-pilmi="lightmap" style="${pStyle(lmOn)}">${lmOn ? 'LM ON' : 'LM OFF'}</button>`
        + `<button data-pilmi="ao" style="${pStyle(aoOn)}">${aoOn ? 'AO ON' : 'AO OFF'}</button>`
        + `</div>`
      html += `<div style="font-size:11px;color:#aaa">`
        + `LM intensity: <span class="pilmi-val">${lmInt.toFixed(2)}</span>`
        + `<input type="range" data-pilmi-intensity="lightmap" min="0" max="2" step="0.05" value="${lmInt}" style="${sliderCSS}">`
        + `</div>`
      html += `<div style="font-size:11px;color:#aaa">`
        + `AO intensity: <span class="pilmi-val">${aoInt.toFixed(2)}</span>`
        + `<input type="range" data-pilmi-intensity="ao" min="0" max="2" step="0.05" value="${aoInt}" style="${sliderCSS}">`
        + `</div>`
    }

    panel.innerHTML = html

  }

  return { update }
}
