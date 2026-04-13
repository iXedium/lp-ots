import { IS_DEV } from './isDev'

/**
 * sceneAPI — public bridge between the BJS scene and the React parent.
 *
 * React calls methods:   sceneAPI.flyToIsland(), sceneAPI.returnFromPin()
 * BJS fires events:      'introComplete', 'pinClicked', 'shotArrived', 'orbitReady'
 *
 * Internally uses EventTarget for a clean pub/sub pattern.
 */
class SceneAPI extends EventTarget {
  constructor() {
    super()
    /** @type {import('./StateMachine').StateMachine | null} */
    this._sm = null
  }

  /** Called once during init to wire the state machine */
  _init(stateMachine) {
    this._sm = stateMachine
  }

  // ── Methods React calls ──────────────────────────────────────

  /** React calls this after receiving 'introComplete' to fly camera to the island */
  flyToIsland() {
    if (IS_DEV) console.log('[sceneAPI] flyToIsland()')
    this.dispatchEvent(new CustomEvent('_cmd:flyToIsland'))
  }

  /** React calls this when the user closes the content panel */
  returnFromPin() {
    if (IS_DEV) console.log('[sceneAPI] returnFromPin()')
    this.dispatchEvent(new CustomEvent('_cmd:returnFromPin'))
  }

  // ── Events BJS fires ────────────────────────────────────────

  /** Fire when intro sequence finishes */
  emitIntroComplete() {
    if (IS_DEV) console.log('[sceneAPI] → introComplete')
    this.dispatchEvent(new Event('introComplete'))
  }

  /** Fire when user taps a pin (before camera moves) */
  emitPinClicked(pinId) {
    if (IS_DEV) console.log(`[sceneAPI] → pinClicked: ${pinId}`)
    this.dispatchEvent(new CustomEvent('pinClicked', { detail: { pinId } }))
  }

  /** Fire when camera arrives at pin closeup */
  emitShotArrived(pinId) {
    if (IS_DEV) console.log(`[sceneAPI] → shotArrived: ${pinId}`)
    this.dispatchEvent(new CustomEvent('shotArrived', { detail: { pinId } }))
  }

  /** Fire when camera returns to orbit view */
  emitOrbitReady() {
    if (IS_DEV) console.log('[sceneAPI] → orbitReady')
    this.dispatchEvent(new Event('orbitReady'))
  }
}

export const sceneAPI = new SceneAPI()

// In dev mode, expose on window for console testing
if (IS_DEV) {
  window.sceneAPI = sceneAPI
}
