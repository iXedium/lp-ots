# Island 3D Scene — Camera, Controls & Interaction System
## Implementation Prompt for Claude Opus

---

## How to Use This Document

This document is a **comprehensive brief** for implementing the camera system, interaction flow, pin system, and developer tooling for a BabylonJS (Vite) 3D island scene. It is intended to be given to an AI coding assistant (Claude Opus or equivalent) with full access to the codebase.

### Critical Instructions for the AI Implementing This

1. **Code suggestions in this document are illustrative only.** They show intent and direction. You have full access to the existing codebase, and you may find better approaches, more idiomatic patterns, or existing utilities that supersede what is suggested here. Always prefer solutions that integrate cleanly with the existing code.

2. **Research before implementing.** Use your tools to check the latest BabylonJS documentation, GSAP docs, and any relevant community examples. The API surface of BJS changes between versions — verify the methods exist in the version used by this project before writing them.

3. **Check the console after every meaningful code change.** Use the Chrome DevTools MCP to read console output, errors, and warnings. Do not proceed to the next step if there are unresolved errors.

4. **Take a screenshot when visual output is relevant.** Use the screenshot tool to verify visual states where appropriate. However, **do not self-approve final visual milestones** — always use `askQuestion` to get the developer's sign-off on visual results.

5. **Phase structure is mandatory.** Implement one phase at a time. Do not proceed to the next phase without asking the developer via `askQuestion`. Each phase ends with a testable milestone.

6. **`askQuestion` format rules (apply to every question asked):**
   - Always provide 3–5 specific options relevant to the current situation
   - The **last option must always be** an open-ended "None of the above / I'll type my response" option so the developer can give freeform feedback
   - Keep questions tight — one decision per question

7. **Dev mode vs Release mode** is a hard requirement. Every dev-only feature must be gated. No dev UI, no dev logging, no dev shortcuts should be present or executable in release mode.

---

## Project Context

The BabylonJS scene is a low-poly 3D island with a hotel, pool, restaurant, beach, and dock. It is built with Vite and BabylonJS. It will eventually be embedded as a web object inside a React (Vite) parent application. For now, treat the BJS scene as self-contained, but architect the communication bridge in a way that is easy to wire up to a parent framework later.

The experience has a specific flow described below, and all camera movements must feel **smooth, cinematic, and intentional** — never abrupt or mechanical.

---

## Mode System

Two build modes must be supported throughout the entire codebase:

### `DEV` mode
- Enabled by a flag, e.g. `import.meta.env.MODE === 'development'` or a manual constant in a `SETTINGS` or `config.js` file
- Dev UI panel visible (floating overlay, keyboard shortcut to toggle)
- Verbose console logging
- Camera readout live-updating
- All pins visible and clickable regardless of status
- Dev navigation shortcuts (keyboard or UI buttons) to jump to any state
- "Back to orbit" button available at all times so the developer never gets stuck

### `RELEASE` mode
- All dev UI completely removed, not just hidden
- No verbose logging
- Pins respect their `status` field
- Full state machine flow enforced (cannot skip steps)
- Clean console output

> **Suggestion:** Use a single `IS_DEV` boolean constant imported everywhere. Tree-shaking in Vite's production build will remove all `if (IS_DEV)` branches automatically if the value is a compile-time constant.

---

## Architecture Overview

### Suggested File Structure

```
src/
├── config/
│   ├── settings.js          # SETTINGS constant (camera limits, timing, etc.)
│   └── IS_DEV.js            # Single export: IS_DEV boolean
├── camera/
│   ├── CameraManager.js     # Fly-to, limit toggling, intro sequence
│   └── cameraUtils.js       # worldPosToArcParams(), etc.
├── pins/
│   ├── PinManager.js        # Mesh creation, bobbing, hit detection
│   └── pins.json            # All pin data (see schema below)
├── scene/
│   ├── intro.js             # HTML loader fade + BJS camera pull-down
│   └── sceneAPI.js          # Event bridge (emit/on) for React communication
├── dev/
│   └── DevUI.js             # Dev overlay panel — only instantiated if IS_DEV
└── stateмашина/
    └── StateMachine.js      # Scene state manager
```

---

## `pins.json` Schema

Every pin lives in this file — including the tutorial pin. This is the single source of truth for pin data, camera shots, and pin status.

