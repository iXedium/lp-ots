import { IS_DEV } from './isDev'

/**
 * Scene state machine.
 * States flow linearly with a loop at the end for pin exploration.
 */
export const STATES = {
  LOADING:          'LOADING',
  INTRO_CLOSEUP:    'INTRO_CLOSEUP',
  AWAITING_REACT:   'AWAITING_REACT',
  FLY_TO_ORBIT:     'FLY_TO_ORBIT',
  ORBIT_TUTORIAL:   'ORBIT_TUTORIAL',
  FLY_TO_PIN:       'FLY_TO_PIN',
  REACT_CONTENT:    'REACT_CONTENT',
  FLY_BACK_ORBIT:   'FLY_BACK_ORBIT',
  ORBIT_FREE:       'ORBIT_FREE',
}

/** Valid transitions (from → [to, …]) */
const TRANSITIONS = {
  [STATES.LOADING]:        [STATES.INTRO_CLOSEUP],
  [STATES.INTRO_CLOSEUP]:  [STATES.AWAITING_REACT],
  [STATES.AWAITING_REACT]: [STATES.FLY_TO_ORBIT],
  [STATES.FLY_TO_ORBIT]:   [STATES.ORBIT_TUTORIAL, STATES.ORBIT_FREE],
  [STATES.ORBIT_TUTORIAL]: [STATES.FLY_TO_PIN],
  [STATES.FLY_TO_PIN]:     [STATES.REACT_CONTENT],
  [STATES.REACT_CONTENT]:  [STATES.FLY_BACK_ORBIT],
  [STATES.FLY_BACK_ORBIT]: [STATES.ORBIT_TUTORIAL, STATES.ORBIT_FREE],
  [STATES.ORBIT_FREE]:     [STATES.FLY_TO_PIN],
}

export class StateMachine {
  constructor() {
    this._state = STATES.LOADING
    /** @type {Map<string, Function[]>} */
    this._enterHooks = new Map()
    /** @type {Map<string, Function[]>} */
    this._exitHooks = new Map()
    /** @type {Function[]} */
    this._changeListeners = []

    if (IS_DEV) console.log(`[State] initial → ${this._state}`)
  }

  get current() { return this._state }

  /**
   * Transition to a new state.
   * In release mode, invalid transitions are silently ignored.
   * In dev mode, they throw.
   * @param {string} newState
   * @param {boolean} [force=false] - skip guard check (dev only)
   */
  transitionTo(newState, force = false) {
    const prev = this._state
    if (prev === newState) return

    if (!force) {
      const allowed = TRANSITIONS[prev]
      if (!allowed || !allowed.includes(newState)) {
        if (IS_DEV) {
          console.error(`[State] Invalid transition: ${prev} → ${newState}`)
        }
        return
      }
    } else if (IS_DEV) {
      console.warn(`[State] FORCED: ${prev} → ${newState}`)
    }

    // Exit hooks
    const exitHooks = this._exitHooks.get(prev)
    if (exitHooks) exitHooks.forEach(fn => fn(prev, newState))

    this._state = newState

    if (IS_DEV) console.log(`[State] ${prev} → ${newState}`)

    // Enter hooks
    const enterHooks = this._enterHooks.get(newState)
    if (enterHooks) enterHooks.forEach(fn => fn(newState, prev))

    // Generic change listeners
    this._changeListeners.forEach(fn => fn(newState, prev))
  }

  /** Register a callback for entering a specific state */
  onEnter(state, fn) {
    if (!this._enterHooks.has(state)) this._enterHooks.set(state, [])
    this._enterHooks.get(state).push(fn)
  }

  /** Register a callback for exiting a specific state */
  onExit(state, fn) {
    if (!this._exitHooks.has(state)) this._exitHooks.set(state, [])
    this._exitHooks.get(state).push(fn)
  }

  /** Register a callback for any state change */
  onChange(fn) {
    this._changeListeners.push(fn)
  }
}
