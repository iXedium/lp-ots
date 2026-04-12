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
 * Estimate total GPU VRAM used by textures in the scene.
 * Compressed (KTX2/ASTC/BC7) ≈ 1 byte/pixel; uncompressed (PNG/JPG) ≈ 4 bytes/pixel.
 */
function estimateTextureVRAM(scene) {
  let totalBytes = 0
  let count = 0
  const seen = new Set()
  for (const tex of scene.textures) {
    const t = tex._texture
    if (!t || seen.has(t)) continue
    seen.add(t)
    const w = t.width || 0, h = t.height || 0
    if (!w || !h) continue
    count++
    const url = tex._url || tex.url || tex.name || ''
    const isCompressed = url.includes('.ktx2') || !!t._compression
    const bpp = isCompressed ? 1 : 4
    const mipFactor = (t.generateMipMaps || isCompressed) ? 1.333 : 1
    totalBytes += Math.ceil(w * h * bpp * mipFactor)
  }
  return { totalBytes, count }
}

/**
 * Build HTML for the draw-call stats breakdown panel.
 * Categorises active meshes by type and material, estimates per-pass DC counts.
 */
function buildDCStatsHTML(scene) {
  const activeMeshes = scene.getActiveMeshes()
  const engineDC = window.__dcPerFrame || 0

  let mainPassDCs = 0, depthPassDCs = 0
  let pilmiMasters = 0, pilmiInst = 0
  let otherMasters = 0, otherInst = 0
  let transparentCount = 0
  const byMat = new Map()

  for (let i = 0; i < activeMeshes.length; i++) {
    const m = activeMeshes.data[i]
    if (!m) continue

    const mat = m.material
    const isPilmi = mat?.name?.startsWith('pilmi_')
    const isInst = m.isAnInstance

    // Only non-instances generate draw calls (instances are batched with master)
    if (!isInst) {
      mainPassDCs++
      if (!(mat?.needAlphaBlending?.() || mat?.needAlphaTesting?.())) {
        depthPassDCs++
      }
    }

    if (isPilmi) {
      if (isInst) pilmiInst++; else pilmiMasters++
    } else {
      if (isInst) otherInst++; else otherMasters++
    }
    if (mat?.needAlphaBlending?.()) transparentCount++

    const matName = mat?.name || '(none)'
    if (!byMat.has(matName)) byMat.set(matName, { m: 0, i: 0 })
    const g = byMat.get(matName)
    if (isInst) g.i++; else g.m++
  }

  const estTotal = mainPassDCs + depthPassDCs
  const extra = engineDC - estTotal
  const sorted = [...byMat.entries()]
    .sort((a, b) => (b[1].m + b[1].i) - (a[1].m + a[1].i))
    .slice(0, 20)

  const s = `font-size:11px;color:#aaa`
  let h = `<hr style="border:none;border-top:1px solid #444;margin:6px 0">`
  h += `<div style="${s}"><b style="color:#fc6">Engine DCs: ${engineDC}</b> &nbsp; Active: ${activeMeshes.length}</div>`
  h += `<div style="${s};margin-top:4px"><b>Render pass estimate:</b></div>`
  h += `<div style="${s}">&nbsp; Main: ${mainPassDCs} &nbsp; Depth: ${depthPassDCs} &nbsp; Est: ${estTotal}`
  if (extra > 5) h += ` <span style="color:#f88">(+${extra} other)</span>`
  h += `</div>`
  h += `<div style="${s};margin-top:4px">`
  h += `PILMI: <b>${pilmiMasters}</b> masters, ${pilmiInst} inst &nbsp; `
  h += `Other: <b>${otherMasters}</b> masters, ${otherInst} inst`
  if (transparentCount) h += ` &nbsp; Transparent: ${transparentCount}`
  h += `</div>`

  // VRAM texture estimate
  const vram = estimateTextureVRAM(scene)
  const vramMB = (vram.totalBytes / (1024 * 1024)).toFixed(1)
  h += `<div style="${s};margin-top:2px">Textures: <b>${vram.count}</b> &nbsp; VRAM est: <b>${vramMB} MB</b></div>`

  h += `<div style="${s};margin-top:4px"><b>Per material (top 20):</b></div>`
  h += `<div data-scroll-id="dc-mats" style="${s};max-height:180px;overflow-y:auto;font-size:10px;line-height:1.5">`
  for (const [name, g] of sorted) {
    const instStr = g.i > 0 ? ` <span style="color:#6cf">+${g.i}i</span>` : ''
    h += `<div>${g.m} DC${instStr} &nbsp;<span style="color:#888">${esc(name)}</span></div>`
  }
  h += `</div>`
  return h
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
  let dcStatsVisible = false

  // ── Drag state ───────────────────────────────────────────────
  let hudX = 0, hudY = 10
  let dragging = false, dragDx = 0, dragDy = 0, didDrag = false
  const DRAG_THRESHOLD = 5

  function applyHudPos() {
    hudX = Math.max(0, Math.min(hudX, window.innerWidth  - btn.offsetWidth  - 2))
    hudY = Math.max(0, Math.min(hudY, window.innerHeight - btn.offsetHeight - 2))
    btn.style.left  = hudX + 'px'
    btn.style.right = ''
    btn.style.top   = hudY + 'px'
    const panelLeft = Math.max(0, Math.min(hudX, window.innerWidth - 264))
    panel.style.left  = panelLeft + 'px'
    panel.style.right = ''
    panel.style.top   = (hudY + btn.offsetHeight + 8) + 'px'
  }

  // ── FPS toggle button (always visible) ──────────────────────
  const btn = document.createElement('button')
  btn.id = 'hud-toggle'
  btn.style.cssText = [
    'position:fixed', 'top:10px', 'right:10px', 'z-index:101',
    'background:rgba(0,0,0,0.55)', 'color:#fff',
    'font:bold 14px/1.4 monospace',
    'border:1px solid rgba(255,255,255,0.15)', 'border-radius:8px',
    'padding:8px 14px', 'cursor:grab', 'width:110px',
    'text-align:center', 'backdrop-filter:blur(8px)',
    'user-select:none', '-webkit-user-select:none',
    'touch-action:none',
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
  // Defer initial position to next frame so layout is settled and offsetWidth is real
  requestAnimationFrame(() => {
    hudX = window.innerWidth - btn.offsetWidth - 10
    applyHudPos()
  })

  // ── Drag + click on button ───────────────────────────────────
  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    dragging = true
    didDrag  = false
    dragDx   = e.clientX - hudX
    dragDy   = e.clientY - hudY
    btn.setPointerCapture(e.pointerId)
    btn.style.cursor = 'grabbing'
    e.preventDefault()
  })
  btn.addEventListener('pointermove', (e) => {
    if (!dragging) return
    const nx = e.clientX - dragDx
    const ny = e.clientY - dragDy
    if (Math.abs(nx - hudX) > DRAG_THRESHOLD || Math.abs(ny - hudY) > DRAG_THRESHOLD) didDrag = true
    hudX = nx; hudY = ny
    applyHudPos()
  })
  btn.addEventListener('pointerup', (e) => {
    if (!dragging) return
    dragging = false
    btn.style.cursor = 'grab'
    try { btn.releasePointerCapture(e.pointerId) } catch {}
    if (!didDrag) {
      expanded = !expanded
      panel.style.display = expanded ? '' : 'none'
      if (expanded) applyHudPos()
    }
  })
  btn.addEventListener('pointercancel', () => { dragging = false; btn.style.cursor = 'grab' })

  // Re-clamp on resize
  window.addEventListener('resize', applyHudPos)

  // Use pointerdown delegation so toggles stay reliable while panel HTML refreshes.
  panel.addEventListener('pointerdown', (e) => {
    const actionBtn = e.target.closest('button[data-action]')
    if (actionBtn) {
      e.preventDefault()
      e.stopPropagation()
      const action = actionBtn.dataset.action
      if (action === 'rod') {
        window.__setRodEnabled?.(!(window.__rodEnabled !== false))
        update(engine.getFps(), null)
      } else if (action === 'water-tweaker') {
        window.__toggleWaterTweaker?.()
      } else if (action === 'dc-stats') {
        dcStatsVisible = !dcStatsVisible
        update(engine.getFps(), null)
      }
      return
    }
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

    // Button: two rows — FPS on top, DC on bottom
    const fpsVal = fps !== undefined ? Math.round(fps) : null
    const dc = window.__dcPerFrame || 0
    const idle = window.__isRenderIdle
    const fpsText = (fpsVal !== null && isFinite(fpsVal)) ? `${fpsVal} FPS` : '… FPS'
    const dcText = dc > 0 ? `${dc} DC` : ''
    const idleHtml = idle ? ' <span style="color:#f66;font-size:11px">⏸</span>' : ''
    btn.innerHTML = `${fpsText}${idleHtml}<br><span style="font-size:11px;color:#fc6">${dcText}</span>`

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

    // ── Dev tools ─────────────────────────────────────────────
    const rodOn = window.__rodEnabled !== false
    const dBase = `cursor:pointer;padding:2px 8px;font-size:11px;min-height:28px;border-radius:4px;border:1px solid`
    const rodStyle = `${dBase} ${rodOn ? '#3a8a3a' : '#555'};background:${rodOn ? '#1a4a1a' : '#333'};color:${rodOn ? '#6f6' : '#aaa'}`
    const wtStyle  = `${dBase} #3a6a9a;background:#1a3a5a;color:#6cf`
    const dcStyle  = `${dBase} ${dcStatsVisible ? '#8a6a3a' : '#555'};background:${dcStatsVisible ? '#4a3a1a' : '#333'};color:${dcStatsVisible ? '#fc6' : '#aaa'}`
    html += `<hr style="border:none;border-top:1px solid #444;margin:6px 0">`
    html += `<div style="color:#aaa;font-size:11px;margin-bottom:4px">Dev tools</div>`
    html += `<div style="display:flex;gap:6px;flex-wrap:wrap">`
      + `<button data-action="rod" style="${rodStyle}">ROD: ${rodOn ? 'ON' : 'OFF'}</button>`
      + `<button data-action="water-tweaker" style="${wtStyle}">Water Tweaker</button>`
      + `<button data-action="dc-stats" style="${dcStyle}">DC Stats: ${dcStatsVisible ? 'ON' : 'OFF'}</button>`
      + `</div>`

    // ── DC Stats breakdown ────────────────────────────────────
    if (dcStatsVisible) {
      html += buildDCStatsHTML(scene)
    }

    // Preserve scroll positions across HTML refreshes so the user can scroll
    // down without it jumping back to top every update cycle.
    const scrollState = { _panel: panel.scrollTop }
    panel.querySelectorAll('[data-scroll-id]').forEach(el => {
      scrollState[el.dataset.scrollId] = el.scrollTop
    })
    panel.innerHTML = html
    panel.scrollTop = scrollState._panel
    panel.querySelectorAll('[data-scroll-id]').forEach(el => {
      if (scrollState[el.dataset.scrollId] != null)
        el.scrollTop = scrollState[el.dataset.scrollId]
    })

  }

  return { update }
}