```json
{
  "pins": [
    {
      "id": "tutorial",
      "label": "Start Here",
      "isTutorial": true,
      "status": "open",
      "visible": true,
      "position": { "x": 0, "y": 0.5, "z": 0 },
      "hitScreenRadius": 52,
      "cameraShot": {
        "alpha": -1.2,
        "beta": 1.05,
        "radius": 8,
        "target": { "x": 0, "y": 0, "z": 0 }
      },
      "reactRoute": "/tutorial"
    }
  ]
}
```

### Pin Status Values

| Status | Meaning | Visual |
|--------|---------|--------|
| `locked` | Not yet available | Greyed out, not clickable |
| `open` | Available, not started | Red, bobbing, clickable |
| `active` | Currently open in React | Yellow/amber |
| `complete` | Finished, revisitable | Green with checkmark |

---

## State Machine

The scene has a clear linear flow. Implement this as an explicit state machine (a class or module with a current state, transition guards, and enter/exit hooks).

```
LOADING
  → INTRO_CLOSEUP        (HTML fade-out + camera pull-down completes)
  → AWAITING_REACT       (handover to React — React will call sceneAPI.flyToIsland())
  → FLY_TO_ORBIT         (camera animates to island overview)
  → ORBIT_TUTORIAL       (user can orbit; only tutorial pin visible & clickable)
  → FLY_TO_PIN           (user tapped a pin; camera locked and animating)
  → REACT_CONTENT        (handover to React content panel)
  → FLY_BACK_ORBIT       (React calls sceneAPI.returnFromPin(); camera returns)
  → ORBIT_FREE           (all pins now visible; user explores freely)
  → FLY_TO_PIN           (loop)
```

In dev mode, the state machine should allow forced transitions via the Dev UI.

---

## `sceneAPI.js` — React Bridge

This module is the public interface between BJS and the React parent. Keep it minimal, event-driven, and decoupled. The implementation details of how events are transported (CustomEvent, postMessage, shared window object) can change later — the API surface should stay stable.

```js
// React CALLS these methods on the sceneAPI object:
sceneAPI.flyToIsland()       // triggers FLY_TO_ORBIT from AWAITING_REACT
sceneAPI.returnFromPin()     // triggers FLY_BACK_ORBIT from REACT_CONTENT

// BJS FIRES these events that React can listen to:
// 'introComplete'            fired when INTRO_CLOSEUP finishes
// 'pinClicked'  (pinId)      fired when user taps a pin — before camera moves
// 'shotArrived' (pinId)      fired when camera arrives at the pin's closeup
// 'orbitReady'               fired when camera arrives back at orbit
```

> **Note to implementer:** In dev mode, expose `sceneAPI` on `window.sceneAPI` so you can call it from the browser console to simulate React's signals. This removes the dependency on React being connected during development.

---

## Phase 1 — Foundation: IS_DEV, Settings, State Machine, sceneAPI stub

### Goal
Establish the non-visual infrastructure: the mode flag, a working state machine, and a stub `sceneAPI` that logs transitions. No visual changes yet.

### What to do
1. Create `IS_DEV.js` with the dev flag wired to Vite's `import.meta.env`
2. Audit `settings.js` (or equivalent) and ensure all camera constants and timing values are centralised there — nothing hardcoded in logic files
3. Implement `StateMachine.js` with the states listed above, `transitionTo(state)`, and enter/exit hooks stubbed as console logs
4. Implement `sceneAPI.js` as a simple `EventTarget`-based emitter with the methods listed above
5. In dev mode, attach `sceneAPI` to `window.sceneAPI`
6. Wire the state machine into the existing scene initialisation so it starts in `LOADING` and transitions to `INTRO_CLOSEUP` after scene ready

### Console check
After implementing, open Chrome DevTools and verify:
- No new errors
- State transition logs appear in dev mode
- `window.sceneAPI` is accessible in the console

### Milestone question (use `askQuestion`)
Ask the developer:
- "State machine is logging transitions correctly in the console — ready to move on?"
- "State machine exists but I'm seeing console errors — can you describe them?"
- "The sceneAPI is attached to window and I can call sceneAPI.flyToIsland() in the console"
- "Something else is happening — I'll describe it"

---

## Phase 2 — Camera Manager & Fly-To System

