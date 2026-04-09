import { SETTINGS } from './constants'

/**
 * Floating UI panel to tweak shorelineFoam settings in real-time.
 * Mutates SETTINGS.shorelineFoam directly — the shader's onBind reads it each frame.
 */
export function createWaterTweaker() {
  const f = SETTINGS.shorelineFoam

  const panel = document.createElement('div')
  panel.id = 'water-tweaker'
  panel.innerHTML = buildHTML(f)
  document.body.appendChild(panel)

  // Make it draggable by the header
  const header = panel.querySelector('.wt-header')
  let dragging = false, dx = 0, dy = 0
  header.addEventListener('pointerdown', e => {
    dragging = true
    dx = e.clientX - panel.offsetLeft
    dy = e.clientY - panel.offsetTop
    header.setPointerCapture(e.pointerId)
  })
  header.addEventListener('pointermove', e => {
    if (!dragging) return
    panel.style.left = (e.clientX - dx) + 'px'
    panel.style.top  = (e.clientY - dy) + 'px'
  })
  header.addEventListener('pointerup', () => { dragging = false })

  // Collapse toggle
  const body = panel.querySelector('.wt-body')
  const collapseBtn = panel.querySelector('.wt-collapse')
  collapseBtn.addEventListener('click', () => {
    body.style.display = body.style.display === 'none' ? '' : 'none'
    collapseBtn.textContent = body.style.display === 'none' ? '+' : '−'
  })

  // Slider + color input delegation
  panel.addEventListener('input', e => {
    const el = e.target
    const key = el.dataset.key
    if (!key) return

    if (el.type === 'range') {
      const val = parseFloat(el.value)
      f[key] = val
      el.nextElementSibling.textContent = val.toFixed(2)
    } else if (el.type === 'color') {
      const hex = el.value
      const r = parseInt(hex.slice(1, 3), 16) / 255
      const g = parseInt(hex.slice(3, 5), 16) / 255
      const b = parseInt(hex.slice(5, 7), 16) / 255
      f[key].r = r
      f[key].g = g
      f[key].b = b
    }
    window.__requestRender?.()
  })

  // Alpha sliders for colors
  panel.addEventListener('input', e => {
    const el = e.target
    const aKey = el.dataset.alphaKey
    if (!aKey) return
    const val = parseFloat(el.value)
    f[aKey].a = val
    el.nextElementSibling.textContent = val.toFixed(2)
    window.__requestRender?.()
  })

  // Copy button — output current values as JS object
  panel.querySelector('.wt-copy').addEventListener('click', () => {
    const out = JSON.stringify(f, null, 2)
    navigator.clipboard.writeText(out).then(() => {
      const btn = panel.querySelector('.wt-copy')
      btn.textContent = 'Copied!'
      setTimeout(() => { btn.textContent = 'Copy values' }, 1500)
    })
  })
}

function toHex(c) {
  const r = Math.round(c.r * 255).toString(16).padStart(2, '0')
  const g = Math.round(c.g * 255).toString(16).padStart(2, '0')
  const b = Math.round(c.b * 255).toString(16).padStart(2, '0')
  return `#${r}${g}${b}`
}

function slider(label, key, value, min, max, step) {
  return `<label class="wt-row">
    <span class="wt-label">${label}</span>
    <input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${value}">
    <span class="wt-val">${value.toFixed(2)}</span>
  </label>`
}

function colorRow(label, key, colorObj) {
  return `<label class="wt-row">
    <span class="wt-label">${label}</span>
    <input type="color" data-key="${key}" value="${toHex(colorObj)}">
    <input type="range" data-alpha-key="${key}" min="0" max="1" step="0.05" value="${colorObj.a}">
    <span class="wt-val">${colorObj.a.toFixed(2)}</span>
  </label>`
}

function buildHTML(f) {
  return `
<style>
  #water-tweaker {
    position: fixed; top: 60px; left: 10px; z-index: 200;
    background: rgba(15,20,30,0.92); color: #e0e8f0;
    font: 12px/1.5 'Segoe UI', system-ui, sans-serif;
    border-radius: 10px; min-width: 280px; max-width: 340px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    user-select: none; -webkit-user-select: none;
    backdrop-filter: blur(12px);
  }
  .wt-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 8px 12px; cursor: grab; border-bottom: 1px solid rgba(255,255,255,0.08);
    font-weight: 600; font-size: 13px;
  }
  .wt-header:active { cursor: grabbing; }
  .wt-collapse {
    background: none; border: 1px solid rgba(255,255,255,0.2); color: #fff;
    width: 24px; height: 24px; border-radius: 4px; cursor: pointer;
    font-size: 16px; line-height: 1; display: flex; align-items: center; justify-content: center;
  }
  .wt-body { padding: 8px 12px 12px; }
  .wt-section { color: #7ab; font-size: 11px; text-transform: uppercase; margin: 10px 0 4px; letter-spacing: 0.5px; }
  .wt-section:first-child { margin-top: 0; }
  .wt-row {
    display: flex; align-items: center; gap: 6px; margin: 3px 0;
  }
  .wt-label { flex: 0 0 95px; font-size: 11px; color: #9ab; }
  .wt-row input[type="range"] { flex: 1; height: 4px; accent-color: #4af; }
  .wt-row input[type="color"] { width: 32px; height: 22px; border: 1px solid #444; border-radius: 4px; padding: 0; cursor: pointer; background: none; }
  .wt-val { flex: 0 0 38px; text-align: right; font-size: 11px; font-family: monospace; color: #acc; }
  .wt-copy {
    width: 100%; margin-top: 10px; padding: 6px; border: 1px solid rgba(255,255,255,0.15);
    background: rgba(255,255,255,0.05); color: #8cf; border-radius: 6px;
    cursor: pointer; font-size: 12px; text-align: center;
  }
  .wt-copy:hover { background: rgba(255,255,255,0.12); }
</style>
<div class="wt-header">
  <span>Water Shader</span>
  <button class="wt-collapse">−</button>
</div>
<div class="wt-body">
  <div class="wt-section">Colors</div>
  ${colorRow('Deep', 'deepColor', f.deepColor)}
  ${colorRow('Shallow', 'shallowColor', f.shallowColor)}
  ${colorRow('Foam', 'foamColor', f.foamColor)}

  <div class="wt-section">Depth</div>
  ${slider('Max Depth', 'maxDepth', f.maxDepth, 0.5, 30, 0.5)}
  ${slider('Shore Power', 'shorePower', f.shorePower, 0.5, 10, 0.1)}

  <div class="wt-section">Foam Edge</div>
  ${slider('Edge Width', 'foamEdgeWidth', f.foamEdgeWidth, 0, 5, 0.05)}

  <button class="wt-copy">Copy values</button>
</div>`
}