### Goal
Implement a `CameraManager` that wraps the existing `ArcRotateCamera` and can animate it between stored shots smoothly, with automatic limit management.

### Camera setup
The existing camera setup uses `ArcRotateCamera` with limits defined in `SETTINGS`. Keep this. **Do not replace it.**

### Fly-to behaviour
When flying to a stored shot (a `cameraShot` object with `alpha`, `beta`, `radius`, `target`):
1. Detach user control from the camera
2. Remove all `lower/upperBetaLimit` and `lower/upperRadiusLimit` constraints (otherwise GSAP cannot drive the camera outside them)
3. Use **GSAP** to tween `camera.alpha`, `camera.beta`, `camera.radius` simultaneously
4. Use a separate GSAP tween (same timeline, same duration, offset `"<"`) to tween `camera.target.x/y/z`
5. To prevent the camera from clipping through geometry during long-distance moves, add a GSAP keyframe to `radius` that briefly increases to `max(currentRadius, targetRadius) * 1.4` at the midpoint — this arcs the camera path outward through open air
6. On tween complete: restore the appropriate limits for the destination state, re-attach control if the destination is an orbit state
7. Fire the appropriate `sceneAPI` event

> **Suggestion — GSAP vs native BJS:** GSAP is recommended here because its `timeline` API makes sequencing and callbacks clean. However, if the existing codebase already uses BJS's native `Animation` system heavily, or if the GSAP bundle size is a concern, native BJS animations with `onAnimationEnd` chaining are a valid alternative. Evaluate what fits best.

### Easing
`"power2.inOut"` is a good starting point for camera moves. Longer distances may benefit from `"power3.inOut"`. The feel should be like a camera operator accelerating smoothly and decelerating into position.

### Utility: `worldPosToArcParams`
For a given world-space position and a look-at target, compute the `alpha`, `beta`, and `radius` values that would place an `ArcRotateCamera` at that position. This is needed for the Dev UI's "save current shot" feature and for the fly-back to the user's last orbit position.

### Fly-back to last orbit
Before every fly-to-pin, record the camera's current `alpha`, `beta`, `radius`, and `target` as `lastOrbitShot`. When `returnFromPin()` is called, fly back to `lastOrbitShot`.

### Console check
After implementing, verify via Chrome MCP:
- No GSAP import errors
- Fly-to functions can be called from console: `window.sceneAPI` or a temporary test trigger
- Camera moves smoothly and arrives at the correct position
- Limits are restored after the animation

### Screenshot check
Take a screenshot mid-fly and at rest to verify the camera arc feels correct. If the arc clips geometry, increase the midpoint radius multiplier.

### Milestone question (use `askQuestion`)
Ask the developer:
- "Camera fly-to is smooth and the arc avoids geometry — ready to move on?"
- "The arc works but feels too slow / too fast — I'll describe the timing"
- "Camera is flying but clipping through the island — needs more arc height"
- "GSAP isn't installed yet — should I add it, or use native BJS animation?"
- "Something else — I'll describe it"

---

## Phase 3 — Pin System

### Goal
Load `pins.json`, create 3D pin meshes in the scene, animate them, and implement reliable mobile-first tap/click detection.

### Pin mesh
Create a simple but recognisable pin shape per pin:
- A sphere on top of a narrow tapered cylinder, or a cone-topped cylinder
- Colour driven by `status`: red = open, grey = locked, yellow = active, green = complete
- The mesh itself should be relatively small in world space — the visual should read well both up close and from orbit

> **Suggestion:** Consider instancing for efficiency since all pins share the same geometry. BJS `InstancedMesh` is clean for this pattern if all pins use the same shape.

### Bobbing animation
Each pin should gently bob vertically (sine wave on Y position) and rotate slowly on Y axis. This should be a BJS `registerBeforeRender` loop or native animation, **not** GSAP, since it runs continuously. Keep the animation values in `SETTINGS` so they can be tuned.

### Hit detection — mobile-first approach
Do not rely solely on 3D mesh picking for tap detection. The pin mesh may be small at orbit zoom and the touch area must be generous.

**Recommended hybrid approach:**
1. On `pointerdown`, record the pointer position and timestamp
2. On `pointerup`, if the pointer moved less than a threshold (e.g. 8px) and the elapsed time is under 400ms, treat it as a tap
3. Project each visible and clickable pin's world position to screen space using `Vector3.Project` (or equivalent)
4. Check if the tap screen position is within `pin.hitScreenRadius` pixels of any pin's projected position
5. If multiple pins are within range, pick the nearest
6. If a pin is found, trigger the pin interaction — do not fall through to 3D raycast

This approach works regardless of zoom level because `hitScreenRadius` is in pixels, not world units.

### Cursor / pointer states
On desktop, show a pointer cursor when hovering over a pin's projected area. On mobile, this is irrelevant but should not cause errors.

### Console check
- No errors loading `pins.json`
- Each pin creates a mesh at the correct position
- Tap detection logs the correct pin id in dev mode

### Screenshot check
Take a screenshot from the orbit position to verify pins are visible, roughly correctly positioned, and not z-fighting with the ground.

### Milestone question (use `askQuestion`)
Ask the developer:
- "Pins are visible, bobbing, and I can click/tap them — tap events are logging correctly. Ready to move on?"
- "Pins appear but tapping is not registering — I'll describe what happens"
- "Pins are not visible — possible position or mesh issue"
- "One specific thing feels off — I'll describe it"
- "None of the above / I'll type my response"

---

## Phase 4 — Intro Sequence

### Goal
Implement the full opening sequence: the HTML loading screen fades out as the BJS scene fades in from sky, and the camera pulls down to reveal two characters relaxing on the beach.

### Steps
1. **HTML loader** (already exists per the attached `index.html`): when the BJS scene signals ready, begin the fade-out transition on the HTML overlay. Use a CSS `opacity` transition. The fade duration should be in `SETTINGS`.
2. **Sky reveal**: the BJS scene's background/clear colour should match the sky colour so the initial frame is indistinguishable from the HTML loader background as it fades out. Confirm the sky gradient or clear colour is correct before the fade begins.
3. **Camera start position**: before the fade begins, position the camera looking at the sky (high beta angle, looking upward) or at a high elevation above the island. The exact starting angle should produce a frame that looks like open sky.
4. **Pull-down animation**: using `CameraManager.flyTo()` (from Phase 2), animate the camera down to the beach closeup shot where the two characters are resting. This shot's `alpha/beta/radius/target` should be a named shot in `SETTINGS` or derivable from the tutorial area in `pins.json`.
5. On completion, transition state machine to `AWAITING_REACT` and fire `sceneAPI.emit('introComplete')`.

### Timing
- HTML fade-out: suggested 1.0–1.5s
- Pause after fade before camera move: suggested 0.3–0.5s (let the scene settle visually)
- Camera pull-down duration: suggested 2.5–3.5s
These values should all be in `SETTINGS` for easy tuning.

### Console check
- No errors during the sequence
- `introComplete` event fires after the pull-down

### Screenshot check
Take a screenshot at:
1. The start frame (should look like open sky)
2. Mid-pull (camera partway down)
3. The final resting frame (beach closeup)

Show these to confirm the visual arc is correct before asking the developer.

### Milestone question (use `askQuestion`)
Ask the developer:
- "The intro plays smoothly — sky fade-in then camera pulls down to the beach. Visually signed off? Ready to move on?"
- "The fade works but the camera start frame is not sky — it shows the island immediately"
- "The pull-down motion is too fast / too slow — I'll give you the timing I want"
- "The characters are not visible at the end frame — might be a position issue"
- "None of the above / I'll type my response"

---

## Phase 5 — Full State Machine Flow

### Goal
Wire all phases together into the complete state flow and test the end-to-end experience without React connected (using console commands to simulate React signals).

### What to wire
1. `LOADING → INTRO_CLOSEUP`: triggered by scene ready event
2. `INTRO_CLOSEUP → AWAITING_REACT`: triggered on intro sequence complete, fires `introComplete`
3. `AWAITING_REACT → FLY_TO_ORBIT`: triggered by `sceneAPI.flyToIsland()` — in dev mode, call this from console or Dev UI button
4. `FLY_TO_ORBIT → ORBIT_TUTORIAL`: camera arrives at island overview; only tutorial pin is visible and clickable
5. `ORBIT_TUTORIAL → FLY_TO_PIN`: user taps tutorial pin; record last orbit position; detach control; fly to pin shot; fire `pinClicked`
6. `FLY_TO_PIN → REACT_CONTENT`: fly arrives; fire `shotArrived`; in dev mode, Dev UI shows "Simulate React Complete" button
7. `REACT_CONTENT → FLY_BACK_ORBIT`: triggered by `sceneAPI.returnFromPin()` — in dev mode, from console or Dev UI button
8. `FLY_BACK_ORBIT → ORBIT_FREE`: camera arrives back; all pins now visible; fire `orbitReady`
9. `ORBIT_FREE → FLY_TO_PIN → REACT_CONTENT → FLY_BACK_ORBIT → ORBIT_FREE`: loop

### Console check
Walk through the full flow in the console:
- Trigger intro manually if needed
- Call `window.sceneAPI.flyToIsland()`
- Tap the tutorial pin
- Call `window.sceneAPI.returnFromPin()`
- Verify each state transition logs in dev mode
- Verify no errors at any step

### Screenshot check
Take a screenshot of the island orbit view and at least one pin closeup to confirm the camera shots look cinematic and correct.

### Milestone question (use `askQuestion`)
Ask the developer:
- "Full flow works end-to-end using console commands to simulate React. Ready for the Dev UI?"
- "The flow reaches ORBIT_FREE but pin tapping is not triggering the fly-to from that state"
- "Camera gets stuck at a particular transition — I'll tell you which one"
- "The orbit view looks wrong — I'll describe it"
- "None of the above / I'll type my response"

---

## Phase 6 — Dev UI Panel

### Goal
Build the floating developer overlay that allows in-app camera shot positioning, pin placement, and state navigation. **This entire module must be absent in release mode — not just hidden, actually tree-shaken out.**

### Features

#### Camera Readout
- Display live values: `alpha`, `beta`, `radius`, `target.x`, `target.y`, `target.z` — updated every frame
- Each value should be selectable/copyable
- A "Copy as JSON" button that copies the current camera state as a `cameraShot` object to the clipboard

#### Pin Editor
For each pin in `pins.json`:
- Show: id, label, status (editable dropdown), visible toggle
- "Fly to shot" button: fires the fly-to for that pin
- "Set shot from current camera" button: saves the current camera's `alpha/beta/radius/target` as that pin's `cameraShot`
- "Move pin here" button: moves the pin's 3D position to directly below the current camera target (a `Vector3` drop)

#### State Navigator
- Display current state machine state
- Buttons to force-transition to any state (for testing)
- "Simulate React: flyToIsland" button
- "Simulate React: returnFromPin" button

#### Export
- "Export pins.json" button: downloads the current in-memory pin data as a JSON file, including any edits made in this session
- Encourage the developer to copy the JSON back into the source file

#### Toggle
- Keyboard shortcut (e.g. `` ` `` backtick) to show/hide the panel
- Panel should not block the canvas interaction when hidden

### Release mode gate
```js
// Example pattern — Opus should verify this matches the project's IS_DEV setup
if (IS_DEV) {
  const { DevUI } = await import('./dev/DevUI.js')
  new DevUI(cameraManager, pinManager, stateMachine, sceneAPI)
}
```

### Console check
- Dev UI appears in dev mode
- Dev UI is completely absent in a production build (`vite build` output should not contain any DevUI code)
- No errors when using each feature
- Export produces valid JSON

### Milestone question (use `askQuestion`)
Ask the developer:
- "Dev UI is working — I can read camera values, edit pins, and export JSON. Does it look usable and non-intrusive?"
- "Dev UI appears but the camera readout is not updating live"
- "The Export button works but the JSON looks malformed"
- "The panel is appearing in production build — tree-shaking is not working"
- "None of the above / I'll type my response"

---

## Phase 7 — Polish, Easing Tuning & Mobile Testing

### Goal
This phase is about feel, not features. Refine all timing values, easing curves, and mobile-specific behaviour.

### Camera easing review
- Test every fly-to and fly-back. Each should feel like a camera operator — smooth acceleration, smooth deceleration
- Longer distances should have slightly longer durations (consider scaling duration proportionally to angular + radius delta)
- The arc midpoint radius should feel natural — the camera should appear to rise slightly and then settle, not snap upward abruptly

### Mobile orbit tuning
- Test on a real device or Chrome DevTools mobile emulation at 390px width
- `pinchPrecision` and single-finger orbit sensitivity should feel natural on mobile
- Release mode should have tighter orbit limits than dev mode (beta and radius clamps). These should be in `SETTINGS` with separate dev and release presets.
- Verify tap detection works reliably for all pins at various zoom levels

### Pin appearance at various zoom levels
- From full-orbit distance, pins should still be legible
- At close-up distance, pins should not be enormous
- Consider using BJS's `BillboardMode` or a `SizeAttenuation` approach to keep pins at a consistent apparent size — or define a world-space scale that simply looks right at both distances. Research the best BJS approach for this.

### Reduced motion consideration
- The intro pull-down and all fly-tos are core UX, not decorative. They do not need to be disabled for `prefers-reduced-motion`. However, the continuous pin bobbing animation should be paused if `prefers-reduced-motion: reduce` is detected.

### Final end-to-end walkthrough
Run the full experience from LOADING to ORBIT_FREE, tapping multiple pins, returning from each, as if you are the user on a mobile device.

### Screenshot check
Take screenshots of:
1. Full island orbit view on mobile dimensions (390px width)
2. A pin closeup on mobile dimensions
3. Dev UI panel visible (dev mode only)

### Milestone question (use `askQuestion`)
This is the final phase — ask the developer to do full visual and interactive testing before sign-off:
- "All animations feel smooth and the mobile touch controls are working well. Please test the full flow on your device or emulator and let me know if anything needs adjusting."
- "The easing on the fly-to feels robotic — I'll describe what I want"
- "Mobile touch orbit is too sensitive / not sensitive enough"
- "Pin tapping is unreliable on mobile — I'll describe the issue"
- "None of the above / I'll type my response"

---

## Appendix A — SETTINGS Reference

All of these values should be centralised in a `SETTINGS` or `config` file. The AI implementing this should verify against what already exists in the project and extend rather than replace.

```js
camera: {
  // Initial orbital position
  initialAlpha: ...,
  initialBeta: ...,
  initialRadius: ...,

  // Orbit limits — release mode
  lowerBetaLimit: ...,
  upperBetaLimit: ...,
  lowerRadiusLimit: ...,
  upperRadiusLimit: ...,

  // Orbit limits — dev mode (looser)
  dev_lowerBetaLimit: 0,
  dev_upperBetaLimit: Math.PI,
  dev_lowerRadiusLimit: 1,
  dev_upperRadiusLimit: 200,

  // Input sensitivity
  wheelPrecision: ...,
  pinchPrecision: ...,
  panningSensibility: ...,

  // Clip
  minZ: ...,
},

flyTo: {
  defaultDuration: 2.2,          // seconds
  easing: 'power2.inOut',
  arcRadiusMultiplier: 1.4,      // how much radius swells at arc midpoint
  arcMidpointProgress: 0.5,      // where in the tween the arc peak occurs
},

intro: {
  htmlFadeDuration: 1200,        // ms
  pauseBeforePullDown: 400,      // ms
  pullDownDuration: 3000,        // ms
  pullDownEasing: 'power2.inOut',
  skyCamera: {                   // starting position (looking at sky)
    alpha: ...,
    beta: ...,
    radius: ...,
    target: { x: 0, y: 0, z: 0 },
  },
  beachCloseupShot: {            // ending position (two characters)
    alpha: ...,
    beta: ...,
    radius: ...,
    target: { x: ..., y: ..., z: ... },
  },
},

pins: {
  bobbingAmplitude: 0.08,        // world units
  bobbingSpeed: 1.4,             // cycles per second
  rotationSpeed: 0.4,            // radians per second
  defaultHitScreenRadius: 52,    // pixels
},
```

---

## Appendix B — Key Principles to Carry Through All Phases

- **Never hardcode magic numbers** in logic files. Every tunable value lives in SETTINGS.
- **Never break the existing scene.** Extend, don't replace. If something already works, wrap it rather than rewrite it.
- **Fail loudly in dev mode, fail silently in release.** Dev mode should throw or log on any unexpected state transition or missing data. Release mode should handle it gracefully.
- **The camera is the storyteller.** Every movement is purposeful. If a transition feels mechanical or rushed, it needs more easing time or a better arc, not a workaround.
- **Mobile is the primary target.** When in doubt about touch vs mouse behaviour, solve for touch first.

